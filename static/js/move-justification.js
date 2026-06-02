// Learn2Ludo move justification prompt.
// Classic script, not ES module.

let _pendingJustifiedMove = null;
let _moveJustificationSubmitting = false;
let _moveJustificationEligibleCounts = {};

function moveJustificationMode() {
  const mode = settings?.move_justification_frequency || 'always';
  return ['always', 'every-n', 'random', 'off'].includes(mode) ? mode : 'always';
}

function moveJustificationEveryN() {
  return Math.max(1, parseInt(settings?.move_justification_every_n || 2));
}

function moveJustificationRandomProbability() {
  const value = Number(settings?.move_justification_random_probability ?? 0.35);
  if (!Number.isFinite(value)) return 0.35;
  return Math.max(0, Math.min(1, value));
}

function resetMoveJustificationFrequency() {
  _moveJustificationEligibleCounts = {};
}

function isMoveJustificationEligible(move) {
  if (_moveJustificationSubmitting) return false;
  if (!gameState || !move) return false;
  if (gameState.phase !== 'moving') return false;
  if ((gameState.valid_moves || []).length < 2) return false;
  const playerType = typeof gamePlayerType === 'function'
    ? gamePlayerType(gameState.current_player)
    : getPlayerType(gameState.current_player);
  if (playerType !== 'human') return false;
  if (typeof isReplayActive === 'function' && isReplayActive()) return false;
  if (typeof isLiveHistoryBrowsing === 'function' && isLiveHistoryBrowsing()) return false;
  return true;
}

function moveJustificationPlayerKey() {
  return String(gameState?.current_player ?? 0);
}

function shouldPromptForEligibleMove(consume=false) {
  const mode = moveJustificationMode();
  if (mode === 'off') return false;
  if (mode === 'always') return true;

  if (mode === 'every-n') {
    const key = moveJustificationPlayerKey();
    const nextCount = (_moveJustificationEligibleCounts[key] || 0) + 1;
    if (consume) _moveJustificationEligibleCounts[key] = nextCount;
    return nextCount % moveJustificationEveryN() === 0;
  }

  if (mode === 'random') {
    return Math.random() < moveJustificationRandomProbability();
  }

  return true;
}

function shouldAskForMoveJustification(move) {
  return isMoveJustificationEligible(move) && shouldPromptForEligibleMove(false);
}

function moveNeedsJustification(move, justification) {
  return !String(justification || '').trim()
    && isMoveJustificationEligible(move)
    && shouldPromptForEligibleMove(true);
}

function isMoveJustificationBusy() {
  return _moveJustificationSubmitting;
}

function isMoveJustificationActive() {
  return !!_pendingJustifiedMove;
}

function pendingMoveJustificationPawnId() {
  return _pendingJustifiedMove?.pawn_id || null;
}

function requestMoveJustification(move) {
  _pendingJustifiedMove = {...move};
  _moveJustificationSubmitting = false;
  renderMoveJustificationPrompt();
  renderCurrentAction();
  renderPawnOptions();
  drawBoard();
}

function cancelMoveJustification() {
  _pendingJustifiedMove = null;
  _moveJustificationSubmitting = false;
  renderMoveJustificationPrompt();
  renderCurrentAction();
  renderPawnOptions();
  drawBoard();
}

function isMoveAwaitingJustification(globalIdx, pawnIdValue) {
  if (!_pendingJustifiedMove) return false;
  if (typeof _pendingJustifiedMove.piece_idx === 'number' && _pendingJustifiedMove.piece_idx === globalIdx) return true;
  return !!pawnIdValue && _pendingJustifiedMove.pawn_id === pawnIdValue;
}

function renderMoveJustificationPrompt() {
  const wrap = document.getElementById('move-justification-wrap');
  if (!wrap) return;
  if (!_pendingJustifiedMove) {
    wrap.innerHTML = '';
    wrap.hidden = true;
    return;
  }

  wrap.hidden = false;
  wrap.innerHTML = `
    <div class="move-justification-box">
      <label class="move-justification-label" for="move-justification-input">
        Why did you move this pawn?
      </label>
      <div class="move-justification-help">
        Use the pawn notation shown on the board, like R4 or Y2.
      </div>
      <textarea id="move-justification-input"
                class="move-justification-input"
                rows="3"
                maxlength="400"
                oninput="updateMoveJustificationConfirm()"
                onkeydown="moveJustificationKeydown(event)"
                placeholder="Add your reason"></textarea>
      <div class="move-justification-actions">
        <button class="btn btn-primary btn-sm"
                id="move-justification-confirm"
                type="button"
                onclick="confirmMoveJustification()"
                disabled>Confirm</button>
      </div>
    </div>`;
  document.getElementById('move-justification-input')?.focus();
}

function updateMoveJustificationConfirm() {
  const input = document.getElementById('move-justification-input');
  const confirm = document.getElementById('move-justification-confirm');
  if (confirm) confirm.disabled = !input?.value.trim() || _moveJustificationSubmitting;
}

function moveJustificationKeydown(event) {
  if (event.key === 'Enter') {
    event.preventDefault();
    document.getElementById('move-justification-confirm')?.focus();
  }
}

async function confirmMoveJustification() {
  if (!_pendingJustifiedMove || _moveJustificationSubmitting) return;
  const input = document.getElementById('move-justification-input');
  const justification = input?.value || '';
  if (!justification.trim()) {
    updateMoveJustificationConfirm();
    return;
  }

  const move = _pendingJustifiedMove;
  _moveJustificationSubmitting = true;
  updateMoveJustificationConfirm();
  _pendingJustifiedMove = null;
  renderMoveJustificationPrompt();
  await makeMove(move.piece_idx, move.target, move.pawn_id, justification);
  _moveJustificationSubmitting = false;
}
