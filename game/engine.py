"""
Ludo game engine - pure logic, no rendering.
Supports 2-4 players, standard rules, and exposes
a clean interface for the RL environment.
"""

import random
from dataclasses import dataclass, field
from typing import Optional
from enum import Enum


class GamePhase(Enum):
    WAITING = "waiting"
    ROLLING = "rolling"
    MOVING = "moving"
    FINISHED = "finished"


# Board constants
NUM_PLAYERS = 4
PIECES_PER_PLAYER = 4
BOARD_SIZE = 52          # main track squares
HOME_STRETCH = 6         # squares in each player's home column
SAFE_SQUARES = {0, 8, 13, 21, 26, 34, 39, 47}  # absolute board positions

# Each player starts entering the board at a different offset
PLAYER_START_OFFSETS = [0, 13, 26, 39]
PLAYER_COLORS = ["red", "green", "yellow", "blue"]
PLAYER_SLOTS_BY_COUNT = {2: [0, 2], 3: [0, 1, 2], 4: [0, 1, 2, 3]}

def player_slot(player: int, num_players: int = 4) -> int:
    return PLAYER_SLOTS_BY_COUNT.get(num_players, PLAYER_SLOTS_BY_COUNT[4])[player]


@dataclass
class Piece:
    player: int
    index: int           # 0-3 within a player's set
    position: int = -1   # -1 = yard, 0-51 = main track (relative), 52-57 = home stretch
    finished: bool = False
    slot: int = 0          # board quadrant slot: red=0, green=1, yellow=2, blue=3

    @property
    def in_yard(self):
        return self.position == -1

    @property
    def on_board(self):
        return not self.in_yard and not self.finished

    @property
    def in_home_stretch(self):
        return self.position >= BOARD_SIZE

    def absolute_position(self):
        """Convert relative position to absolute board position."""
        if self.in_yard or self.finished:
            return None
        if self.in_home_stretch:
            return None  # private lane
        return (self.position + PLAYER_START_OFFSETS[self.slot]) % BOARD_SIZE


@dataclass
class GameState:
    num_players: int = 4
    pieces: list = field(default_factory=list)
    current_player: int = 0
    dice: int = 0
    phase: GamePhase = GamePhase.ROLLING
    winner: Optional[int] = None
    turn_count: int = 0
    round_count: int = 0
    consecutive_sixes: int = 0
    no_pawn_rolls: int = 0
    history: list = field(default_factory=list)

    def __post_init__(self):
        if not self.pieces:
            self.pieces = [
                Piece(p, i, slot=player_slot(p, self.num_players))
                for p in range(self.num_players)
                for i in range(PIECES_PER_PLAYER)
            ]

    def player_pieces(self, player: int):
        return [p for p in self.pieces if p.player == player]

    def finished_count(self, player: int):
        return sum(1 for p in self.player_pieces(player) if p.finished)

    def is_winner(self, player: int):
        return self.finished_count(player) == PIECES_PER_PLAYER


class LudoGame:
    def __init__(self, num_players: int = 4, rules: dict = None):
        self.num_players = min(max(2, num_players), 4)
        self.rules = {
            "six_to_enter": True,       # need a 6 to leave yard
            "six_extra_turn": True,     # rolling 6 gives extra turn
            "capture_enabled": True,    # landing on opponent sends them home
            "safe_squares": True,       # safe squares protect from capture
            "max_consecutive_sixes": 3, # 3 sixes in a row = forfeit
            "no_pawn_three_rolls": True, # no pawn in play: up to 3 rolls to enter
            **(rules or {})
        }
        self.state = GameState(num_players=self.num_players)

    def roll_dice(self) -> int:
        if self.state.phase != GamePhase.ROLLING:
            raise ValueError("Not in rolling phase")

        value = random.randint(1, 6)
        self.state.dice = value

        if value == 6:
            self.state.consecutive_sixes += 1
        else:
            self.state.consecutive_sixes = 0

        # 3 sixes = forfeit turn
        if self.state.consecutive_sixes >= self.rules["max_consecutive_sixes"]:
            self.state.consecutive_sixes = 0
            self.state.no_pawn_rolls = 0
            self._next_player()
            return value

        self.state.phase = GamePhase.MOVING

        # House rule: if no pawn is in play, the player may roll up to
        # three times to get a pawn out of the yard. Non-six rolls before
        # the third attempt keep the player in the rolling phase.
        if self.rules.get("no_pawn_three_rolls", True):
            has_pawn_in_play = any(
                piece.on_board for piece in self.state.player_pieces(self.state.current_player)
            )
            if not has_pawn_in_play and value != 6:
                self.state.no_pawn_rolls += 1
                if self.state.no_pawn_rolls < 3:
                    self.state.phase = GamePhase.ROLLING
                    return value
                self.state.no_pawn_rolls = 0
                self._next_player()
                return value

        return value

    def get_valid_moves(self) -> list[tuple[int, int]]:
        """
        Returns list of (piece_index, target_position) tuples.
        piece_index is the index in state.pieces for this player's piece.
        """
        if self.state.phase != GamePhase.MOVING:
            return []

        player = self.state.current_player
        dice = self.state.dice
        moves = []

        for piece in self.state.player_pieces(player):
            if piece.finished:
                continue

            if piece.in_yard:
                if dice == 6 and self.rules["six_to_enter"]:
                    moves.append((self._piece_global_idx(piece), 0))
            else:
                new_pos = piece.position + dice

                # Can't overshoot the home
                if new_pos > BOARD_SIZE + HOME_STRETCH - 1:
                    continue
                # Exact roll needed to finish
                if new_pos == BOARD_SIZE + HOME_STRETCH - 1:
                    moves.append((self._piece_global_idx(piece), new_pos))
                    continue

                moves.append((self._piece_global_idx(piece), new_pos))

        return moves

    def apply_move(self, piece_global_idx: int, target_position: int) -> dict:
        """
        Apply a move. Returns a result dict with events that occurred.
        """
        if self.state.phase != GamePhase.MOVING:
            raise ValueError("Not in moving phase")

        piece = self.state.pieces[piece_global_idx]
        events = {"captures": [], "finished": False, "extra_turn": False}

        old_pos = piece.position
        piece.position = target_position

        # Check if finished
        if target_position == BOARD_SIZE + HOME_STRETCH - 1:
            piece.finished = True
            events["finished"] = True
            if self.state.is_winner(piece.player):
                self.state.winner = piece.player
                self.state.phase = GamePhase.FINISHED
                self._record_history(piece_global_idx, old_pos, target_position, events, player=piece.player)
                return events

        # Check captures (only on main track, not home stretch)
        if self.rules["capture_enabled"] and target_position < BOARD_SIZE:
            abs_pos = piece.absolute_position()
            if abs_pos is not None:
                is_safe = self.rules["safe_squares"] and abs_pos in SAFE_SQUARES
                if not is_safe:
                    for other in self.state.pieces:
                        if other.player == piece.player or other.finished or other.in_yard:
                            continue
                        if other.absolute_position() == abs_pos:
                            other.position = -1  # send home
                            events["captures"].append(self._piece_global_idx(other))

        self.state.no_pawn_rolls = 0

        # Record the committed move before advancing the active player.
        # Otherwise a non-extra-turn move is incorrectly attributed to the next player.
        if self.state.dice == 6 and self.rules["six_extra_turn"]:
            events["extra_turn"] = True
            self.state.phase = GamePhase.ROLLING
            self._record_history(piece_global_idx, old_pos, target_position, events, player=piece.player)
        else:
            self._record_history(piece_global_idx, old_pos, target_position, events, player=piece.player)
            self._next_player()

        self.state.turn_count += 1
        return events

    def skip_turn(self):
        """Called when player has no valid moves."""
        self.state.no_pawn_rolls = 0
        self._next_player()

    def _next_player(self):
        next_player = (self.state.current_player + 1) % self.num_players
        if next_player == 0:
            self.state.round_count += 1
        self.state.current_player = next_player
        self.state.phase = GamePhase.ROLLING
        self.state.consecutive_sixes = 0
        self.state.no_pawn_rolls = 0

    def _piece_global_idx(self, piece: Piece) -> int:
        return self.state.pieces.index(piece)

    def _record_history(self, piece_idx, old_pos, new_pos, events, player=None):
        self.state.history.append({
            "turn": self.state.turn_count,
            "round": self.state.round_count,
            "player": self.state.current_player if player is None else player,
            "dice": self.state.dice,
            "piece": piece_idx,
            "from": old_pos,
            "to": new_pos,
            "events": events
        })

    def to_dict(self) -> dict:
        """Serialize full game state for the frontend."""
        return {
            "num_players": self.num_players,
            "current_player": self.state.current_player,
            "dice": self.state.dice,
            "phase": self.state.phase.value,
            "winner": self.state.winner,
            "turn_count": self.state.turn_count,
            "round_count": self.state.round_count,
            "no_pawn_rolls": self.state.no_pawn_rolls,
            "history": self.state.history,
            "players": [
                {
                    "index": p,
                    "color": PLAYER_COLORS[player_slot(p, self.num_players)],
                    "finished_pieces": self.state.finished_count(p),
                    "pieces": [
                        {
                            "index": piece.index,
                            "position": piece.position,
                            "finished": piece.finished,
                            "in_yard": piece.in_yard,
                            "absolute_position": piece.absolute_position()
                        }
                        for piece in self.state.player_pieces(p)
                    ]
                }
                for p in range(self.num_players)
            ],
            "valid_moves": [
                {"piece_idx": m[0], "target": m[1]}
                for m in self.get_valid_moves()
            ]
        }
