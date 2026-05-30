// Learn2Ludo current action panel.
// Classic script, not ES module.
// This owns the status panel that says whose turn it is, what to do next,
// and the dice/roll button state.

function renderCurrentAction() {
  if (!gameState) return;
  const phase = gameState.phase;
  const cp = gameState.current_player ?? gameState.player ?? 0;
  const color = COLORS[playerColorName(cp, gameState.num_players)] || COLORS.blue;
  const cardTop = document.getElementById('action-card-top');
  const avatarIcon = document.getElementById('action-avatar-icon');
  const name = document.getElementById('turn-player-name');
  const instr = document.getElementById('action-instruction');
  const dice = document.getElementById('dice-face');
  if (!cardTop || !name || !instr) return;

  cardTop.classList.remove('idle');
  cardTop.style.background = color;
  if (avatarIcon) avatarIcon.className = `action-avatar-icon fa-solid ${getPlayerType(cp) !== 'human' ? 'fa-robot' : 'fa-user'}`;

  if (gameState.winner !== null && gameState.winner !== undefined) {
    if (avatarIcon) avatarIcon.className = 'action-avatar-icon fa-solid fa-crown';
    name.textContent = `${getPlayerName(gameState.winner)} wins!`;
    if (!cardTop.dataset.winSoundPlayed) {
      cardTop.dataset.winSoundPlayed = '1';
      if (typeof playSound === 'function') playSound('win');
      if (typeof stopElapsedTimer === 'function') stopElapsedTimer();
    }
    const elapsed = typeof _formatElapsed === 'function' ? _formatElapsed() : '';
    instr.innerHTML = `Game finished${elapsed ? ` · <span id="game-elapsed">${elapsed}</span>` : ''}.`;
    if (dice) { dice.style.cursor = 'default'; dice.style.opacity = '0.45'; }
    return;
  }
  delete cardTop.dataset.winSoundPlayed;

  name.innerHTML = `${getPlayerName(cp)}'s turn <span id="game-elapsed" class="action-elapsed"></span>`;

  const canRoll = phase === 'rolling';
  if (phase === 'rolling') {
    const yardCount = gameState.yard_roll_count || 0;
    const yardMax   = gameState.max_yard_rolls  || 3;
    instr.textContent = yardCount > 0
      ? `Try ${yardCount + 1}/${yardMax} — roll to enter.`
      : 'Click the dice to roll.';
  } else if (phase === 'moving') instr.textContent = 'Choose a pawn to move.';
  else if (phase === 'next') instr.textContent = 'Pass to the next player.';
  else if (phase === 'finished') instr.textContent = 'Game finished.';
  else instr.textContent = 'Waiting for next action.';

  if (dice) { dice.style.cursor = canRoll ? 'pointer' : 'default'; dice.style.opacity = canRoll ? '' : '0.45'; }
}
