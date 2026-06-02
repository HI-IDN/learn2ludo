import json
import shutil
import subprocess

import pytest

from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]

NODE_PROMPT_FREQUENCY_CHECK = r"""
const fs = require('fs');
const vm = require('vm');

const ctx = {
  console,
  settings: {move_justification_frequency: 'always'},
  gameState: {
    phase: 'moving',
    current_player: 0,
    valid_moves: [
      {piece_idx: 0, pawn_id: 'R1', target: 0},
      {piece_idx: 1, pawn_id: 'R2', target: 0},
    ],
    players: [{index: 0, type: 'human'}],
  },
  getPlayerType: () => 'human',
  gamePlayerType: () => 'human',
  isReplayActive: () => false,
  isLiveHistoryBrowsing: () => false,
};

vm.createContext(ctx);
vm.runInContext(fs.readFileSync('static/js/move-justification.js', 'utf8'), ctx);

const move = ctx.gameState.valid_moves[0];
const results = {};

ctx.settings.move_justification_frequency = 'always';
ctx.resetMoveJustificationFrequency();
results.always = ctx.moveNeedsJustification(move, null);

ctx.settings.move_justification_frequency = 'off';
ctx.resetMoveJustificationFrequency();
results.off = ctx.moveNeedsJustification(move, null);

ctx.settings.move_justification_frequency = 'every-n';
ctx.settings.move_justification_every_n = 3;
ctx.resetMoveJustificationFrequency();
results.everyN = [
  ctx.moveNeedsJustification(move, null),
  ctx.moveNeedsJustification(move, null),
  ctx.moveNeedsJustification(move, null),
  ctx.moveNeedsJustification(move, null),
  ctx.moveNeedsJustification(move, null),
  ctx.moveNeedsJustification(move, null),
];

ctx.settings.move_justification_frequency = 'every-n';
ctx.settings.move_justification_every_n = 2;
ctx.resetMoveJustificationFrequency();
ctx.gameState.current_player = 0;
const p0First = ctx.moveNeedsJustification(move, null);
ctx.gameState.current_player = 1;
const p1First = ctx.moveNeedsJustification(move, null);
ctx.gameState.current_player = 0;
const p0Second = ctx.moveNeedsJustification(move, null);
ctx.gameState.current_player = 1;
const p1Second = ctx.moveNeedsJustification(move, null);
results.everyNPerPlayer = [p0First, p1First, p0Second, p1Second];

ctx.settings.move_justification_frequency = 'random';
ctx.settings.move_justification_random_probability = 1;
ctx.resetMoveJustificationFrequency();
results.randomAlways = ctx.moveNeedsJustification(move, null);

ctx.settings.move_justification_random_probability = 0;
ctx.resetMoveJustificationFrequency();
results.randomNever = ctx.moveNeedsJustification(move, null);

ctx.settings.move_justification_frequency = 'always';
ctx.resetMoveJustificationFrequency();
results.forcedMoveSkipped = (() => {
  ctx.gameState.valid_moves = [move];
  return ctx.moveNeedsJustification(move, null);
})();

process.stdout.write(JSON.stringify(results));
"""

NODE_PROMPT_KEYDOWN_CHECK = r"""
const fs = require('fs');
const vm = require('vm');

let focused = false;
let prevented = false;
const ctx = {
  console,
  settings: {},
  gameState: null,
  document: {
    getElementById: (id) => id === 'move-justification-confirm'
      ? {focus: () => { focused = true; }}
      : null,
  },
};

vm.createContext(ctx);
vm.runInContext(fs.readFileSync('static/js/move-justification.js', 'utf8'), ctx);
ctx.moveJustificationKeydown({
  key: 'Enter',
  preventDefault: () => { prevented = true; },
});

process.stdout.write(JSON.stringify({focused, prevented}));
"""


def test_move_justification_prompt_frequency_modes():
    if not shutil.which("node"):
        pytest.skip("node is required for move justification JS regression coverage")

    result = subprocess.run(
        ["node", "-e", NODE_PROMPT_FREQUENCY_CHECK],
        cwd=REPO_ROOT,
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    actual = json.loads(result.stdout)

    assert actual["always"] is True
    assert actual["off"] is False
    assert actual["everyN"] == [False, False, True, False, False, True]
    assert actual["everyNPerPlayer"] == [False, False, True, True]
    assert actual["randomAlways"] is True
    assert actual["randomNever"] is False
    assert actual["forcedMoveSkipped"] is False


def test_move_justification_enter_focuses_confirm_without_newline():
    if not shutil.which("node"):
        pytest.skip("node is required for move justification JS regression coverage")

    result = subprocess.run(
        ["node", "-e", NODE_PROMPT_KEYDOWN_CHECK],
        cwd=REPO_ROOT,
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    actual = json.loads(result.stdout)

    assert actual == {"focused": True, "prevented": True}
