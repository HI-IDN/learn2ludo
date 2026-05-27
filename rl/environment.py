"""
Reinforcement Learning environment scaffold for Ludo.
Follows a gym-like interface so it's easy to swap in
any RL library (stable-baselines3, RLlib, custom).

State space:  flat vector of piece positions + board context
Action space: discrete - index into valid moves list
Reward:       configurable via reward_config
"""

import numpy as np
from typing import Optional
from game.engine import LudoGame, BOARD_SIZE, HOME_STRETCH, PIECES_PER_PLAYER


class LudoEnv:
    """
    Single-agent RL environment. The agent controls one player;
    all other players use a configurable opponent policy.
    """

    DEFAULT_REWARDS = {
        "win": 100.0,
        "lose": -100.0,
        "capture": 10.0,
        "get_captured": -10.0,
        "piece_enter_board": 3.0,
        "piece_advance": 0.1,       # per square advanced
        "piece_finish": 20.0,
        "turn_penalty": -0.01,      # encourages efficiency
    }

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
        self.rewards = {**self.DEFAULT_REWARDS, **(reward_config or {})}
        self.game_rules = game_rules or {}

        self.game: Optional[LudoGame] = None
        self.episode_rewards = []
        self.total_episodes = 0
        self.total_steps = 0

        # State vector length:
        # 4 pieces × 4 players = 16 positions (normalised)
        # + current player one-hot (4)
        # + dice value normalised (1)
        # = 21
        self.observation_size = 21
        self.max_actions = PIECES_PER_PLAYER  # at most 4 pieces to choose from

    def reset(self):
        self.game = LudoGame(self.num_players, self.game_rules)
        self.episode_rewards = []
        self.total_episodes += 1
        # Advance until it's the agent's turn
        self._run_opponents_until_agent()
        return self._get_observation()

    def step(self, action: int):
        """
        action: index into valid_moves list (0 to 3)
        Returns: (observation, reward, done, info)
        """
        valid_moves = self.game.get_valid_moves()
        reward = self.rewards["turn_penalty"]
        info = {}

        if not valid_moves:
            self.game.skip_turn()
        else:
            action = min(action, len(valid_moves) - 1)
            piece_idx, target = valid_moves[action]
            piece_before = self.game.state.pieces[piece_idx].position
            events = self.game.apply_move(piece_idx, target)

            reward += self._calculate_reward(events, piece_before, target)
            info = events

        done = self.game.state.winner is not None

        if done:
            if self.game.state.winner == self.agent_player:
                reward += self.rewards["win"]
            else:
                reward += self.rewards["lose"]

        self.episode_rewards.append(reward)
        self.total_steps += 1

        if not done:
            self._run_opponents_until_agent()

        obs = self._get_observation()
        return obs, reward, done, info

    def _calculate_reward(self, events: dict, old_pos: int, new_pos: int) -> float:
        r = 0.0
        if old_pos == -1 and new_pos == 0:
            r += self.rewards["piece_enter_board"]
        elif new_pos > old_pos:
            r += self.rewards["piece_advance"] * (new_pos - old_pos)
        if events.get("finished"):
            r += self.rewards["piece_finish"]
        for cap_idx in events.get("captures", []):
            captured_piece = self.game.state.pieces[cap_idx]
            if captured_piece.player != self.agent_player:
                r += self.rewards["capture"]
            else:
                r += self.rewards["get_captured"]
        return r

    def _run_opponents_until_agent(self):
        """Step through opponent turns until it's the agent's turn."""
        max_steps = 1000  # safety valve
        steps = 0
        while (
            self.game.state.current_player != self.agent_player
            and self.game.state.phase.value in ("rolling", "moving")
            and self.game.state.winner is None
            and steps < max_steps
        ):
            steps += 1
            state = self.game.state
            if state.phase.value == "rolling":
                self.game.roll_dice()
            else:
                moves = self.game.get_valid_moves()
                if not moves:
                    self.game.skip_turn()
                else:
                    piece_idx, target = self.opponent_policy(moves, self.game)
                    self.game.apply_move(piece_idx, target)

    def _get_observation(self) -> np.ndarray:
        obs = np.zeros(self.observation_size, dtype=np.float32)
        total_squares = BOARD_SIZE + HOME_STRETCH

        for p in range(self.num_players):
            for i, piece in enumerate(self.game.state.player_pieces(p)):
                val = -1.0 if piece.in_yard else (
                    1.0 if piece.finished else piece.position / total_squares
                )
                obs[p * PIECES_PER_PLAYER + i] = val

        # current player one-hot
        obs[16 + self.game.state.current_player] = 1.0
        # dice
        obs[20] = self.game.state.dice / 6.0
        return obs

    def get_stats(self) -> dict:
        return {
            "total_episodes": self.total_episodes,
            "total_steps": self.total_steps,
            "last_episode_reward": sum(self.episode_rewards) if self.episode_rewards else 0,
        }


# ---------------------------------------------------------------------------
# Built-in opponent policies
# ---------------------------------------------------------------------------

def random_policy(valid_moves, game):
    """Picks a random valid move."""
    import random
    return random.choice(valid_moves)


def greedy_policy(valid_moves, game):
    """
    Simple heuristic: prefer captures, then finishing, then advancing.
    """
    best_move = valid_moves[0]
    best_score = -999

    for piece_idx, target in valid_moves:
        score = target  # further = better by default
        piece = game.state.pieces[piece_idx]
        # Prefer leaving yard
        if piece.in_yard:
            score += 5
        # Prefer finishing
        if target == BOARD_SIZE + HOME_STRETCH - 1:
            score += 50
        # Check if this lands on an opponent
        # (simplified - full capture check in engine)
        if score > best_score:
            best_score = score
            best_move = (piece_idx, target)

    return best_move


OPPONENT_POLICIES = {
    "random": random_policy,
    "greedy": greedy_policy,
}


# ---------------------------------------------------------------------------
# Training loop scaffold
# ---------------------------------------------------------------------------

class TrainingSession:
    """
    Minimal training loop. Swap in your RL algorithm here.
    Emits progress via a callback so the web UI can poll it.
    """

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
        self._wins = 0
        self._recent_rewards = []

    def run_episode(self):
        obs = self.env.reset()
        done = False
        while not done:
            # TODO: replace with real RL agent action selection
            # For now: random action
            import random
            action = random.randint(0, self.env.max_actions - 1)
            obs, reward, done, info = self.env.step(action)

        ep_reward = sum(self.env.episode_rewards)
        won = self.env.game.state.winner == self.env.agent_player

        self._wins += int(won)
        self._recent_rewards.append(ep_reward)
        if len(self._recent_rewards) > 100:
            self._recent_rewards.pop(0)

        self.progress["episode"] += 1
        self.progress["wins"] = self._wins
        self.progress["win_rate"] = self._wins / self.progress["episode"]
        self.progress["avg_reward"] = sum(self._recent_rewards) / len(self._recent_rewards)
        self.progress["recent_rewards"] = list(self._recent_rewards[-20:])

    def get_progress(self) -> dict:
        return dict(self.progress)
