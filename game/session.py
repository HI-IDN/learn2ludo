from dataclasses import dataclass
from game.engine import LudoGame, GameConfig, BoardConfig, Phase
from game.gameplay import Gameplay, Piece

_COLORS = ['red', 'green', 'yellow', 'blue', 'orange', 'purple']


class GameSession:
    def __init__(self, cfg: GameConfig, max_yard_rolls: int = 3, starting_player: int = 0):
        self.game = LudoGame(cfg)
        self.game.player = max(0, min(starting_player, cfg.player_count - 1))
        self.gp   = Gameplay(self.game)
        self.history: list = []
        self.winner = None
        self.max_yard_rolls   = max(1, max_yard_rolls)
        self._yard_roll_count = 0   # attempts used this turn (all pawns in yard)
        self.starting_player  = self.game.player
        self.round_count      = 1

    def _next_turn(self):
        """Advance to the next player and increment round when starting player comes back."""
        self.game.next()
        if self.game.player == self.starting_player:
            self.round_count += 1

    # ---- public API -------------------------------------------------------

    def _all_in_yard(self, player_idx: int) -> bool:
        return all(p.pos == -1 for p in self.gp.pieces if p.player == player_idx)

    def roll_dice(self) -> int:
        value = self.game.roll()          # phase → MOVING, last_roll = value
        valid = self.gp.valid_moves(self.game.player)

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
            self.history.append({"player": self.game.player, "dice": value, "type": "roll"})
            blocker = self.gp.find_blocker(self.game.player)
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
            self.history.append({"player": self.game.player, "dice": value, "type": "roll",
                                  "valid_moves": self._valid_moves_list()})

        return value

    def apply_move(self, piece_idx: int, target: int) -> dict:
        pawns    = self.game.config.board.pawns_per_player
        pi       = piece_idx // pawns
        lidx     = piece_idx  % pawns
        pc       = [p for p in self.gp.pieces if p.player == pi][lidx]
        from_pos = pc.pos
        captured = self.gp.move(pc)
        self.history.append({"player": pi, "piece": piece_idx, "from": from_pos, "to": pc.pos})

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
                "by_player":        pi,
                "cell":             abs_cell,
            })
        w = self.gp.has_winner()
        if w is not None:
            self.winner = w
            self.game.phase = Phase.FINISHED
        elif self.game.phase == Phase.NEXT:
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
            "winner":           self.winner,
            "num_players":      n,
            "round_count":      self.round_count,
            "yard_roll_count":  self._yard_roll_count,
            "max_yard_rolls":   self.max_yard_rolls,
        }

    # ---- helpers ----------------------------------------------------------

    def _piece_dict(self, pc: Piece, local_idx: int, slot: int) -> dict:
        g   = self.game
        pos = pc.pos
        abs_pos = None
        if not pc.finished and pos >= 0 and pos < g.board.track_size:
            abs_pos = (pos + g.board.starts[slot]) % g.board.track_size
        return {
            "index":             local_idx,
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
            moves.append({"piece_idx": gidx, "from": pc.pos, "target": tgt})
        return moves
