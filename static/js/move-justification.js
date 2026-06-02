// Learn2Ludo move justification prompt.
// Classic script, not ES module.

let _pendingJustifiedMove = null;
let _moveJustificationSubmitting = false;

function shouldAskForMoveJustification(move) {
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

function moveNeedsJustification(move, justification) {
  return !String(justification || '').trim() && shouldAskForMoveJustification(move);
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
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault();
    confirmMoveJustification();
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
