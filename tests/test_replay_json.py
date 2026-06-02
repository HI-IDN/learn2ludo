import json
import shutil
import subprocess
from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[1]


def expected_round_count(saved: dict) -> int:
    if saved.get("round_count"):
        return saved["round_count"]
    history = saved.get("history") or []
    start = next((e.get("player") for e in history if e.get("type") == "game_start"), saved.get("starting_player", 0))
    current = start
    rounds = 1
    for event in history:
        if event.get("type") not in {"roll", "yard_roll"}:
            continue
        player = event.get("player")
        if player == start and current != start:
            rounds += 1
        current = player
    return rounds

NODE_REPLAY_CHECK = r"""
const fs = require('fs');
const vm = require('vm');
const data = JSON.parse(fs.readFileSync('tests/replay.json', 'utf8'));

const ctx = {
  console,
  settings: {},
  PLAYER_COLORS: ['red', 'green', 'yellow', 'blue', 'orange', 'purple'],
  COLORS: {
    red: '#AC1A2F',
    green: '#719500',
    yellow: '#F5CF47',
    blue: '#0098AA',
    purple: '#660451',
    orange: '#EB7125',
  },
  document: {getElementById: () => null},
  setInterval,
  clearInterval,
  renderGame() {},
  updateSaveGameButton() {},
  stopElapsedTimer() {},
  resetBotState() {},
};

ctx.pawnId = (color, i) => ({
  red: 'R',
  green: 'G',
  yellow: 'Y',
  blue: 'B',
  orange: 'O',
  purple: 'P',
}[color] || color[0].toUpperCase()) + (i + 1);

ctx.playerSlot = (playerIdx) => ctx.gameState?.slots?.[playerIdx] ?? playerIdx;
ctx.playerColorName = (playerIdx) => ctx.PLAYER_COLORS[ctx.playerSlot(playerIdx)] || 'blue';
ctx.boardLayout = (trackSize = null, yardCount = null) => {
  yardCount = yardCount ?? 4;
  const homeLength = 6;
  trackSize = trackSize ?? yardCount * (2 * homeLength + 1);
  const step = Math.floor(trackSize / yardCount);
  const startOffset = Math.floor((step - 1) / 2) + 2;
  const starts = Array.from({length: yardCount}, (_, i) => (i * step + startOffset) % trackSize);
  return {
    track_size: trackSize,
    yard_count: yardCount,
    starts,
    finishes: starts.map(x => (x - 2 + trackSize) % trackSize),
    safe_havens: [...starts],
  };
};

ctx.normalizeEngineState = (raw) => {
  const state = raw?.game || raw?.state || raw || {};
  const cfg = state.config || {};
  const playerCount = cfg.player_count || state.player_count || state.num_players || 4;
  const slots = state.slots || Array.from({length: playerCount}, (_, i) => i);
  const players = (state.players || []).map((p, pi) => {
    const color = p.color || ctx.PLAYER_COLORS[slots[p.index ?? pi]];
    return {
      ...p,
      index: p.index ?? pi,
      color,
      pieces: (p.pieces || []).map((pc, i) => ({
        ...pc,
        index: pc.index ?? i,
        pawn_id: pc.pawn_id || ctx.pawnId(color, pc.index ?? i),
      })),
    };
  });
  return {
    ...state,
    config: {
      board: {
        track_size: cfg.board?.track_size || 52,
        yard_count: cfg.board?.yard_count || 4,
        home_length: cfg.board?.home_length || 6,
        pawns_per_player: cfg.board?.pawns_per_player || 4,
      },
      player_count: playerCount,
    },
    slots,
    players,
    num_players: playerCount,
    current_player: state.current_player ?? state.player ?? 0,
    dice: state.dice ?? state.last_roll ?? 0,
    phase: state.phase || 'rolling',
    valid_moves: state.valid_moves || [],
    history: state.history || [],
    winner: state.winner ?? null,
    winners: state.winners || [],
    winner_color: state.winner_color ?? null,
    winner_colors: state.winner_colors || [],
  };
};

vm.createContext(ctx);
vm.runInContext(fs.readFileSync('static/js/replay.js', 'utf8'), ctx);
ctx.loadReplayJson(data);
ctx.replayStep(999999);

const snapshot = {
  replay_history_length: ctx.gameState.history.length,
  replay_game_starts: ctx.gameState.history.filter(e => e.type === 'game_start').length,
  source_game_starts: data.history.filter(e => e.type === 'game_start').length,
  source_history_length: data.history.length,
  phase: ctx.gameState.phase,
  current_player: ctx.gameState.current_player,
  winner: ctx.gameState.winner,
  winners: ctx.gameState.winners,
  winner_color: ctx.gameState.winner_color,
  winner_colors: ctx.gameState.winner_colors,
  round_count: ctx.gameState.round_count,
  dice: ctx.gameState.dice,
  players: ctx.gameState.players.map(p => ({
    index: p.index,
    type: p.type,
    name: p.name,
    color: p.color,
    pawns: p.pieces.map(pc => ({
      id: pc.pawn_id,
      p: pc.position,
      y: pc.in_yard,
      f: pc.finished,
      a: pc.absolute_position,
    })),
  })),
};

process.stdout.write(JSON.stringify(snapshot));
"""

NODE_REPLAY_HISTORY_CHECK = r"""
const fs = require('fs');
const vm = require('vm');

const list = { innerHTML: '' };
const ctx = {
  console,
  gameState: {
    num_players: 2,
    players: [
      {index: 0, name: 'Eris', color: 'yellow', pieces: [{pawn_id: 'Y2'}]},
      {index: 1, name: 'Ares', color: 'blue', pieces: [{pawn_id: 'B1'}]},
    ],
    history: [
      {type: 'move', player: 0, piece: 1, pawn_id: 'Y2', from: 11, to: 15, justification: 'because <safe> & fast'},
      {type: 'move', player: 1, piece: 0, pawn_id: 'B1', from: 4, to: 7, justification: null},
    ],
  },
  COLORS: {yellow: '#F5CF47', blue: '#0098AA'},
  document: { getElementById: (id) => id === 'move-history-list' ? list : null },
  localStorage: { getItem: () => null, setItem() {} },
  isReplayActive: () => true,
  isLiveHistoryBrowsing: () => false,
  getPlayerName: (idx) => idx === 0 ? 'Eris' : 'Ares',
  playerColorName: (idx) => idx === 0 ? 'yellow' : 'blue',
  pawnId: (color, idx) => `${color[0].toUpperCase()}${idx + 1}`,
  displayCellLabel: (_player, pos) => `T${pos + 1}`,
};

vm.createContext(ctx);
vm.runInContext(fs.readFileSync('static/js/history.js', 'utf8'), ctx);
ctx.renderMoveHistory();

process.stdout.write(JSON.stringify({html: list.innerHTML}));
"""


def test_replay_json_reconstructs_saved_final_state():
    if not shutil.which("node"):
        pytest.skip("node is required for replay.js regression coverage")

    result = subprocess.run(
        ["node", "-e", NODE_REPLAY_CHECK],
        cwd=REPO_ROOT,
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    actual = json.loads(result.stdout)
    saved = json.loads((REPO_ROOT / "tests" / "replay.json").read_text(encoding="utf-8"))
    expected = {
        "phase": saved["phase"],
        "current_player": saved["current_player"],
        "winner": saved["winner"],
        "winners": saved["winners"],
        "winner_color": saved["winner_color"],
        "winner_colors": saved["winner_colors"],
        "round_count": expected_round_count(saved),
        "dice": saved["dice"],
        "players": [
            {
                "index": player["index"],
                "type": player["type"],
                "name": player["name"],
                "color": player["color"],
                "pawns": player["pawns"],
            }
            for player in saved["players"]
        ],
    }

    assert actual.pop("replay_game_starts") == 1
    source_game_starts = actual.pop("source_game_starts")
    replay_history_length = actual.pop("replay_history_length")
    source_history_length = actual.pop("source_history_length")
    if source_game_starts > 1:
        assert replay_history_length < source_history_length
    else:
        assert replay_history_length == source_history_length
    assert actual == expected


def test_replay_history_displays_justifications_without_placeholders():
    if not shutil.which("node"):
        pytest.skip("node is required for history.js regression coverage")

    result = subprocess.run(
        ["node", "-e", NODE_REPLAY_HISTORY_CHECK],
        cwd=REPO_ROOT,
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    html = json.loads(result.stdout)["html"]

    assert "Eris" in html
    assert "Y2: T12" in html
    assert "because &lt;safe&gt; &amp; fast" in html
    assert "mh-note" in html
    assert "null" not in html
    assert "undefined" not in html
