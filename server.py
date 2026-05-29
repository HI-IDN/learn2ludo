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
from pydantic import BaseModel

from game.engine import LudoGame
from game.bots import get_bot_info, REGISTRY as BOT_REGISTRY
from rl.environment import LudoEnv, TrainingSession, OPPONENT_POLICIES

app = FastAPI(title="Ludo RL")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------
CONFIG_PATH = Path(__file__).parent / "config" / "tabs.json"
STATS_PATH = Path(__file__).parent / "config" / "stats.json"

active_game: Optional[LudoGame] = None
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


# ---------------------------------------------------------------------------
# Admin auth
# ---------------------------------------------------------------------------
class AdminLogin(BaseModel):
    password: str


@app.post("/api/admin/login")
def admin_login(body: AdminLogin):
    cfg = load_config()
    stored = cfg["admin"].get("password_hash", "")
    # Simple comparison - in production use proper bcrypt
    attempt_hash = hashlib.sha256(body.password.encode()).hexdigest()
    stored_hash = cfg["admin"].get("password_sha256", "")

    if not stored_hash:
        # First run: accept any password and set it
        new_hash = hashlib.sha256(body.password.encode()).hexdigest()
        cfg["admin"]["password_sha256"] = new_hash
        save_config(cfg)
        token = secrets.token_hex(32)
        admin_tokens.add(token)
        return {"token": token, "first_run": True}

    if attempt_hash != stored_hash:
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
# Bots API
# ---------------------------------------------------------------------------
@app.get("/api/bots")
def list_bots():
    return {"bots": get_bot_info()}


class BotMoveRequest(BaseModel):
    bot_id: str
    valid_moves: list
    game_state: dict = {}


@app.post("/api/game/bot-move")
def bot_move(req: BotMoveRequest):
    bot = BOT_REGISTRY.get(req.bot_id)
    if not bot:
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


@app.post("/api/game/new")
def new_game(req: NewGameRequest):
    global active_game
    active_game = LudoGame(req.num_players, req.rules)
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
    piece_idx: int
    target: int


@app.post("/api/game/move")
def make_move(req: MoveRequest):
    if not active_game:
        raise HTTPException(status_code=404, detail="No active game")
    events = active_game.apply_move(req.piece_idx, req.target)
    return {"events": events, "game": active_game.to_dict()}


@app.post("/api/game/skip")
def skip_turn():
    if not active_game:
        raise HTTPException(status_code=404, detail="No active game")
    active_game.skip_turn()
    return active_game.to_dict()


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


# ---------------------------------------------------------------------------
# Serve frontend
# ---------------------------------------------------------------------------
STATIC_DIR = Path(__file__).parent / "static"

@app.get("/", response_class=HTMLResponse)
def root():
    return FileResponse(STATIC_DIR / "index.html")


app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
