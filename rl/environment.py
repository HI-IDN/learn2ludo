"""
Minimal RL stub for Learn2Ludo.

Keeps API stable for UI, but does NOT depend on full engine integration yet.
Safe to use while RL is not implemented.
"""

import random
import numpy as np
from typing import Optional
from game.engine import LudoGame


# ---------------------------------------------------------------------------
# Environment (STUB)
# ---------------------------------------------------------------------------

class LudoEnv:
    def __init__(
        self,
        agent_player: int = 0,
        num_players: int = 4,
        opponent_policy=None,
        reward_config: dict = None,
        game_rules: dict = None,
    ):
        self.agent_player = agent_player
        self.num_players = num_players
        self.opponent_policy = opponent_policy or random_policy

        self.game: Optional[LudoGame] = None

        # stub stats
        self.episode_rewards = []
        self.total_episodes = 0
        self.total_steps = 0

        self.observation_size = 10
        self.max_actions = 4

    def reset(self):
        self.game = LudoGame(
            self._make_config()
        )
        self.episode_rewards = []
        self.total_episodes += 1
        return self._get_observation()

    def step(self, action: int):
        # stub behavior (no full gameplay integration yet)
        reward = 0.0
        done = random.random() < 0.01  # random episode end

        self.episode_rewards.append(reward)
        self.total_steps += 1

        return self._get_observation(), reward, done, {}

    def _make_config(self):
        from game.engine import GameConfig, BoardConfig
        return GameConfig(BoardConfig(40, 4), self.num_players)

    def _get_observation(self) -> np.ndarray:
        return np.zeros(self.observation_size, dtype=np.float32)

    def get_stats(self) -> dict:
        return {
            "total_episodes": self.total_episodes,
            "total_steps": self.total_steps,
            "last_episode_reward": sum(self.episode_rewards) if self.episode_rewards else 0,
        }


# ---------------------------------------------------------------------------
# Opponents (still usable)
# ---------------------------------------------------------------------------

def random_policy(valid_moves, game):
    if not valid_moves:
        return None
    return random.choice(valid_moves)


def greedy_policy(valid_moves, game):
    return random_policy(valid_moves, game)


OPPONENT_POLICIES = {
    "random": random_policy,
    "greedy": greedy_policy,
}


# ---------------------------------------------------------------------------
# Training session (UI-compatible stub)
# ---------------------------------------------------------------------------

class TrainingSession:
    def __init__(self, env: LudoEnv, algorithm: str = "random"):
        self.env = env
        self.algorithm = algorithm
        self.is_running = False

        self.progress = {
            "episode": 0,
            "total_episodes": 0,
            "win_rate": 0.0,
            "avg_reward": 0.0,
            "recent_rewards": [],
            "wins": 0,
        }

    def run_episode(self):
        obs = self.env.reset()
        done = False

        while not done:
            action = random.randint(0, self.env.max_actions - 1)
            obs, reward, done, _ = self.env.step(action)

        self.progress["episode"] += 1
        self.progress["total_episodes"] += 1

    def get_progress(self) -> dict:
        return dict(self.progress)
