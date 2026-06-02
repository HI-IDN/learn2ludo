"""
Bot registry for Learn2Ludo.

All bots implement BotPolicy.choose_move(valid_moves, game_state).
RL-trained bots will subclass BotPolicy and load their model in __init__.

valid_moves: list of {"piece_idx": int, "pawn_id": str, "target": int}
game_state:  the full dict from the game API (players, board, config, …)
Returns:     one item from valid_moves, or None
"""

import random
import json
from dataclasses import dataclass
from abc import ABC, abstractmethod
from pathlib import Path


BOTS_CONFIG_PATH = Path(__file__).resolve().parents[1] / "config" / "bots.json"


@dataclass(frozen=True)
class MoveFeatures:
    capture: float = 0.0
    risk: float = 0.0
    risk_reduction: float = 0.0
    progress: float = 0.0
    safety: float = 0.0
    blockade: float = 0.0
    spread: float = 0.0
    activation: float = 0.0

    def as_dict(self) -> dict:
        return {
            "capture": self.capture,
            "risk": self.risk,
            "risk_reduction": self.risk_reduction,
            "progress": self.progress,
            "safety": self.safety,
            "blockade": self.blockade,
            "spread": self.spread,
            "activation": self.activation,
        }


def _board_values(game_state: dict | None) -> dict:
    game_state = game_state or {}
    cfg = game_state.get("config", {})
    board = game_state.get("board", {})
    board_cfg = cfg.get("board", {})
    track_size = board.get("track_size") or board_cfg.get("track_size") or 52
    home_length = board_cfg.get("home_length") or 6
    return {
        "track_size": track_size,
        "home_entry": track_size - 1,
        "finish": track_size + home_length - 2,
        "pawns_per_player": board_cfg.get("pawns_per_player") or 4,
        "starts": board.get("starts") or [],
        "safe_havens": set(board.get("safe_havens") or []),
        "slots": game_state.get("slots") or [],
    }


def moving_player_for_move(move: dict, game_state: dict | None) -> int | None:
    values = _board_values(game_state)
    piece_idx = move.get("piece_idx")
    if isinstance(piece_idx, int) and values["pawns_per_player"] > 0:
        return piece_idx // values["pawns_per_player"]
    pawn_ref = move.get("pawn_id")
    if not pawn_ref or not game_state:
        return None
    target = str(pawn_ref).upper()
    for p in game_state.get("players", []):
        for pc in p.get("pieces", []):
            if str(pc.get("pawn_id", "")).upper() == target:
                return p.get("index")
    return None


def _player_start(player_idx: int, values: dict) -> int:
    slots = values["slots"]
    starts = values["starts"]
    slot = slots[player_idx] if player_idx < len(slots) else player_idx
    return starts[slot] if slot < len(starts) else 0


def _absolute_position(player_idx: int, position: int | None, values: dict) -> int | None:
    if position is None or position < 0 or position >= values["home_entry"]:
        return None
    return (position + _player_start(player_idx, values)) % values["track_size"]


def _moving_piece(move: dict, game_state: dict | None, moving_player: int | None) -> dict | None:
    if not game_state or moving_player is None:
        return None
    pawn_ref = str(move.get("pawn_id", "")).upper()
    piece_idx = move.get("piece_idx")
    values = _board_values(game_state)
    local_idx = piece_idx % values["pawns_per_player"] if isinstance(piece_idx, int) and values["pawns_per_player"] else None
    for p in game_state.get("players", []):
        if p.get("index") != moving_player:
            continue
        for pc in p.get("pieces", []):
            if pawn_ref and str(pc.get("pawn_id", "")).upper() == pawn_ref:
                return pc
            if local_idx is not None and pc.get("index") == local_idx:
                return pc
    return None


def _capture_at(abs_target: int | None, moving_player: int | None, game_state: dict | None, values: dict) -> bool:
    if abs_target is None or moving_player is None or not game_state or abs_target in values["safe_havens"]:
        return False
    for p in game_state.get("players", []):
        if p.get("index") == moving_player:
            continue
        for pc in p.get("pieces", []):
            if not pc.get("in_yard") and not pc.get("finished") and pc.get("absolute_position") == abs_target:
                return True
    return False


def _risk_at(abs_target: int | None, moving_player: int | None, game_state: dict | None, values: dict) -> float:
    if abs_target is None or moving_player is None or not game_state or abs_target in values["safe_havens"]:
        return 0.0
    threatening_rolls = set()
    for p in game_state.get("players", []):
        opponent = p.get("index")
        if opponent == moving_player:
            continue
        start = _player_start(opponent, values)
        target_local = (abs_target - start) % values["track_size"]
        for pc in p.get("pieces", []):
            pos = pc.get("position")
            if pc.get("in_yard") or pc.get("finished") or pos is None or pos < 0 or pos >= values["home_entry"]:
                continue
            distance = target_local - pos
            if 1 <= distance <= 6:
                threatening_rolls.add(distance)
    return len(threatening_rolls) / 6


def _friendly_stack_at(abs_target: int | None, moving_player: int | None, move: dict, game_state: dict | None) -> bool:
    if abs_target is None or moving_player is None or not game_state:
        return False
    moving_piece_id = str(move.get("pawn_id", "")).upper()
    for p in game_state.get("players", []):
        if p.get("index") != moving_player:
            continue
        for pc in p.get("pieces", []):
            if moving_piece_id and str(pc.get("pawn_id", "")).upper() == moving_piece_id:
                continue
            if not pc.get("in_yard") and not pc.get("finished") and pc.get("absolute_position") == abs_target:
                return True
    return False


def _spread_score(abs_target: int | None, moving_player: int | None, move: dict, game_state: dict | None, values: dict) -> float:
    if abs_target is None or moving_player is None or not game_state:
        return 0.0
    moving_piece_id = str(move.get("pawn_id", "")).upper()
    distances = []
    for p in game_state.get("players", []):
        if p.get("index") != moving_player:
            continue
        for pc in p.get("pieces", []):
            if moving_piece_id and str(pc.get("pawn_id", "")).upper() == moving_piece_id:
                continue
            other_abs = pc.get("absolute_position")
            if pc.get("in_yard") or pc.get("finished") or other_abs is None:
                continue
            raw = abs(abs_target - other_abs)
            distances.append(min(raw, values["track_size"] - raw))
    if not distances:
        return 1.0
    return min(sum(distances) / len(distances) / (values["track_size"] / 2), 1.0)


def move_features(move: dict, game_state: dict | None = None) -> MoveFeatures:
    values = _board_values(game_state)
    moving_player = moving_player_for_move(move, game_state)
    target = move.get("target")
    target_abs = _absolute_position(moving_player, target, values) if moving_player is not None else None
    piece = _moving_piece(move, game_state, moving_player)
    from_pos = piece.get("position") if piece else -1
    from_abs = _absolute_position(moving_player, from_pos, values) if moving_player is not None else None

    risk = _risk_at(target_abs, moving_player, game_state, values)
    current_risk = _risk_at(from_abs, moving_player, game_state, values)
    blockade = 1.0 if _friendly_stack_at(target_abs, moving_player, move, game_state) else 0.0
    safety = 0.0
    if target is not None and target >= values["home_entry"]:
        safety = 1.0
    elif target_abs is not None and (target_abs in values["safe_havens"] or blockade):
        safety = 1.0

    finish = max(values["finish"], 1)
    progress = max(0.0, min((target or 0) / finish, 1.0))
    activation = 1.0 if from_pos == -1 and target == 0 else 0.0

    return MoveFeatures(
        capture=1.0 if _capture_at(target_abs, moving_player, game_state, values) else 0.0,
        risk=risk,
        risk_reduction=max(current_risk - risk, 0.0),
        progress=progress,
        safety=safety,
        blockade=blockade,
        spread=_spread_score(target_abs, moving_player, move, game_state, values),
        activation=activation,
    )


def choose_by_feature(valid_moves: list, game_state: dict | None, score_fn) -> dict | None:
    if not valid_moves:
        return None
    scored = [(score_fn(move, move_features(move, game_state)), move) for move in valid_moves]
    best = max(score for score, _move in scored)
    pool = [move for score, move in scored if score == best]
    return random.choice(pool)


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
            "selectable": True,
            "implemented": True,
        }


def load_bot_catalog() -> list[dict]:
    if not BOTS_CONFIG_PATH.exists():
        return []
    data = json.loads(BOTS_CONFIG_PATH.read_text(encoding="utf-8"))
    return data.get("bots", [])


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
        return choose_by_feature(valid_moves, game_state, lambda _move, f: f.capture)


class AthenaBot(BotPolicy):
    id          = "athena"
    name        = "Athena"
    type        = "heuristic"
    description = "Goddess of Wisdom — keeps pawns safe first"

    def choose_move(self, valid_moves, game_state=None):
        return choose_by_feature(
            valid_moves,
            game_state,
            lambda _move, f: (f.risk_reduction, f.safety, -f.risk),
        )


class HestiaBot(BotPolicy):
    id          = "hestia"
    name        = "Hestia"
    type        = "heuristic"
    description = "Goddess of the Hearth — brings pawns home first"

    def choose_move(self, valid_moves, game_state=None):
        return choose_by_feature(valid_moves, game_state, lambda _move, f: f.progress)


class HermesBot(BotPolicy):
    id          = "hermes"
    name        = "Hermes"
    type        = "heuristic"
    description = "God of Travel — spreads pawns across the board"

    def choose_move(self, valid_moves, game_state=None):
        return choose_by_feature(valid_moves, game_state, lambda _move, f: f.spread)


class HephaestusBot(BotPolicy):
    id          = "hephaestus"
    name        = "Hephaestus"
    type        = "heuristic"
    description = "God of the Forge — builds friendly blockades"

    def choose_move(self, valid_moves, game_state=None):
        return choose_by_feature(valid_moves, game_state, lambda _move, f: f.blockade)


class ArtemisBot(BotPolicy):
    id          = "artemis"
    name        = "Artemis"
    type        = "heuristic"
    description = "Goddess of the Hunt — gets pawns into play"

    def choose_move(self, valid_moves, game_state=None):
        return choose_by_feature(valid_moves, game_state, lambda _move, f: f.activation)


# ---------------------------------------------------------------------------
# Registry — add new bots here; RL bots will register themselves on load
# ---------------------------------------------------------------------------

_BUILTIN: list[BotPolicy] = [ErisBot(), AresBot(), AthenaBot(), HestiaBot(), HermesBot(), HephaestusBot(), ArtemisBot()]
REGISTRY: dict[str, BotPolicy] = {b.id: b for b in _BUILTIN}


def register(bot: BotPolicy):
    """Called by RL bot modules at import time to add themselves."""
    REGISTRY[bot.id] = bot


def get_bot_info() -> list[dict]:
    catalog = load_bot_catalog()
    if not catalog:
        return [b.to_info() for b in REGISTRY.values()]

    seen = set()
    bots = []
    for entry in catalog:
        bot_id = entry.get("id")
        if not bot_id:
            continue
        implemented = bot_id in REGISTRY
        info = {
            **entry,
            "implemented": implemented,
            "selectable": bool(entry.get("selectable", implemented)) and implemented,
        }
        bots.append(info)
        seen.add(bot_id)

    for bot_id, bot in REGISTRY.items():
        if bot_id not in seen:
            bots.append(bot.to_info())
    return bots
