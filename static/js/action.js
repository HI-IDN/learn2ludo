// Learn2Ludo current action panel.
// Classic script, not ES module.
// This owns the status panel that says whose turn it is, what to do next,
// and the dice/roll button state.

function renderCurrentAction() {
  if (!gameState) return;
  const phase = gameState.phase;
  const cp = gameState.current_player ?? gameState.player ?? 0;
  const color = COLORS[playerColorName(cp, gameState.num_players)] || COLORS.blue;
  const banner = document.getElementById('turn-banner');
  const name = document.getElementById('turn-player-name');
  const instr = document.getElementById('action-instruction');
  const roll = document.getElementById('roll-btn');
  if (!banner || !name || !instr || !roll) return;

  banner.classList.remove('idle');
  banner.style.background = color;
  const icon = banner.querySelector('i');
  if (icon) icon.className = getPlayerType(cp) !== 'human' ? 'fa-solid fa-robot' : 'fa-solid fa-user';

  if (gameState.winner !== null && gameState.winner !== undefined) {
    name.textContent = `${getPlayerName(gameState.winner)} wins`;
    instr.textContent = 'Game finished.';
    roll.disabled = true;
    return;
  }

  name.textContent = `${getPlayerName(cp)}'s turn`;

  if (phase === 'rolling') instr.textContent = 'Roll the dice.';
  else if (phase === 'moving') instr.textContent = 'Choose a pawn to move.';
  else if (phase === 'next') instr.textContent = 'Pass to the next player.';
  else if (phase === 'finished') instr.textContent = 'Game finished.';
  else instr.textContent = 'Waiting for next action.';

  roll.disabled = phase !== 'rolling';
  roll.style.background = roll.disabled ? '' : '#10099F';
  roll.style.borderColor = roll.disabled ? '' : '#10099F';
}
