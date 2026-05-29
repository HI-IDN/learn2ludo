from dataclasses import dataclass
from game.engine import LudoGame, GameConfig, BoardConfig, Phase
from game.gameplay import Gameplay, Piece

_COLORS = ['red', 'green', 'yellow', 'blue', 'orange', 'purple']


class GameSession:
    def __init__(self, cfg: GameConfig):
        self.game = LudoGame(cfg)
        self.gp   = Gameplay(self.game)
        self.history: list = []
        self.winner = None

    # ---- public API -------------------------------------------------------

    def roll_dice(self) -> int:
        value = self.game.roll()
        if not self.gp.valid_moves(self.game.player):
            self.game.end_move()
            if self.game.phase == Phase.NEXT:
                self.game.next()
        return value

    def apply_move(self, piece_idx: int, target: int) -> dict:
        pawns = self.game.config.board.pawns_per_player
        pi   = piece_idx // pawns
        lidx = piece_idx  % pawns
        pc   = [p for p in self.gp.pieces if p.player == pi][lidx]
        from_pos = pc.pos
        self.gp.move(pc)
        self.history.append({"player": pi, "piece": piece_idx, "from": from_pos, "to": pc.pos})
        w = self.gp.has_winner()
        if w is not None:
            self.winner = w
            self.game.phase = Phase.FINISHED
        elif self.game.phase == Phase.NEXT:
            self.game.next()
        return {}

    def skip_turn(self):
        if self.game.phase == Phase.MOVING:
            self.game.end_move()
        if self.game.phase == Phase.NEXT:
            self.game.next()

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
            "history":        self.history,
            "winner":         self.winner,
            "num_players":    n,
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
            pi   = pc.player
            lidx = [p for p in self.gp.pieces if p.player == pi].index(pc)
            gidx = pi * g.config.board.pawns_per_player + lidx
            tgt  = 0 if pc.pos == -1 else pc.pos + g.last_roll
            moves.append({"piece_idx": gidx, "target": tgt})
        return moves
