import logging
import random
from typing import List, Optional, Tuple, Dict, Any, Sequence, Final, Union
import numpy as np

# Configure module logger
logger = logging.getLogger(__name__)


class LudoGame:
    """
    Production-ready Ludo game engine supporting 4 players, each with 1 token.
    Designed for RL integration with full error handling, validation, and logging.

    Board positions:
        -1   : base (token not yet on board)
        0-51 : main track (52 cells, shared)
        52-57: home stretch (6 cells, player-specific)
        58   : home (final position)

    Movement rules:
        - Roll 6 to move token from base to start cell.
        - Tokens move clockwise along main track (0->1->...->51->0).
        - After completing a full lap (reaching the cell just before start), token enters home stretch.
        - Home stretch is 6 cells; token must land exactly on home (58) by exact dice count.
        - If a token lands on an opponent token (not on home stretch), opponent is sent back to base.
        - Landing on own token is not allowed (invalid move) in this simplified version.

    Episode ends when any token reaches home (winner determined).
    """

    # Constants
    BOARD_SIZE: Final[int] = 52
    HOME_STRETCH_SIZE: Final[int] = 6
    PLAYERS: Final[int] = 4
    TOKENS_PER_PLAYER: Final[int] = 1
    BASE_POSITION: Final[int] = -1
    HOME_POSITION: Final[int] = 58
    DICE_SIDES: Final[int] = 6
    PLAYER_START_CELLS: Final[List[int]] = [0, 13, 26, 39]
    PLAYER_HOME_STRETCH_ENTRY: Final[List[int]] = [
        51, 12, 25, 38
    ]  # cell before entering home stretch

    # Rewards (external use)
    CAPTURE_REWARD: Final[float] = 0.5
    WIN_REWARD: Final[float] = 10.0
    MOVE_REWARD: Final[float] = 0.0
    INVALID_ACTION_PENALTY: Final[float] = -1.0

    def __init__(self, seed: Optional[int] = None) -> None:
        """
        Initialize game state with all tokens in base.

        Args:
            seed: Optional random seed for reproducibility.
        """
        self._rng = random.Random(seed) if seed is not None else random.Random()
        self.tokens: List[List[int]] = self._init_tokens()
        self.current_player: int = 0
        self.dice_value: Optional[int] = None
        self.winner: Optional[int] = None
        self.last_action_moved: bool = False
        self._game_over: bool = False
        self.move_count: int = 0
        logger.debug("LudoGame initialized for %d players, %d token(s) each",
                     self.PLAYERS, self.TOKENS_PER_PLAYER)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------
    def _init_tokens(self) -> List[List[int]]:
        """
        Return initial token positions: all tokens in base.

        Returns:
            List of lists: tokens[player][token] = BASE_POSITION.
        """
        return [[self.BASE_POSITION for _ in range(self.TOKENS_PER_PLAYER)]
                for _ in range(self.PLAYERS)]

    def _validate_player(self, player: int) -> None:
        """Validate player index (0..PLAYERS-1)."""
        if not isinstance(player, int):
            raise TypeError(f"Player index must be int, got {type(player).__name__}")
        if player < 0 or player >= self.PLAYERS:
            raise ValueError(
                f"Player index must be 0-{self.PLAYERS-1}, got {player}")

    def _validate_token(self, player: int, token: int) -> None:
        """Validate token index for a player (0..TOKENS_PER_PLAYER-1)."""
        if not isinstance(player, int):
            raise TypeError(f"Player index must be int, got {type(player).__name__}")
        if not isinstance(token, int):
            raise TypeError(f"Token index must be int, got {type(token).__name__}")
        if player < 0 or player >= self.PLAYERS:
            raise ValueError(
                f"Player index must be 0-{self.PLAYERS-1}, got {player}")
        if token < 0 or token >= self.TOKENS_PER_PLAYER:
            raise ValueError(
                f"Token index must be 0-{self.TOKENS_PER_PLAYER-1}, got {token}")

    # ------------------------------------------------------------------
    # Board state queries
    # ------------------------------------------------------------------
    def _is_occupied_by_any(self, position: int) -> bool:
        """
        Check if any token occupies the given board position.

        Args:
            position: Board position (0..57) or HOME_POSITION.

        Returns:
            True if occupied, False otherwise.
        """
        for player_tokens in self.tokens:
            for pos in player_tokens:
                if pos == position:
                    return True
        return False

    def _is_occupied_by_own(self, player: int, position: int) -> bool:
        """
        Check if the given player owns a token at the given position.

        Args:
            player: Player index.
            position: Board position.

        Returns:
            True if own token occupies position.
        """
        for token_idx in range(self.TOKENS_PER_PLAYER):
            if self.tokens[player][token_idx] == position:
                return True
        return False

    def _is_occupied_by_opponent(self, player: int, position: int) -> bool:
        """
        Check if any opponent token occupies the given position.

        Args:
            player: Player index.
            position: Board position.

        Returns:
            True if opponent token occupies position.
        """
        for other in range(self.PLAYERS):
            if other == player:
                continue
            for token_idx in range(self.TOKENS_PER_PLAYER):
                if self.tokens[other][token_idx] == position:
                    return True
        return False

    def get_occupied_positions(self) -> Dict[int, Tuple[int, int]]:
        """
        Return a mapping from board position to (player, token).

        Returns:
            Dictionary: position -> (player, token_index).
        """
        occupied: Dict[int, Tuple[int, int]] = {}
        for p in range(self.PLAYERS):
            for t in range(self.TOKENS_PER_PLAYER):
                pos = self.tokens[p][t]
                if pos != self.BASE_POSITION and pos != self.HOME_POSITION:
                    occupied[pos] = (p, t)
        return occupied

    # ------------------------------------------------------------------
    # Game logic methods
    # ------------------------------------------------------------------
    def roll_d