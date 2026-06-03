// Post-game flow — lives inside #board-area, no full-screen overlay.
//
// Sequence:
//   1. Game ends → reflection cards shown one per human player (inside board area)
//   2. After all reflections → stats panel shown with Board|Stats toggle
//
// The board SVG stays in the DOM; it's just hidden while stats are shown.

let _postgameShown  = false;
let _reflections    = [];
let _playerStats    = null;

function resetPostGame() {
  _postgameShown = false;
  _reflections   = [];
  _playerStats   = null;
  _removePostgameUI();
}

function _removePostgameUI() {
  document.getElementById('postgame-toggle')?.remove();
  document.getElementById('postgame-reflection')?.remove();
  document.getElementById('postgame-stats')?.remove();
  const bw = document.getElementById('board-wrap');
  if (bw) bw.style.display = '';
}

// ── Replay entry point (no reflection, called from replay.js) ───────────────

function showReplayStats(replayData) {
  if (_postgameShown) return;
  _postgameShown = true;
  _reflections   = [];
  _playerStats   = replayData.player_stats || null;
  if (!_playerStats) { _postgameShown = false; return; }
  // Sync gameState fields needed by _mountStats / _buildStatsPanel
  if (replayData.winner !== undefined)       gameState.winner        = replayData.winner;
  if (replayData.winner_color !== undefined) gameState.winner_color  = replayData.winner_color;
  if (replayData.winners !== undefined)      gameState.winners       = replayData.winners;
  _mountStats();
}

// ── Entry point (called from renderGame) ────────────────────────────────────

function maybeShowPostGame() {
  if (_postgameShown) return;
  if (!gameState || gameState.winner === null) return;
  if (!gameState.player_stats) return;   // only on true finish
  _postgameShown = true;
  _playerStats   = gameState.player_stats;
  _reflections   = [];
  _startReflectionPhase();
}

// ── Reflection phase ─────────────────────────────────────────────────────────

function _isCustomBot(i) {
  const registry = typeof getBotRegistry === 'function' ? getBotRegistry() : [];
  const botId = settings.bot_ids?.[i];
  const bot = registry.find(b => b.id === botId);
  return !!bot?.designer;
}

function _reflectionPlayersInOrder() {
  const n = gameState.num_players || 1;
  return Array.from({length: n}, (_, i) => i)
    .filter(i => gamePlayerType(i) === 'human' || _isCustomBot(i));
}

function _startReflectionPhase() {
  const players = _reflectionPlayersInOrder();
  if (!players.length) { _mountStats(); return; }
  _showReflectionCard(players, 0);
}

function _boardArea() { return document.getElementById('board-area'); }
function _boardWrap()  { return document.getElementById('board-wrap'); }

function _showReflectionCard(players, idx) {
  if (idx >= players.length) { _mountStats(); return; }

  const playerIdx = players[idx];
  const isBot     = gamePlayerType(playerIdx) !== 'human';
  const color     = gameState.players[playerIdx]?.color || 'blue';
  const name      = gamePlayerName(playerIdx);
  const hex       = COLORS[color] || '#888';
  const icon      = isBot ? 'fa-robot' : 'fa-user';
  const title     = isBot ? `How did ${escapeAttr(name)} play?` : 'How did you play?';
  const sub       = isBot
    ? 'Rate this bot\'s play style before seeing the stats.'
    : 'Rate yourself before seeing the stats.';
  const nextLabel = idx < players.length - 1 ? 'Next' : 'See stats';

  _boardWrap().style.display = 'none';
  document.getElementById('postgame-reflection')?.remove();

  const axis = (id, lo, hi) => `
    <div class="pg-axis">
      <div class="pg-axis-labels"><span style="color:${hex}">${lo}</span><span style="color:#8A91A0">${hi}</span></div>
      <div class="pg-pips" id="${id}">
        ${[1,2,3,4,5].map(v=>`<button class="pg-pip" data-v="${v}">${v}</button>`).join('')}
      </div>
    </div>`;

  const el = document.createElement('div');
  el.id = 'postgame-reflection';
  el.innerHTML = `
    <div class="pg-reflect-badge" style="--pc:${hex}">
      <i class="fa-solid ${icon}"></i> ${escapeAttr(name)}
    </div>
    <h2 class="pg-reflect-title">${title}</h2>
    <p class="pg-reflect-sub">${sub}</p>
    ${axis('r-aggressive', 'Aggressive', 'Passive')}
    ${axis('r-risky',      'Risky',      'Cautious')}
    ${axis('r-lucky',      'Lucky',      'Unlucky')}
    <div class="pg-reflect-actions">
      <button class="btn btn-primary" id="r-next" disabled>${nextLabel}</button>
      <button class="btn btn-ghost" id="r-skip">Skip</button>
    </div>
  `;
  _boardArea().appendChild(el);

  let agg = null, risk = null, lucky = null;
  const nextBtn = el.querySelector('#r-next');
  const allSet  = () => agg && risk && lucky;

  ['r-aggressive', 'r-risky', 'r-lucky'].forEach(axisId => {
    el.querySelectorAll(`#${axisId} .pg-pip`).forEach(b => b.addEventListener('click', () => {
      el.querySelectorAll(`#${axisId} .pg-pip`).forEach(x => x.classList.remove('sel'));
      b.classList.add('sel');
      if (axisId === 'r-aggressive') agg   = +b.dataset.v;
      if (axisId === 'r-risky')      risk  = +b.dataset.v;
      if (axisId === 'r-lucky')      lucky = +b.dataset.v;
      nextBtn.disabled = !allSet();
    }));
  });

  nextBtn.addEventListener('click', () => {
    _reflections.push({ player: playerIdx, color, name, is_bot: isBot,
      self_aggressive: agg, self_risky: risk, self_lucky: lucky,
      skipped: false, timestamp: new Date().toISOString() });
    _showReflectionCard(players, idx + 1);
  });
  el.querySelector('#r-skip').addEventListener('click', () => {
    _reflections.push({ player: playerIdx, color, name, is_bot: isBot,
      self_aggressive: null, self_risky: null, self_lucky: null,
      skipped: true, timestamp: new Date().toISOString() });
    _showReflectionCard(players, idx + 1);
  });
}

// ── Stats panel ───────────────────────────────────────────────────────────────

function _mountStats() {
  if (_reflections.length) _saveReflections();
  document.getElementById('postgame-reflection')?.remove();

  // Toggle strip
  if (!document.getElementById('postgame-toggle')) {
    const tog = document.createElement('div');
    tog.id = 'postgame-toggle';
    tog.innerHTML = `
      <button class="pg-tog-btn" id="tog-board" onclick="_togBoard()">
        <i class="fa-solid fa-border-all"></i> Board
      </button>
      <button class="pg-tog-btn active" id="tog-stats" onclick="_togStats()">
        <i class="fa-solid fa-chart-bar"></i> Stats
      </button>
    `;
    _boardArea().insertBefore(tog, _boardArea().firstChild);
  }

  _boardWrap().style.display = 'none';
  _buildStatsPanel();
}

function _togBoard() {
  _boardWrap().style.display = '';
  document.getElementById('postgame-stats').style.display = 'none';
  document.getElementById('tog-board').classList.add('active');
  document.getElementById('tog-stats').classList.remove('active');
}
function _togStats() {
  _boardWrap().style.display = 'none';
  document.getElementById('postgame-stats').style.display = '';
  document.getElementById('tog-stats').classList.add('active');
  document.getElementById('tog-board').classList.remove('active');
}

function _buildStatsPanel() {
  document.getElementById('postgame-stats')?.remove();

  const stats   = _playerStats || [];
  const winner  = gameState.winner;
  const wColor  = gameState.winner_color || 'blue';
  const wName   = gamePlayerName(winner);
  const wHex    = COLORS[wColor] || '#888';
  const n       = stats.length;

  const playerOptions = stats.map(s =>
    `<label class="pg-radio-label">
      <input type="radio" name="dice-player" value="${s.player}">
      <span style="color:${COLORS[s.color]||'#888'}">${escapeAttr(gamePlayerName(s.player))}</span>
    </label>`
  ).join('');

  const el = document.createElement('div');
  el.id = 'postgame-stats';
  el.innerHTML = `
    <div class="pg-winner-banner" style="--wc:${wHex}">
      <i class="fa-solid fa-trophy"></i> ${escapeAttr(wName)} wins!
    </div>

    <div class="pg-section">
      <div class="pg-section-head">
        <span class="pg-section-title">Dice distribution</span>
        <div class="pg-radio-group">
          <label class="pg-radio-label">
            <input type="radio" name="dice-player" value="all" checked> All players
          </label>
          ${playerOptions}
        </div>
      </div>
      <div id="pg-histogram"></div>
    </div>

    <div class="pg-section">
      <span class="pg-section-title">Player stats</span>
      <div class="pg-stat-table" style="--cols:${n}">
        ${_buildStatTable(stats)}
      </div>
    </div>

    ${_reflections.some(r => !r.skipped) ? `
    <div class="pg-section">
      <span class="pg-section-title">Self-perception vs actual play</span>
      <p class="pg-section-hint">◆ Measured &nbsp;○ Self-rated &nbsp;— dashed line connects them</p>
      <div class="pg-scatter-wrap">
        <div class="pg-scatter-y-labels"><span>Risky</span><span>Cautious</span></div>
        <div>
          <canvas id="pg-scatter" width="260" height="260"></canvas>
          <div class="pg-scatter-x-labels"><span>Aggressive</span><span>Passive</span></div>
        </div>
      </div>
    </div>` : ''}
  `;
  _boardArea().appendChild(el);

  // Draw histogram (default: all players)
  _drawHistogram('all');
  el.querySelectorAll('input[name="dice-player"]').forEach(r =>
    r.addEventListener('change', () => _drawHistogram(r.value))
  );

  // Draw scatter if reflections exist
  if (_reflections.some(r => !r.skipped)) _drawScatter();
}

// ── Histogram ────────────────────────────────────────────────────────────────

function _drawHistogram(playerFilter) {
  const container = document.getElementById('pg-histogram');
  if (!container) return;
  const stats = _playerStats || [];
  const faces = [1,2,3,4,5,6];
  const filtered = playerFilter === 'all' ? stats : stats.filter(s => String(s.player) === String(playerFilter));

  // Find global max for y-axis scale
  let maxCount = 1;
  filtered.forEach(s => {
    faces.forEach(f => { maxCount = Math.max(maxCount, s.dice_distribution?.[f] || 0); });
  });

  // Build grouped bars for each face value
  const barGroups = faces.map(face => {
    const bars = filtered.map(s => {
      const count = s.dice_distribution?.[face] || 0;
      const pct   = Math.round(count / maxCount * 100);
      const hex   = COLORS[s.color] || '#888';
      return `<div class="pg-bar" style="--h:${pct}%;--bc:${hex}" title="${gamePlayerName(s.player)}: ${count}"></div>`;
    }).join('');
    return `<div class="pg-bar-group">
      <div class="pg-bars">${bars}</div>
      <div class="pg-bar-face">${DICE_FACES[face]}</div>
    </div>`;
  }).join('');

  container.innerHTML = `<div class="pg-histogram">${barGroups}</div>`;
}

// ── Stat table ───────────────────────────────────────────────────────────────

function _buildStatTable(stats) {
  const rows = [
    { label: 'Rolls',              key: 'rolls' },
    { label: 'Avg dice',           key: 'dice_avg' },
    { label: 'Luck (avg−3.5)',     key: 'luck_score',          fmt: v => (v>0?'+':'')+v },
    { label: 'Sixes',              key: 'sixes_pct',            fmt: v => v+'%' },
    { label: 'Captures made',      key: 'captures_made' },
    { label: 'Captured',           key: 'captures_suffered' },
    { label: 'Blockades formed',   key: 'blockades_formed' },
    { label: 'Blocked',            key: 'times_blocked' },
    { label: 'Pawns finished',         key: 'pawns_finished' },
    { label: 'Forfeit turns',           key: '_forfeit_total',    derived: s => (s.forfeit_no_pawn||0)+(s.forfeit_blockade||0)+(s.forfeit_no_exact||0) },
    { label: '— no pawn out yet',       key: 'forfeit_no_pawn',   cls: 'indent' },
    { label: '— blocked by opponent',   key: 'forfeit_blockade',  cls: 'indent' },
    { label: '— need exact roll',       key: 'forfeit_no_exact',  cls: 'indent' },
  ];

  const header = `<div class="pg-stat-row pg-stat-head">
    <span></span>
    ${stats.map(s=>`<span style="color:${COLORS[s.color]||'#888'}">${escapeAttr(gamePlayerName(s.player))}</span>`).join('')}
  </div>`;

  const body = rows.map(row => `
    <div class="pg-stat-row${row.cls ? ' '+row.cls : ''}">
      <span class="pg-stat-label">${row.label}</span>
      ${stats.map(s => {
        const v = row.derived ? row.derived(s) : s[row.key];
        return `<span>${v == null ? '—' : row.fmt ? row.fmt(v) : v}</span>`;
      }).join('')}
    </div>
  `).join('');

  // Self-rated luck row — only if any reflection has self_lucky
  const luckyRatings = _reflections.filter(r => !r.skipped && r.self_lucky != null);
  const luckyRow = luckyRatings.length ? `
    <div class="pg-stat-row pg-self-row">
      <span class="pg-stat-label">Self-rated luck</span>
      ${stats.map(s => {
        const ref = luckyRatings.find(r => r.player === s.player);
        if (!ref) return '<span>—</span>';
        const label = ['','Lucky','Somewhat lucky','Neutral','Somewhat unlucky','Unlucky'][ref.self_lucky] || ref.self_lucky;
        return `<span title="${label}">${ref.self_lucky}</span>`;
      }).join('')}
    </div>
  ` : '';

  return header + body + luckyRow;
}

// ── Scatter plot ──────────────────────────────────────────────────────────────

function _drawScatter() {
  const canvas = document.getElementById('pg-scatter');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height, pad = 28;

  ctx.clearRect(0, 0, W, H);

  // Axis lines
  ctx.strokeStyle = '#E2E5EE';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad, H/2); ctx.lineTo(W-pad, H/2);
  ctx.moveTo(W/2, pad); ctx.lineTo(W/2, H-pad);
  ctx.stroke();

  const toX = agg  => pad + (agg  ?? 0.5) * (W - 2*pad);
  const toY = risk => H - pad - (risk ?? 0.5) * (H - 2*pad);

  (_playerStats || []).forEach(s => {
    const hex = COLORS[s.color] || '#888';
    const mx = toX(s.aggression_score ?? 0.5);
    const my = toY(s.risk_score ?? 0.5);

    // Measured: filled diamond
    ctx.fillStyle = hex;
    ctx.beginPath();
    const r = 7;
    ctx.moveTo(mx, my-r); ctx.lineTo(mx+r, my); ctx.lineTo(mx, my+r); ctx.lineTo(mx-r, my);
    ctx.closePath(); ctx.fill();

    // Self-rated: hollow circle
    const ref = _reflections.find(r => r.player === s.player && !r.skipped);
    if (ref) {
      const selfAgg  = (ref.self_aggressive - 1) / 4;
      const selfRisk = 1 - (ref.self_risky - 1) / 4;
      const sx = toX(selfAgg), sy = toY(selfRisk);

      ctx.strokeStyle = hex; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sx, sy, 7, 0, 2*Math.PI); ctx.stroke();

      ctx.setLineDash([3,3]); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(mx, my); ctx.stroke();
      ctx.setLineDash([]);
    }
  });
}

// ── Persist reflections ───────────────────────────────────────────────────────

function _saveReflections() {
  fetch('/api/game/reflections', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({reflections: _reflections}),
  }).catch(() => {});
}
