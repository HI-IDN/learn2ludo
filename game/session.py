from dataclasses import dataclass
from datetime import datetime, timezone
from game.engine import LudoGame, GameConfig, BoardConfig, Phase
from game.gameplay import Gameplay, Piece

_COLORS = ['red', 'green', 'yellow', 'blue', 'orange', 'purple']
_PAWN_PREFIX = {
    'red': 'R',
    'green': 'G',
    'yellow': 'Y',
    'blue': 'B',
    'orange': 'O',
    'purple': 'P',
}


def pawn_id(color: str, pawn_index: int) -> str:
    prefix = _PAWN_PREFIX.get(str(color).lower(), str(color)[:1].upper())
    return f"{prefix}{pawn_index + 1}"


class GameSession:
    def __init__(self, cfg: GameConfig, max_yard_rolls: int = 3, starting_player: int = 0, equal_rounds: bool = False):
        self.game = LudoGame(cfg)
        self.game.player = max(0, min(starting_player, cfg.player_count - 1))
        self.gp   = Gameplay(self.game)
        self.history: list = []
        self.winner  = None
        self.winners: list = []
        self.equal_rounds         = equal_rounds
        self._finishing_round_player = None  # first finisher in equal-rounds mode
        self._finishing_round_wrapped = False
        self.max_yard_rolls   = max(1, max_yard_rolls)
        self._yard_roll_count = 0
        self.starting_player  = self.game.player
        self.round_count      = 1
        self._move_counts: dict[int, int] = {}
        self._leader_move_counts: dict[int, int] = {}
        self.history.append({
            "type": "game_start",
            "player": self.starting_player,
            "color": self._color_for_player(self.starting_player),
        })

    def _next_turn(self):
        """Advance to the next player and increment round when starting player comes back."""
        self.game.next()
        if self.game.player == self.starting_player:
            self.round_count += 1
            if self._finishing_round_player is not None:
                self._finishing_round_wrapped = True
        if (
            self._finishing_round_player is not None
            and self._finishing_round_wrapped
            and self.game.player == self._finishing_round_player
        ):
            self.winners = [p for p in range(self.game.config.player_count)
                            if all(pc.finished for pc in self.gp.pieces if pc.player == p)]
            self.winner = self._finishing_round_player
            self.game.phase = Phase.FINISHED
            self._append_winner_history()

    # ---- public API -------------------------------------------------------

    def _all_in_yard(self, player_idx: int) -> bool:
        return all(p.pos == -1 for p in self.gp.pieces if p.player == player_idx)

    def roll_dice(self) -> int:
        value = self.game.roll()          # phase → MOVING, last_roll = value
        valid = self.gp.valid_moves(self.game.player)
        blocked = self._blocked_pawns_with_ids(self.game.player)

        if not valid and self._all_in_yard(self.game.player):
            self._yard_roll_count += 1
            self.history.append({
                "player":       self.game.player,
                "piece":        None,
                "from":         None,
                "to":           None,
                "dice":         value,
                "type":         "yard_roll",
                "attempt":      self._yard_roll_count,
                "max_attempts": self.max_yard_rolls,
            })
            if self._yard_roll_count < self.max_yard_rolls:
                self.game.phase = Phase.ROLLING   # stay — player rolls again
            else:
                self._yard_roll_count = 0
                self.game.end_move()
                if self.game.phase == Phase.NEXT:
                    self._next_turn()
        elif not valid:
            self._yard_roll_count = 0
            blocker = self.gp.find_blocker(self.game.player)
            no_exact = blocker is None and not self._all_in_yard(self.game.player)
            self.history.append({
                "player":        self.game.player,
                "dice":          value,
                "type":          "roll",
                "no_exact_roll": no_exact,
                "blocked_pawns": blocked,
            })
            if blocker is not None:
                self.history.append({
                    "type":       "blocked",
                    "player":     self.game.player,
                    "blocked_by": blocker,
                })
            self.game.end_move()
            if self.game.phase == Phase.NEXT:
                self._next_turn()
        else:
            self._yard_roll_count = 0
            self.history.append({
                "player":        self.game.player,
                "dice":          value,
                "type":          "roll",
                "valid_moves":   self._valid_moves_list(),
                "blocked_pawns": blocked,
            })
            self._log_safe_haven_events(self.game.player, valid)

        return value

    def apply_move(
        self,
        piece_idx: int | None,
        target: int,
        pawn_id_value: str | None = None,
        justification: str | None = None,
    ) -> dict:
        pawns = self.game.config.board.pawns_per_player
        pi, lidx = self._resolve_piece_ref(piece_idx=piece_idx, pawn_id_value=pawn_id_value)
        pc = [p for p in self.gp.pieces if p.player == pi][lidx]
        piece_idx = self._global_piece_idx(pi, lidx)
        moving_pawn_id = self._pawn_id_for_piece(pi, lidx)
        from_pos = pc.pos

        # Track whether player moved their furthest-ahead pawn (for risk_score)
        active = [p for p in self.gp.pieces if p.player == pi and not p.finished and p.pos >= 0]
        is_leader_move = bool(active) and pc.pos == max(p.pos for p in active)
        self._move_counts[pi] = self._move_counts.get(pi, 0) + 1
        self._leader_move_counts[pi] = self._leader_move_counts.get(pi, 0) + (1 if is_leader_move else 0)

        captured = self.gp.move(pc)
        self.history.append({
            "type": "move",
            "player": pi,
            "piece": piece_idx,
            "pawn_id": moving_pawn_id,
            "from": from_pos,
            "to": pc.pos,
            "justification": justification,
            "timestamp": self._timestamp(),
        })

        # Log each capture as a separate history event
        for cap in captured:
            cap_pieces = [p for p in self.gp.pieces if p.player == cap.player]
            cap_lidx   = next(i for i, p in enumerate(cap_pieces) if p is cap)
            cap_gidx   = cap.player * pawns + cap_lidx
            cap_slot   = self.game.slots[pi]
            abs_cell   = (pc.pos + self.game.board.starts[cap_slot]) % self.game.board.track_size
            self.history.append({
                "type":             "capture",
                "captured_player":  cap.player,
                "captured_piece":   cap_gidx,
                "captured_pawn_id": self._pawn_id_for_piece(cap.player, cap_lidx),
                "by_player":        pi,
                "by_piece":         piece_idx,
                "by_pawn_id":       moving_pawn_id,
                "cell":             abs_cell,
            })
        # blockade_formed: destination now has ≥2 friendly pawns
        if pc.pos >= 0 and not pc.finished:
            friendly_at_dest = sum(
                1 for p in self.gp.pieces
                if p.player == pi and p.pos == pc.pos and not p.finished
            )
            if friendly_at_dest >= 2:
                self.history.append({
                    "type":    "blockade_formed",
                    "player":  pi,
                    "piece":   piece_idx,
                    "pawn_id": moving_pawn_id,
                    "cell":    pc.pos,
                })

        w = self.gp.has_winner()
        if w is not None and self._finishing_round_player is None:
            if self.equal_rounds:
                self._finishing_round_player = w
            else:
                self.winners = [w]
                self.winner  = w
                self.game.phase = Phase.FINISHED
                self._append_winner_history()
                return {}
        if self.game.phase == Phase.NEXT:
            self._next_turn()
        return {}

    def skip_turn(self):
        if self.game.phase == Phase.MOVING:
            self.game.end_move()
        if self.game.phase == Phase.NEXT:
            self._next_turn()

    def to_dict(self) -> dict:
        g   = self.game
        n   = g.config.player_count
        vm  = self._valid_moves_list()

        players = []
        for pi in range(n):
            slot   = g.slots[pi]
            pieces = [p for p in self.gp.pieces if p.player == pi]
            players.append({
                "index": pi,
                "color": _COLORS[slot],
                "pieces": [self._piece_dict(pc, i, slot) for i, pc in enumerate(pieces)],
            })

        return {
            "config": {
                "player_count": n,
                "board": {
                    "track_size":      g.board.track_size,
                    "yard_count":      g.board.yard_count,
                    "home_length":     g.config.board.home_length,
                    "safe_offset":     g.config.board.safe_offset,
                    "pawns_per_player": g.config.board.pawns_per_player,
                },
            },
            "slots":          list(g.slots),
            "board": {
                "track_size":  g.board.track_size,
                "yard_count":  g.board.yard_count,
                "starts":      list(g.board.starts),
                "finishes":    list(g.board.finishes),
                "safe_havens": list(g.board.safe_havens),
            },
            "players":        players,
            "current_player": g.player,
            "phase":          g.phase.value,
            "dice":           g.last_roll or 0,
            "last_roll":      g.last_roll or 0,
            "valid_moves":    vm,
            "history":          self.history,
            "starting_player":  self.starting_player,
            "starting_player_color": self._color_for_player(self.starting_player),
            "winner":           self.winner,
            "winners":          self.winners,
            "winner_color":     self._color_for_player(self.winner) if self.winner is not None else None,
            "winner_colors":    [self._color_for_player(w) for w in self.winners],
            "num_players":      n,
            "round_count":      self.round_count,
            "yard_roll_count":  self._yard_roll_count,
            "max_yard_rolls":   self.max_yard_rolls,
        }

    # ---- helpers ----------------------------------------------------------

    def _piece_dict(self, pc: Piece, local_idx: int, slot: int) -> dict:
        g = self.game
        pos = pc.pos
        abs_pos = None
        if not pc.finished and pos >= 0 and pos < g.board.track_size - 1:
            abs_pos = (pos + g.board.starts[slot]) % g.board.track_size
        return {
            "index":             local_idx,
            "pawn_id":           pawn_id(_COLORS[slot], local_idx),
            "position":          pos,
            "in_yard":           pos == -1,
            "finished":          pc.finished,
            "absolute_position": abs_pos,
        }

    def _valid_moves_list(self) -> list:
        g = self.game
        if g.phase != Phase.MOVING:
            return []
        moves = []
        for pc in self.gp.valid_moves(g.player):
            pi           = pc.player
            player_pieces = [p for p in self.gp.pieces if p.player == pi]
            # Use identity (is), not equality (==), so two pawns with the
            # same pos (e.g. both in the yard at pos=-1) are kept distinct.
            lidx = next(i for i, p in enumerate(player_pieces) if p is pc)
            gidx = pi * g.config.board.pawns_per_player + lidx
            tgt  = 0 if pc.pos == -1 else pc.pos + g.last_roll
            moves.append({
                "piece_idx": gidx,
                "pawn_id": self._pawn_id_for_piece(pi, lidx),
                "from": pc.pos,
                "target": tgt,
            })
        return moves

    def _pawn_id_for_piece(self, player_idx: int, local_idx: int) -> str:
        slot = self.game.slots[player_idx]
        return pawn_id(_COLORS[slot], local_idx)

    def _timestamp(self) -> str:
        return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")

    def _color_for_player(self, player_idx: int | None) -> str | None:
        if player_idx is None:
            return None
        slot = self.game.slots[player_idx]
        return _COLORS[slot]

    def _append_winner_history(self):
        if any(e.get("type") == "game_winner" for e in self.history):
            return
        self.history.append({
            "type": "game_winner",
            "player": self.winner,
            "color": self._color_for_player(self.winner),
            "winners": list(self.winners),
            "winner_colors": [self._color_for_player(w) for w in self.winners],
        })

    def _global_piece_idx(self, player_idx: int, local_idx: int) -> int:
        return player_idx * self.game.config.board.pawns_per_player + local_idx

    def _blocked_pawns_with_ids(self, player_idx: int) -> list:
        blocked = self.gp.per_piece_block_reasons(player_idx)
        result = []
        for entry in blocked:
            local_idx = entry.get("piece")
            result.append({
                **entry,
                "pawn_id": self._pawn_id_for_piece(player_idx, local_idx),
            })
        return result

    def _log_safe_haven_events(self, player: int, valid_pieces: list):
        """Emit almost_capture and safe_haven_protected for each valid move that
        would land on an opponent pawn sitting on a safe haven."""
        g = self.game
        r = g.last_roll
        slot = g.slots[player]
        safe = g.board.safe_havens

        for pc in valid_pieces:
            if pc.pos == -1:
                target_pos = 0
            else:
                target_pos = pc.pos + r
            if target_pos >= g.board.track_size - 1:
                continue
            abs_target = (target_pos + g.board.starts[slot]) % g.board.track_size
            if abs_target not in safe:
                continue
            # Find opponent pawns sitting on this safe haven
            for opp in g.board.safe_havens:
                if opp != abs_target:
                    continue
                targets = [
                    o for o in self.gp.pieces
                    if o.player != player and o.pos >= 0
                    and o.pos < g.board.track_size - 1
                    and self.gp._abs(o) == abs_target
                ]
                for opp_pc in targets:
                    opp_pieces = [p for p in self.gp.pieces if p.player == opp_pc.player]
                    opp_lidx = next(i for i, p in enumerate(opp_pieces) if p is opp_pc)
                    opp_gidx = opp_pc.player * g.config.board.pawns_per_player + opp_lidx
                    opp_pawn = self._pawn_id_for_piece(opp_pc.player, opp_lidx)
                    player_pieces = [p for p in self.gp.pieces if p.player == player]
                    pc_lidx = next(i for i, p in enumerate(player_pieces) if p is pc)
                    self.history.append({
                        "type":           "almost_capture",
                        "attacker":       player,
                        "attacker_pawn_id": self._pawn_id_for_piece(player, pc_lidx),
                        "target_player":  opp_pc.player,
                        "target_piece":   opp_gidx,
                        "target_pawn_id": opp_pawn,
                        "cell":           abs_target,
                    })
                    self.history.append({
                        "type":       "safe_haven_protected",
                        "player":     opp_pc.player,
                        "piece":      opp_gidx,
                        "pawn_id":    opp_pawn,
                        "cell":       abs_target,
                        "attacker":   player,
                    })

    def compute_player_stats(self) -> list:
        """Derive per-player stats from history. Returns a list indexed by player."""
        n = self.game.config.player_count
        stats = [{
            "player": i,
            "color": self._color_for_player(i),
            "rolls": 0,
            "dice_distribution": {str(k): 0 for k in range(1, 7)},
            "dice_total": 0,
            "sixes": 0,
            "captures_made": 0,
            "captures_suffered": 0,
            "blockades_formed": 0,
            "times_blocked": 0,
            "almost_captures": 0,
            "times_safe_haven_protected": 0,
            "turns_skipped": 0,
            "pawns_finished": 0,
            # for axis computation
            "_moves": 0,
            "_leader_moves": 0,
        } for i in range(n)]

        for ev in self.history:
            t = ev.get("type")
            p = ev.get("player")

            if t in ("roll", "yard_roll") and p is not None:
                s = stats[p]
                s["rolls"] += 1
                d = ev.get("dice", 0)
                s["dice_total"] += d
                s["dice_distribution"][str(d)] = s["dice_distribution"].get(str(d), 0) + 1
                if d == 6:
                    s["sixes"] += 1
                if t == "roll" and not ev.get("valid_moves") and not ev.get("blocked_pawns"):
                    s["turns_skipped"] += 1

            elif t == "capture":
                stats[ev["by_player"]]["captures_made"] += 1
                stats[ev["captured_player"]]["captures_suffered"] += 1

            elif t == "blockade_formed" and p is not None:
                stats[p]["blockades_formed"] += 1

            elif t == "blocked" and p is not None:
                stats[p]["times_blocked"] += 1

            elif t == "almost_capture":
                stats[ev["attacker"]]["almost_captures"] += 1

            elif t == "safe_haven_protected":
                stats[ev["player"]]["times_safe_haven_protected"] += 1

            elif t == "move" and p is not None:
                stats[p]["_moves"] += 1

        # Compute pawns finished
        pawns_per = self.game.config.board.pawns_per_player
        for i in range(n):
            finished = sum(1 for pc in self.gp.pieces if pc.player == i and pc.finished)
            stats[i]["pawns_finished"] = finished

        # Derived fields
        for s in stats:
            rolls = s["rolls"]
            s["dice_avg"] = round(s["dice_total"] / rolls, 3) if rolls else 0
            s["luck_score"] = round(s["dice_avg"] - 3.5, 3)
            s["sixes_pct"] = round(s["sixes"] / rolls * 100, 1) if rolls else 0
            # aggression: captures / (captures + thwarted-by-safe-haven)
            opps = s["captures_made"] + s["almost_captures"]
            s["aggression_score"] = round(s["captures_made"] / opps, 3) if opps else 0.5
            i = s["player"]
            moves = self._move_counts.get(i, 0)
            leader = self._leader_move_counts.get(i, 0)
            s["risk_score"] = round(leader / moves, 3) if moves else None
            del s["_moves"]
            del s["_leader_moves"]

        return stats

    def _resolve_piece_ref(self, piece_idx: int | None, pawn_id_value: str | None) -> tuple[int, int]:
        pawns = self.game.config.board.pawns_per_player
        if pawn_id_value:
            target = str(pawn_id_value).upper()
            for pi in range(self.game.config.player_count):
                for lidx in range(pawns):
                    if self._pawn_id_for_piece(pi, lidx).upper() == target:
                        return pi, lidx
            raise ValueError(f"Unknown pawn_id: {pawn_id_value}")

        if piece_idx is None:
            raise ValueError("piece_idx or pawn_id is required")

        pi = piece_idx // pawns
        lidx = piece_idx % pawns
        if pi < 0 or pi >= self.game.config.player_count:
            raise ValueError(f"Invalid piece_idx: {piece_idx}")
        return pi, lidx
