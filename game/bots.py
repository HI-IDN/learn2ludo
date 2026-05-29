"""
Bot registry for Learn2Ludo.

All bots implement BotPolicy.choose_move(valid_moves, game_state).
RL-trained bots will subclass BotPolicy and load their model in __init__.

valid_moves: list of {"piece_idx": int, "target": int}
game_state:  the full dict from the game API (players, board, config, …)
Returns:     one item from valid_moves, or None
"""

import random
from abc import ABC, abstractmethod


class BotPolicy(ABC):
    id: str
    name: str
    description: str

    @abstractmethod
    def choose_move(self, valid_moves: list, game_state: dict | None = None) -> dict | None:
        ...

    def to_info(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "type": getattr(self, "type", "heuristic"),
            "description": self.description,
        }


# ---------------------------------------------------------------------------
# Heuristic bots
# ---------------------------------------------------------------------------

class ErisBot(BotPolicy):
    id          = "eris"
    name        = "Eris"
    type        = "heuristic"
    description = "Goddess of Discord — moves at random"

    def choose_move(self, valid_moves, game_state=None):
        return random.choice(valid_moves) if valid_moves else None


class AresBot(BotPolicy):
    id          = "ares"
    name        = "Ares"
    type        = "heuristic"
    description = "God of War — captures enemy pawns when possible, else random"

    def choose_move(self, valid_moves, game_state=None):
        if not valid_moves:
            return None
        captures = [m for m in valid_moves if self._is_capture(m, game_state)]
        pool = captures if captures else valid_moves
        return random.choice(pool)

    def _is_capture(self, move: dict, game_state: dict | None) -> bool:
        if not game_state:
            return False
        cfg        = game_state.get("config", {})
        board      = game_state.get("board", {})
        track_size = board.get("track_size", 52)
        pawns_pp   = cfg.get("board", {}).get("pawns_per_player", 4)
        starts     = board.get("starts", [])
        safe       = set(board.get("safe_havens", []))

        target     = move["target"]
        piece_idx  = move["piece_idx"]
        if target >= track_size:          # home stretch — no captures
            return False

        moving_player = piece_idx // pawns_pp
        slots         = game_state.get("slots", [])
        slot          = slots[moving_player] if moving_player < len(slots) else moving_player
        start         = starts[slot] if slot < len(starts) else 0
        abs_target    = (target + start) % track_size

        if abs_target in safe:
            return False

        for p in game_state.get("players", []):
            if p.get("index") == moving_player:
                continue
            for pc in p.get("pieces", []):
                if not pc.get("in_yard") and not pc.get("finished"):
                    if pc.get("absolute_position") == abs_target:
                        return True
        return False


# ---------------------------------------------------------------------------
# Registry — add new bots here; RL bots will register themselves on load
# ---------------------------------------------------------------------------

_BUILTIN: list[BotPolicy] = [ErisBot(), AresBot()]
REGISTRY: dict[str, BotPolicy] = {b.id: b for b in _BUILTIN}


def register(bot: BotPolicy):
    """Called by RL bot modules at import time to add themselves."""
    REGISTRY[bot.id] = bot


def get_bot_info() -> list[dict]:
    return [b.to_info() for b in REGISTRY.values()]
