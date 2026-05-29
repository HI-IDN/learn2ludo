// pregame.js — Roll-for-first sequence rendered inside the Current Action box.

let _pg = null;

function showPregame() {
  const active = typeof lobbyActiveSlots === 'function' ? lobbyActiveSlots() : [0,1,2,3];
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
  _renderPregame();
  _renderPregameHistory();
}

function _hidePregame() {
  const container = document.getElementById('pregame-container');
  if (container) { container.style.display = 'none'; container.innerHTML = ''; }
  document.getElementById('game-action-wrap')?.style.removeProperty('display');
  _setPregameSubtitle('');
  _pg = null;
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

  // Turn banner for current roller
  let bannerHtml = '';
  if (!allRolled) {
    const slot  = _pg.active[currentPlayerIdx];
    const color = COLORS[PLAYER_COLORS[slot]] || COLORS.blue;
    const name  = typeof getPlayerName === 'function' ? getPlayerName(currentPlayerIdx) : `Player ${currentPlayerIdx+1}`;
    bannerHtml = `<div class="turn-banner" style="background:${color}">
      <i class="fa-solid fa-dice-d6"></i>
      <span>${name}'s roll</span>
    </div>`;
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
      diceHtml = `<span class="pg-dice-result pg-dice-waiting">&middot;</span>`;
    }

    return `<div class="pg-player-row${isCurrent ? ' pg-current' : ''}${!isCompeting ? ' pg-eliminated' : ''}">
      <span class="pg-player-dot" style="background:${color}"></span>
      <span class="pg-player-name">${name}</span>
      ${diceHtml}
    </div>`;
  }).join('');

  let footer;
  if (allRolled) {
    footer = `<div class="pg-footer-wait"><i class="fa-solid fa-spinner fa-spin"></i> Evaluating…</div>`;
  } else {
    footer = `<div style="margin-top:12px;display:flex;justify-content:center;">
      <button class="btn btn-primary btn-sm" onclick="pregameRoll()">
        <i class="fa-solid fa-dice-d6"></i> Roll
      </button>
    </div>`;
  }

  container.innerHTML = `
    ${bannerHtml}
    <div class="action-instruction">Highest roll goes first · ties re-roll</div>
    <div class="pg-players">${rows}</div>
    ${footer}`;
}

function pregameRoll() {
  if (!_pg || _pg.rolling) return;
  _pg.rolling = true;

  const playerIdx = _pg.competing[_pg.cursor];
  const container = document.getElementById('pregame-container');
  const waitEl = container?.querySelector('.pg-dice-waiting');
  const faces = ['⚀','⚁','⚂','⚃','⚄','⚅'];
  let ticks = 0;

  const interval = setInterval(() => {
    if (waitEl) waitEl.textContent = faces[Math.floor(Math.random() * 6)];
    if (++ticks >= 8) {
      clearInterval(interval);
      const roll = Math.floor(Math.random() * 6) + 1;
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
        _renderPregame();
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

  container.innerHTML = `
    <div class="turn-banner" style="background:${color}">
      <i class="fa-solid fa-crown"></i>
      <span>${name} goes first!</span>
    </div>
    <div class="action-instruction">Starting game…</div>`;

  setTimeout(() => {
    _hidePregame();
    newGame(winnerIdx);
  }, 1800);
}

function _renderPregameHistory() {
  if (typeof renderMoveHistory === 'function') renderMoveHistory();
}


function _showTieMessage(tiedPlayers, tiedValue) {
  const container = document.getElementById('pregame-container');
  if (!container) return;
  const names = tiedPlayers.map(i => typeof getPlayerName === 'function' ? getPlayerName(i) : `Player ${i+1}`);

  const existing = container.querySelector('.pg-players')?.outerHTML || '';
  container.innerHTML = `
    <div class="turn-banner idle">
      <i class="fa-solid fa-equals"></i>
      <span>Tie on ${['⚀','⚁','⚂','⚃','⚄','⚅'][tiedValue-1]} — ${names.join(' & ')} re-roll</span>
    </div>
    <div class="action-instruction">Only tied players roll again</div>
    ${existing}`;

  setTimeout(() => {
    tiedPlayers.forEach(i => { _pg.rolls[i] = null; });
    _pg.competing = tiedPlayers;
    _pg.cursor = 0;
    _pg.rolling = false;
    _pg.round++;
    _renderPregame();
  }, 1600);
}
