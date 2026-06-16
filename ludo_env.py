"""
Production-ready Gymnasium environment for Ludo game.
Provides a robust interface for reinforcement learning agents with comprehensive
error handling, type safety, logging, and performance optimizations.
"""

import logging
from typing import Any, Dict, List, Optional, Tuple, Union

import numpy as np
from gymnasium import Env, spaces
from numpy.typing import NDArray

from ludo_game import LudoGame  # assumed to be in same package

logger = logging.getLogger(__name__)

# Reward shaping constants
REWARD_INVALID_MOVE: float = -0.1
REWARD_VALID_MOVE: float = 0.0
REWARD_WIN: float = 1.0
REWARD_LOSE: float = -1.0
DICE_ROLL_NONE: int = -1

# Maximum steps per episode to prevent infinite loops
MAX_STEPS: int = 1000

# Default observation dtype
OBS_DTYPE: type = np.float32


class LudoEnv(Env):
    """
    Gymnasium environment that wraps a Ludo game engine.

    The environment controls player 0. Internal game engine manages other players.
    Action space: ``Discrete(4)`` – token index (0-3) chosen by agent.
    Observation space: ``Box`` derived from game board representation.

    Example:
        >>> env = LudoEnv()
        >>> obs, info = env.reset(seed=42)
        >>> action = env.action_space.sample()
        >>> obs, reward, terminated, truncated, info = env.step(action)
    """

    metadata: Dict[str, Any] = {"render_modes": [None]}

    def __init__(self, render_mode: Optional[str] = None) -> None:
        """
        Initialize environment.

        Args:
            render_mode: Not used (kept for Gymnasium compatibility).

        Raises:
            ValueError: If render_mode is invalid (only None accepted).
        """
        if render_mode is not None:
            raise ValueError(
                f"Invalid render_mode: {render_mode}. Only None is supported."
            )

        super().__init__()

        self.render_mode: Optional[str] = render_mode
        self.game: LudoGame = LudoGame()
        self.current_player: int = 0
        self._last_dice: int = DICE_ROLL_NONE
        self._done: bool = False
        self._info: Dict[str, Any] = {}
        self._step_count: int = 0
        self._seed: Optional[int] = None

        # Infer observation shape from a temporary game instance
        try:
            temp_game: LudoGame = LudoGame()
            obs_shape: Tuple[int, ...] = temp_game.get_board_state().shape
            self._obs_shape: Tuple[int, ...] = obs_shape
        except Exception as e:
            logger.error("Failed to get observation shape from LudoGame: %s", e)
            raise RuntimeError("Could not initialize environment: unable to determine observation space size.") from e

        self.observation_space = spaces.Box(
            low=0.0, high=1.0, shape=obs_shape, dtype=OBS_DTYPE
        )
        self.action_space = spaces.Discrete(4)

        logger.info("LudoEnv created - observation shape: %s", obs_shape)

    def _get_observation(self) -> NDArray[np.float32]:
        """
        Retrieve current board state from the game engine.

        Returns:
            NumPy array representing the board state, cast to OBS_DTYPE.

        Raises:
            RuntimeError: If game engine fails to produce a valid state.
        """
        try:
            board: NDArray = self.game.get_board_state()
        except Exception as e:
            logger.error("Failed to get board state from LudoGame: %s", e)
            raise RuntimeError("Game engine error while fetching observation.") from e

        if board.shape != self._obs_shape:
            logger.error(
                "Board shape mismatch: expected %s, got %s",
                self._obs_shape,
                board.shape,
            )
            raise RuntimeError("Observation shape changed unexpectedly.")

        return np.asarray(board, dtype=OBS_DTYPE)

    def reset(
        self,
        seed: Optional[int] = None,
        options: Optional[Dict[str, Any]] = None,
    ) -> Tuple[NDArray[np.float32], Dict[str, Any]]:
        """
        Reset environment to initial state.

        Args:
            seed: Seed for reproducibility (passed to Gymnasium's seeding).
            options: Unused (but validated to be None or dict).

        Returns:
            Tuple of:
                - observation: Initial board state.
                - info: Empty dictionary.

        Raises:
            ValueError: If seed is provided but non-integer.
            TypeError: If options is not a dict or None.
        """
        # Input validation
        if seed is not None and not isinstance(seed, int):
            raise ValueError(
                f"Seed must be integer or None, got {type(seed).__name__}"
            )
        if options is not None and not isinstance(options, dict):
            raise TypeError(
                f"Options must be a dict or None, got {type(options).__name__}"
            )

        super().reset(seed=seed)
        if seed is not None:
            self._seed = seed
            np.random.seed(seed)

        try:
            self.game = LudoGame()
        except Exception as e:
            logger.error("Failed to create new LudoGame instance: %s", e)
            raise RuntimeError("Unable to reset environment.") from e

        self.current_player = 0
        self._last_dice = DICE_ROLL_NONE
        self._done = False
        self._info = {}
        self._step_count = 0

        obs: NDArray[np.float32] = self._get_observation()
        logger.info("Environment reset. Observation shape: %s", obs.shape)
        return obs, {}

    def step(
        self, action: Union[int, np.integer]
    ) -> Tuple[NDArray[np.float32], float, bool, bool, Dict[str, Any]]:
        """
        Execute one step in the environment.

        The environment rolls a dice, computes valid moves for player 0,
        applies the chosen action (token index 0–3) if valid,
        otherwise applies