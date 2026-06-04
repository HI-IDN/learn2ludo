"""
FastAPI backend for Ludo RL.
Run with: uvicorn server:app --reload --port 8000
"""

import sys
import os
import json
import threading
import time
import hashlib
import secrets
from pathlib import Path
from typing import Optional

sys.path.insert(0, str(Path(__file__).parent))

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from game.engine import GameConfig, BoardConfig, board_track_size
from game.session import GameSession
from game.bots import ApolloBot, get_bot_info, save_custom_bot, delete_custom_bot, delete_custom_bots_by_designer, load_custom_bots, REGISTRY as BOT_REGISTRY
from rl.environment import LudoEnv, TrainingSession, OPPONENT_POLICIES

app = FastAPI(title="Ludo RL")
PLAYER_COLORS = ["red", "green", "yellow", "blue", "orange", "purple"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------
CONFIG_PATH   = Path(__file__).parent / "config" / "tabs.json"
STATS_PATH    = Path(__file__).parent / "config" / "stats.json"
GAMES_DIR     = Path(__file__).parent / "data" / "games"
PLAYERS_PATH  = Path(__file__).parent / "data" / "players.json"
BUGS_DIR      = Path(__file__).parent / "data" / "bugs"

active_game: Optional[GameSession] = None
active_env: Optional[LudoEnv] = None
active_session: Optional[TrainingSession] = None
training_thread: Optional[threading.Thread] = None
admin_tokens: set = set()


def load_config() -> dict:
    return json.loads(CONFIG_PATH.read_text())


def save_config(cfg: dict):
    CONFIG_PATH.write_text(json.dumps(cfg, indent=2))


def load_stats() -> dict:
    if STATS_PATH.exists():
        return json.loads(STATS_PATH.read_text())
    return {"games_played": 0, "training_sessions": 0, "best_win_rate": 0.0, "history": []}


def save_stats(stats: dict):
    STATS_PATH.write_text(json.dumps(stats, indent=2))


def save_game_record(session: GameSession):
    """Write full enriched game JSON to data/games/ (gitignored)."""
    GAMES_DIR.mkdir(parents=True, exist_ok=True)
    state = session.to_dict()
    state["v"] = 2
    state["players_registry"] = build_game_player_registry(session)
    finished_at_ms = int(time.time() * 1000)
    state["started_at_ms"] = session.started_at_ms
    state["finished_at_ms"] = finished_at_ms
    state["total_play_time_ms"] = max(0, finished_at_ms - session.started_at_ms)
    state["player_stats"] = session.compute_player_stats()
    cfg = state["config"]
    label = f"{cfg['player_count']}p{cfg['board']['yard_count']}y{cfg['board']['pawns_per_player']}pw"
    ts = time.strftime("%Y%m%dT%H%M%S", time.gmtime())
    path = GAMES_DIR / f"{ts}_{label}.json"
    path.write_text(json.dumps(state, indent=2))
    return str(path)


def build_game_player_registry(session: GameSession) -> list[dict]:
    return normalize_game_player_refs(
        session.player_refs,
        session.seeds,
        slots=session.game.slots,
        starting_player=session.starting_player,
    )


def normalize_game_player_refs(
    player_refs: list,
    seeds: list[int],
    slots: list[int] | None = None,
    starting_player: int = 0,
) -> list[dict]:
    refs = {int(p.get("player_index", p.get("index", -1))): p for p in player_refs if isinstance(p, dict)}
    registry = []
    player_count = len(seeds)
    slots = slots or list(range(player_count))
    for idx, seed in enumerate(seeds):
        ref = refs.get(idx, {})
        slot = slots[idx] if idx < len(slots) else idx
        bot_id = ref.get("bot_id") or None
        human_id = ref.get("human_id") or None
        player_type = ref.get("type") or ("human" if human_id else "bot" if bot_id else None)
        if player_type not in ("human", "bot"):
            player_type = "human" if human_id else "bot" if bot_id else None
        registry.append({
            "player_index": idx,
            "seed": seed,
            "slot": slot,
            "color": PLAYER_COLORS[slot] if 0 <= slot < len(PLAYER_COLORS) else None,
            "play_order": (idx - starting_player + player_count) % player_count,
            "type": player_type,
            "human_id": human_id if player_type == "human" else None,
            "bot_id": bot_id if player_type == "bot" else None,
            "designer_uuid": ref.get("designer_uuid") or None,
        })
    return registry


# ---------------------------------------------------------------------------
# Admin auth
# ---------------------------------------------------------------------------
class AdminLogin(BaseModel):
    password: str


_ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "password1")


@app.post("/api/admin/login")
def admin_login(body: AdminLogin):
    if body.password != _ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid password")
    token = secrets.token_hex(32)
    admin_tokens.add(token)
    return {"token": token}


def require_admin(request: Request):
    token = request.headers.get("X-Admin-Token", "")
    if token not in admin_tokens:
        raise HTTPException(status_code=403, detail="Admin access required")


# ---------------------------------------------------------------------------
# Tab config
# ---------------------------------------------------------------------------
@app.get("/api/tabs")
def get_tabs():
    cfg = load_config()
    return {"tabs": cfg["tabs"]}


class TabUpdate(BaseModel):
    token: str
    tabs: list


@app.post("/api/tabs")
def update_tabs(body: TabUpdate):
    if body.token not in admin_tokens:
        raise HTTPException(status_code=403, detail="Admin access required")
    cfg = load_config()
    cfg["tabs"] = body.tabs
    save_config(cfg)
    return {"ok": True}


# ---------------------------------------------------------------------------
# Bug reports
# ---------------------------------------------------------------------------
import base64 as _base64
import datetime as _dt
import random as _random
import string as _string


class BugReportBody(BaseModel):
    what_doing: str = ""
    what_wrong: str = ""
    page_state: dict = {}
    screenshot_b64: str = ""


@app.post("/api/bugs/report")
def submit_bug(body: BugReportBody):
    reports_dir     = BUGS_DIR / "reports"
    screenshots_dir = BUGS_DIR / "screenshots"
    games_dir       = BUGS_DIR / "games"
    reports_dir.mkdir(parents=True, exist_ok=True)
    screenshots_dir.mkdir(parents=True, exist_ok=True)

    ts = _dt.datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    suffix = "".join(_random.choices(_string.ascii_lowercase + _string.digits, k=4))
    report_id = f"bug_{ts}_{suffix}"

    # Save incomplete game snapshot when the report comes from the play tab
    active_tab = body.page_state.get("active_tab")
    game_state = body.page_state.get("game_state")
    page_settings = body.page_state.get("settings") or {}
    game_file = None
    if active_tab == "play" and game_state:
        games_dir.mkdir(parents=True, exist_ok=True)
        (games_dir / f"{report_id}.json").write_text(json.dumps(game_state, indent=2))
        game_file = f"{report_id}.json"

    # Extract player names for the report summary
    player_names_map = page_settings.get("player_names") or {}
    num_players = (game_state or {}).get("num_players") or page_settings.get("num_players") or 0
    players_summary = [player_names_map.get(str(i)) or player_names_map.get(i) or f"Player {i+1}"
                       for i in range(int(num_players))] if num_players else []

    has_screenshot = bool(body.screenshot_b64)
    report = {
        "id": report_id,
        "timestamp": _dt.datetime.utcnow().isoformat() + "Z",
        "what_doing": body.what_doing,
        "what_wrong": body.what_wrong,
        "active_tab": active_tab,
        "players": players_summary,
        "game_file": game_file,
        "screenshot": f"{report_id}.png" if has_screenshot else None,
        "page_state": {k: v for k, v in body.page_state.items() if k not in ("game_state", "settings")},
    }
    (reports_dir / f"{report_id}.json").write_text(json.dumps(report, indent=2))

    if has_screenshot:
        raw = body.screenshot_b64.split(",")[-1]
        (screenshots_dir / f"{report_id}.png").write_bytes(
            _base64.b64decode(raw)
        )

    return {"id": report_id}


@app.get("/api/bugs")
def list_bugs(request: Request):
    require_admin(request)
    reports_dir = BUGS_DIR / "reports"
    if not reports_dir.exists():
        return {"reports": []}
    reports = []
    for f in sorted(reports_dir.glob("bug_*.json"), reverse=True):
        try:
            reports.append(json.loads(f.read_text()))
        except Exception:
            pass
    return {"reports": reports}


@app.get("/api/bugs/games/{filename}")
def get_bug_game(filename: str, request: Request):
    require_admin(request)
    path = BUGS_DIR / "games" / filename
    if not path.exists():
        raise HTTPException(status_code=404, detail="Game file not found")
    return json.loads(path.read_text())


# ---------------------------------------------------------------------------
# Players registry API  (UUID + icon only — no username stored server-side)
# ---------------------------------------------------------------------------
class PlayerRegisterRequest(BaseModel):
    id: str
    icon: str
    age_range: str
    consent_ts: int
    leaderboard_opt_in: bool = False


def load_players() -> dict:
    if PLAYERS_PATH.exists():
        try:
            data = json.loads(PLAYERS_PATH.read_text())
        except Exception:
            return {}
        if isinstance(data.get("users"), dict):
            return data["users"]
        if isinstance(data.get("players"), list):
            return {p.get("id"): p for p in data["players"] if p.get("id")}
    return {}


def save_players(players: dict):
    PLAYERS_PATH.parent.mkdir(parents=True, exist_ok=True)
    PLAYERS_PATH.write_text(json.dumps({"users": players}, indent=2))


@app.get("/api/players")
def list_players():
    return {"users": load_players()}


@app.post("/api/players/register", status_code=201)
def register_player(req: PlayerRegisterRequest):
    """Persist a consented player's anonymous UUID record.
    No username is stored server-side."""
    players = load_players()
    existing = players.get(req.id, {})
    record = {
        "id": req.id,
        "icon": req.icon,
        "age_range": req.age_range,
        "joined_ts": existing.get("joined_ts") or req.consent_ts,
        "last_consent_ts": req.consent_ts,
        "leaderboard_opt_in": req.leaderboard_opt_in,
    }
    players[req.id] = record
    save_players(players)
    return {"ok": True}


@app.delete("/api/players/{player_id}")
def delete_player(player_id: str):
    players = load_players()
    if player_id not in players:
        raise HTTPException(status_code=404, detail=f"Player not found: {player_id}")
    players[player_id] = {
        **players[player_id],
        "_is_deleted": True,
        "deleted_ts": int(time.time() * 1000),
    }
    save_players(players)
    deleted_bots = delete_custom_bots_by_designer(player_id)
    return {"ok": True, "deleted_bots": deleted_bots}


# ---------------------------------------------------------------------------
# Bots API
# ---------------------------------------------------------------------------
@app.get("/api/bots")
def list_bots():
    return {"bots": get_bot_info()}


class SaveCustomBotRequest(BaseModel):
    id: str
    name: str
    tldr: str
    description: str
    weights: dict
    designer: str = ""
    created_at: str = ""


@app.post("/api/bots/custom", status_code=201)
def create_custom_bot(req: SaveCustomBotRequest):
    if not req.name.strip() or not req.tldr.strip() or not req.description.strip():
        raise HTTPException(status_code=422, detail="name, tldr, and description are required")
    bot = req.model_dump()
    save_custom_bot(bot)
    return {"ok": True, "id": bot["id"]}


@app.delete("/api/bots/custom/{bot_id}")
def remove_custom_bot(bot_id: str):
    if not delete_custom_bot(bot_id):
        raise HTTPException(status_code=404, detail=f"Custom bot not found: {bot_id}")
    return {"ok": True}


class BotMoveRequest(BaseModel):
    bot_id: str
    valid_moves: list
    game_state: dict = {}
    weights: dict = {}


@app.post("/api/game/bot-move")
def bot_move(req: BotMoveRequest):
    if req.bot_id == "user-weighted":
        move = ApolloBot(req.weights or None).choose_move(req.valid_moves, req.game_state or None)
        if move is None:
            raise HTTPException(status_code=400, detail="No valid moves")
        return move

    bot = BOT_REGISTRY.get(req.bot_id)
    if not bot:
        custom = next((b for b in load_custom_bots() if b.get("id") == req.bot_id), None)
        if custom:
            move = ApolloBot(custom.get("weights") or {}).choose_move(req.valid_moves, req.game_state or None)
            if move is None:
                raise HTTPException(status_code=400, detail="No valid moves")
            return move
        raise HTTPException(status_code=404, detail=f"Unknown bot: {req.bot_id}")
    move = bot.choose_move(req.valid_moves, req.game_state or None)
    if move is None:
        raise HTTPException(status_code=400, detail="No valid moves")
    return move


# ---------------------------------------------------------------------------
# Game API
# ---------------------------------------------------------------------------
class NewGameRequest(BaseModel):
    num_players: int = 4
    rules: dict = {}
    config: dict = {}
    seeds: list[int] | None = None


@app.post("/api/game/new")
def new_game(req: NewGameRequest):
    global active_game
    board_cfg = req.config.get("board", {})
    player_count = req.config.get("player_count", req.num_players)
    explicit_slots = req.config.get("explicit_slots") or list(range(player_count))
    starting_player = int(req.config.get("starting_player", 0))
    yard_count = board_cfg.get("yard_count", 4)
    home_length = board_cfg.get("home_length", 6)
    cfg = GameConfig(
        board=BoardConfig(
            track_size=board_cfg.get("track_size", board_track_size(yard_count, home_length)),
            yard_count=yard_count,
            home_length=home_length,
            safe_offset=board_cfg.get("safe_offset", 7),
            pawns_per_player=board_cfg.get("pawns_per_player", 4),
        ),
        player_count=player_count,
        explicit_slots=explicit_slots,
    )
    max_yard_rolls = int(req.rules.get("empty_board_rolls", 3))
    equal_rounds   = bool(req.rules.get("equal_rounds", False))
    active_game = GameSession(cfg, max_yard_rolls=max_yard_rolls, starting_player=starting_player,
                              equal_rounds=equal_rounds, seeds=req.seeds)
    active_game.player_refs = build_game_player_registry(active_game)
    incoming_refs = req.config.get("player_refs") or []
    if incoming_refs:
        active_game.player_refs = normalize_game_player_refs(
            incoming_refs,
            active_game.seeds,
            slots=active_game.game.slots,
            starting_player=active_game.starting_player,
        )
    stats = load_stats()
    stats["games_played"] += 1
    save_stats(stats)
    return active_game.to_dict()


@app.get("/api/game/state")
def game_state():
    if not active_game:
        raise HTTPException(status_code=404, detail="No active game")
    return active_game.to_dict()


@app.post("/api/game/roll")
def roll_dice():
    if not active_game:
        raise HTTPException(status_code=404, detail="No active game")
    value = active_game.roll_dice()
    return {"dice": value, "game": active_game.to_dict()}


class MoveRequest(BaseModel):
    piece_idx: Optional[int] = None
    pawn_id: Optional[str] = None
    target: int
    justification: Optional[str] = Field(default=None, max_length=400)


@app.post("/api/game/move")
def make_move(req: MoveRequest):
    if not active_game:
        raise HTTPException(status_code=404, detail="No active game")
    if req.piece_idx is None and not req.pawn_id:
        raise HTTPException(status_code=422, detail="piece_idx or pawn_id is required")
    try:
        events = active_game.apply_move(
            req.piece_idx,
            req.target,
            pawn_id_value=req.pawn_id,
            justification=req.justification,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    game_dict = active_game.to_dict()
    if active_game.winner is not None:
        game_dict["player_stats"] = active_game.compute_player_stats()
        save_game_record(active_game)
    return {"events": events, "game": game_dict}


@app.post("/api/game/skip")
def skip_turn():
    if not active_game:
        raise HTTPException(status_code=404, detail="No active game")
    active_game.skip_turn()
    game_dict = active_game.to_dict()
    if active_game.winner is not None:
        game_dict["player_stats"] = active_game.compute_player_stats()
        save_game_record(active_game)
    return game_dict


class ReflectionsRequest(BaseModel):
    reflections: list


@app.post("/api/game/reflections", status_code=200)
def save_reflections(req: ReflectionsRequest):
    """Append player reflections to the most-recently saved game JSON."""
    if not GAMES_DIR.exists():
        return {"ok": False, "detail": "No game records found"}
    files = sorted(GAMES_DIR.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
    if not files:
        return {"ok": False, "detail": "No game file to attach reflections to"}
    data = json.loads(files[0].read_text())
    data["reflections"] = sanitize_reflections(req.reflections)
    files[0].write_text(json.dumps(data, indent=2))
    return {"ok": True}


def sanitize_reflections(reflections: list) -> list:
    sanitized = []
    for ref in reflections:
        if not isinstance(ref, dict):
            continue
        item = {k: v for k, v in ref.items() if k != "name"}
        sanitized.append(item)
    return sanitized


# ---------------------------------------------------------------------------
# Training API
# ---------------------------------------------------------------------------
class TrainRequest(BaseModel):
    num_episodes: int = 1000
    opponent: str = "random"
    num_players: int = 4
    agent_player: int = 0
    reward_config: dict = {}
    game_rules: dict = {}


@app.post("/api/train/start")
def start_training(req: TrainRequest):
    global active_env, active_session, training_thread

    if training_thread and training_thread.is_alive():
        raise HTTPException(status_code=409, detail="Training already running")

    opponent = OPPONENT_POLICIES.get(req.opponent, OPPONENT_POLICIES["random"])
    active_env = LudoEnv(
        agent_player=req.agent_player,
        num_players=req.num_players,
        opponent_policy=opponent,
        reward_config=req.reward_config,
        game_rules=req.game_rules,
    )
    active_session = TrainingSession(active_env)
    active_session.progress["total_episodes"] = req.num_episodes

    def run():
        for _ in range(req.num_episodes):
            if not active_session.is_running:
                break
            active_session.run_episode()
            time.sleep(0)  # yield
        active_session.is_running = False
        # Save stats
        stats = load_stats()
        stats["training_sessions"] += 1
        wr = active_session.progress["win_rate"]
        if wr > stats["best_win_rate"]:
            stats["best_win_rate"] = round(wr, 4)
        stats["history"].append({
            "episodes": active_session.progress["episode"],
            "win_rate": round(wr, 4),
            "avg_reward": round(active_session.progress["avg_reward"], 3),
            "timestamp": time.time()
        })
        save_stats(stats)

    active_session.is_running = True
    training_thread = threading.Thread(target=run, daemon=True)
    training_thread.start()
    return {"started": True}


@app.post("/api/train/stop")
def stop_training():
    if active_session:
        active_session.is_running = False
    return {"stopped": True}


@app.get("/api/train/progress")
def training_progress():
    if not active_session:
        return {"running": False, "progress": None}
    return {
        "running": active_session.is_running,
        "progress": active_session.get_progress()
    }


# ---------------------------------------------------------------------------
# Stats API
# ---------------------------------------------------------------------------
@app.get("/api/stats")
def get_stats():
    return load_stats()


import uuid as _uuid


class SaveGameBody(BaseModel):
    name: str = ""
    filename: str = ""   # if set, overwrite existing file
    state: dict


class RenameGameBody(BaseModel):
    name: str


@app.post("/api/games/save")
def save_game_manually(body: SaveGameBody):
    GAMES_DIR.mkdir(parents=True, exist_ok=True)
    filename = body.filename if body.filename else f"{_uuid.uuid4()}.json"
    path = GAMES_DIR / filename
    if not path.parent == GAMES_DIR:
        raise HTTPException(status_code=400, detail="Invalid filename")
    state = {**body.state, "_name": body.name or None}
    path.write_text(json.dumps(state, indent=2))
    return {"filename": filename}


@app.patch("/api/games/{filename}")
def rename_game(filename: str, body: RenameGameBody):
    path = GAMES_DIR / filename
    if not path.exists():
        raise HTTPException(status_code=404, detail="Game not found")
    data = json.loads(path.read_text())
    data["_name"] = body.name or None
    path.write_text(json.dumps(data, indent=2))
    return {"ok": True}


@app.delete("/api/games/{filename}")
def delete_game(filename: str, request: Request):
    require_admin(request)
    path = GAMES_DIR / filename
    if not path.exists():
        raise HTTPException(status_code=404, detail="Game not found")
    path.unlink()
    return {"ok": True}


@app.get("/api/games")
def list_games():
    if not GAMES_DIR.exists():
        return {"games": []}
    # Load player registry for name lookups
    player_registry: dict = {}
    if PLAYERS_PATH.exists():
        try:
            raw = json.loads(PLAYERS_PATH.read_text())
            player_registry = raw if isinstance(raw, dict) else {p["id"]: p for p in raw if p.get("id")}
            if "users" in player_registry:
                player_registry = player_registry["users"]
        except Exception:
            pass
    games = []
    for f in sorted(GAMES_DIR.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True):
        try:
            data = json.loads(f.read_text())
            cfg = data.get("config", {})
            board = cfg.get("board", {})
            refs = data.get("players_registry") or data.get("player_refs") or []
            players = []
            for p in refs:
                human_id = p.get("human_id")
                pr = player_registry.get(human_id, {}) if human_id else {}
                players.append({
                    "index": p.get("player_index"),
                    "color": p.get("color"),
                    "type": p.get("type"),
                    "bot_id": p.get("bot_id"),
                    "human_icon": pr.get("icon"),
                })
            games.append({
                "filename": f.name,
                "name": data.get("_name") or None,
                "started_at_ms": data.get("started_at_ms"),
                "finished_at_ms": data.get("finished_at_ms"),
                "player_count": data.get("num_players") or cfg.get("player_count"),
                "yard_count": board.get("yard_count"),
                "winner": data.get("winner"),
                "winner_color": data.get("winner_color"),
                "players": players,
            })
        except Exception:
            pass
    return {"games": games}


@app.get("/api/games/{filename}")
def get_game(filename: str):
    path = GAMES_DIR / filename
    if not path.exists():
        raise HTTPException(status_code=404, detail="Game not found")
    return json.loads(path.read_text())


# ---------------------------------------------------------------------------
# Serve frontend
# ---------------------------------------------------------------------------
STATIC_DIR = Path(__file__).parent / "static"

@app.get("/", response_class=HTMLResponse)
def root():
    return FileResponse(STATIC_DIR / "index.html")


from starlette.middleware.base import BaseHTTPMiddleware

class NoCacheStaticMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        if request.url.path.startswith("/static/js/") or request.url.path.startswith("/static/styles/"):
            response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
            response.headers["Pragma"] = "no-cache"
        return response

app.add_middleware(NoCacheStaticMiddleware)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
