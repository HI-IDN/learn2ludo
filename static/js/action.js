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
  cardTop.style.backgroundImage = '';
  cardTop.style.background = color;
  if (avatarIcon) avatarIcon.className = `action-avatar-icon fa-solid ${getPlayerType(cp) !== 'human' ? 'fa-robot' : 'fa-user'}`;

  const _winners = winnerPlayersForBanner();
  if (_winners.length) {
    if (avatarIcon) avatarIcon.className = 'action-avatar-icon fa-solid fa-crown';
    cardTop.style.background = winnerBannerBackground(_winners);
    const names = winnerNamesForBanner(_winners);
    name.textContent = names.join(' & ') + (_winners.length > 1 ? ' win!' : ' wins!');
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

  name.textContent = `${getPlayerName(cp)}'s turn`;

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

function winnerPlayersForBanner() {
  const raw = gameState?.winners?.length ? gameState.winners : (gameState?.winner != null ? [gameState.winner] : []);
  const unique = [...new Set(raw.map(Number).filter(Number.isInteger))];
  const order = typeof playerDisplayOrder === 'function'
    ? playerDisplayOrder(gameState?.num_players || unique.length || 1)
    : unique;
  return unique.sort((a, b) => {
    const ai = order.indexOf(a);
    const bi = order.indexOf(b);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
}

function winnerPlayerColor(playerIdx) {
  const player = (gameState?.players || []).find(p => Number(p.index) === Number(playerIdx));
  const colorName = player?.color || playerColorName(playerIdx, gameState?.num_players || 1);
  return COLORS[colorName] || COLORS.blue;
}

function winnerPlayerName(playerIdx) {
  const player = (gameState?.players || []).find(p => Number(p.index) === Number(playerIdx));
  return player?.name || getPlayerName(playerIdx);
}

function winnerPlayerColorName(playerIdx) {
  const player = (gameState?.players || []).find(p => Number(p.index) === Number(playerIdx));
  return player?.color || playerColorName(playerIdx, gameState?.num_players || 1);
}

function winnerBannerBackground(winners) {
  const colors = winners.map(winnerPlayerColor);
  if (colors.length <= 1) return colors[0] || COLORS.blue;
  const stops = colors.map((color, i) => {
    const from = (i * 100 / colors.length).toFixed(3);
    const to = ((i + 1) * 100 / colors.length).toFixed(3);
    return `${color} ${from}%, ${color} ${to}%`;
  });
  return `linear-gradient(90deg, ${stops.join(', ')})`;
}

function winnerNamesForBanner(winners) {
  const names = winners.map(winnerPlayerName);
  const counts = names.reduce((acc, n) => ({...acc, [n]: (acc[n] || 0) + 1}), {});
  return winners.map((w, i) => {
    if (counts[names[i]] <= 1) return names[i];
    return `${names[i]} (${winnerPlayerColorName(w)})`;
  });
}
