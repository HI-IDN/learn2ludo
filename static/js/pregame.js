// pregame.js — Roll-for-first sequence rendered inside the Current Action box.

let _pg = null;

function showPregame(activeSlots) {
  const active = activeSlots
    || (typeof lobbyActiveSlots === 'function' ? lobbyActiveSlots() : [0,1,2,3]);
  const n = active.length;

  _pg = {
    n,
    active,
    rolls: Array(n).fill(null),
    competing: Array.from({length: n}, (_, i) => i),
    cursor: 0,
    rolling: false,
    round: 1,
  };

  if(typeof resetGameHistorySync==='function') resetGameHistorySync();
  document.getElementById('game-action-wrap')?.style.setProperty('display', 'none');
  _setPregameSubtitle('Determining starting player');
  _setDiceFaceClickable(true);
  _renderPregame();
  _renderPregameHistory();
  _scheduleAutoPreRoll();
}

function _hidePregame() {
  const container = document.getElementById('pregame-container');
  if (container) { container.style.display = 'none'; container.innerHTML = ''; }
  document.getElementById('game-action-wrap')?.style.removeProperty('display');
  _setPregameSubtitle('');
  _setActionCardTop(null, 'fa-circle-info', 'Start game', true);
  _pg = null;
}

function _setActionCardTop(color, iconClass, label, idle = false) {
  const top = document.getElementById('action-card-top');
  const icon = document.getElementById('action-avatar-icon');
  const name = document.getElementById('turn-player-name');
  if (!top) return;
  if (idle) {
    top.classList.add('idle');
    top.style.background = '';
  } else {
    top.classList.remove('idle');
    top.style.background = color || '';
  }
  if (icon) icon.className = `action-avatar-icon fa-solid ${iconClass}`;
  if (name) name.textContent = label;
}

function _setPregameSubtitle(text) {
  const el = document.getElementById('players-subtitle');
  if (el) el.textContent = text ? `· ${text}` : '';
}

function _renderPregame() {
  const container = document.getElementById('pregame-container');
  if (!container) return;
  container.style.display = 'block';

  const { n, competing, cursor, rolls } = _pg;
  const allRolled = cursor >= competing.length;
  const currentPlayerIdx = allRolled ? -1 : competing[cursor];

  // Drive the shared card-top header
  if (!allRolled) {
    const slot  = _pg.active[currentPlayerIdx];
    const color = COLORS[PLAYER_COLORS[slot]] || COLORS.blue;
    const name  = typeof getPlayerName === 'function' ? getPlayerName(currentPlayerIdx) : `Player ${currentPlayerIdx+1}`;
    _setActionCardTop(color, 'fa-dice-d6', `${name}'s roll`);
  } else {
    _setActionCardTop(null, 'fa-spinner fa-spin', 'Evaluating…', true);
  }

  const rows = Array.from({length: n}, (_, pi) => {
    const slot  = _pg.active[pi];
    const color = COLORS[PLAYER_COLORS[slot]] || COLORS.blue;
    const name  = typeof getPlayerName === 'function' ? getPlayerName(pi) : `Player ${pi+1}`;
    const roll  = rolls[pi];
    const isCompeting = competing.includes(pi);
    const isCurrent   = pi === currentPlayerIdx;

    let diceHtml;
    if (roll !== null && isCompeting) {
      diceHtml = `<span class="pg-dice-result" style="color:${color}">${['⚀','⚁','⚂','⚃','⚄','⚅'][roll-1]}</span>`;
    } else if (!isCompeting) {
      diceHtml = `<span class="pg-dice-result pg-dice-out">—</span>`;
    } else {
      diceHtml = `<span class="pg-dice-result pg-dice-waiting">·</span>`;
    }

    return `<div class="pg-player-row${isCurrent ? ' pg-current' : ''}${!isCompeting ? ' pg-eliminated' : ''}">
      <span class="pg-player-dot" style="background:${color}"></span>
      <span class="pg-player-name">${name}</span>
      ${diceHtml}
    </div>`;
  }).join('');

  container.innerHTML = `
    <div class="action-instruction">Highest roll goes first · ties re-roll · click dice to roll</div>
    <div class="pg-players">${rows}</div>`;
}

function _onDiceClick() {
  if (_pg) pregameRoll();
  else if (typeof rollDice === 'function') rollDice();
}

function _setDiceFaceClickable(enabled) {
  const el = document.getElementById('dice-face');
  if (!el) return;
  el.style.cursor = enabled ? 'pointer' : 'default';
  el.style.opacity = enabled ? '' : '0.45';
}

function pregameRoll() {
  if (!_pg || _pg.rolling) return;
  _pg.rolling = true;
  _setDiceFaceClickable(false);

  const playerIdx = _pg.competing[_pg.cursor];
  const diceEl = document.getElementById('dice-face');
  const faces = ['⚀','⚁','⚂','⚃','⚄','⚅'];
  let ticks = 0;

  const interval = setInterval(() => {
    if (diceEl) diceEl.textContent = faces[Math.floor(Math.random() * 6)];
    if (++ticks >= 8) {
      clearInterval(interval);
      const roll = Math.floor(Math.random() * 6) + 1;
      if (diceEl) diceEl.textContent = faces[roll - 1];
      _pg.rolls[playerIdx] = roll;
      _pg.cursor++;
      _pg.rolling = false;
      if (typeof playSound === 'function') playSound('move');
      const slot = _pg.active[playerIdx];
      const name = typeof getPlayerName === 'function' ? getPlayerName(playerIdx) : `Player ${playerIdx+1}`;
      const color = COLORS[PLAYER_COLORS[slot]] || COLORS.blue;
      if(typeof pushPregameRoll === 'function') pushPregameRoll(playerIdx, name, color, roll, _pg.round);
      _renderPregameHistory();

      if (_pg.cursor >= _pg.competing.length) {
        _renderPregame();
        setTimeout(_evaluatePregame, 600);
      } else {
        _setDiceFaceClickable(true);
        _renderPregame();
        _scheduleAutoPreRoll();
      }
    }
  }, 60);
}

function _evaluatePregame() {
  const { competing, rolls } = _pg;
  const maxRoll = Math.max(...competing.map(i => rolls[i]));
  const winners = competing.filter(i => rolls[i] === maxRoll);

  if (winners.length === 1) {
    _showPregameWinner(winners[0]);
  } else {
    _showTieMessage(winners, maxRoll);
  }
}

function _showPregameWinner(winnerIdx) {
  const container = document.getElementById('pregame-container');
  if (!container) return;
  const slot  = _pg.active[winnerIdx];
  const color = COLORS[PLAYER_COLORS[slot]] || COLORS.blue;
  const name  = typeof getPlayerName === 'function' ? getPlayerName(winnerIdx) : `Player ${winnerIdx+1}`;

  _setActionCardTop(color, 'fa-crown', `${name} goes first!`);
  container.innerHTML = `<div class="action-instruction" style="text-align:center">Starting game…</div>`;

  setTimeout(() => {
    _hidePregame();
    newGame(winnerIdx);
  }, 1800);
}

function _renderPregameHistory() {
  if (typeof renderMoveHistory === 'function') renderMoveHistory();
}

let _pgAutoTimer = null;
function _scheduleAutoPreRoll() {
  clearTimeout(_pgAutoTimer);
  const speed = (typeof settings !== 'undefined' && settings.auto_play_speed) || 'off';
  if (speed === 'off' || !_pg) return;
  const delay = speed === 'fast' ? 200 : 900;
  _pgAutoTimer = setTimeout(() => { if (_pg && !_pg.rolling) pregameRoll(); }, delay);
}

// Kick off auto-roll when pregame first starts (first player's roll)
function _maybeTriggerAutoPreRoll() {
  _scheduleAutoPreRoll();
}


function _showTieMessage(tiedPlayers, tiedValue) {
  const container = document.getElementById('pregame-container');
  if (!container) return;
  const names = tiedPlayers.map(i => typeof getPlayerName === 'function' ? getPlayerName(i) : `Player ${i+1}`);

  _setActionCardTop(null, 'fa-equals', `Tie — ${names.join(' & ')} re-roll`, true);
  const existing = container.querySelector('.pg-players')?.outerHTML || '';
  container.innerHTML = `
    <div class="action-instruction">Tied on ${['⚀','⚁','⚂','⚃','⚄','⚅'][tiedValue-1]} · only tied players roll again</div>
    ${existing}`;

  setTimeout(() => {
    tiedPlayers.forEach(i => { _pg.rolls[i] = null; });
    _pg.competing = tiedPlayers;
    _pg.cursor = 0;
    _pg.rolling = false;
    _pg.round++;
    _renderPregame();
    _scheduleAutoPreRoll();
  }, 1600);
}
