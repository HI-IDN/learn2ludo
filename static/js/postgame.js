// Post-game flow.
//
// Reflection: small centered modal (one per human/custom-bot, private).
// Stats: injected into #side-panel (board stays fully visible).
// Replay: showReplayStats() skips reflection and goes straight to stats.

let _postgameShown = false;
let _reflections   = [];
let _playerStats   = null;
let _sidePanelOrigHTML = null;

function resetPostGame() {
  _postgameShown = false;
  _reflections   = [];
  _playerStats   = null;
  _restoreSidePanel();
  document.getElementById('pg-reflection-modal')?.remove();
}

function _restoreSidePanel() {
  const sp = document.getElementById('side-panel');
  if (sp && _sidePanelOrigHTML !== null) {
    sp.innerHTML = _sidePanelOrigHTML;
    _sidePanelOrigHTML = null;
  }
}

// ── Replay entry (no reflection) ─────────────────────────────────────────────

function showReplayStats(replayData) {
  if (_postgameShown) return;
  if (!replayData?.player_stats) return;
  _postgameShown = true;
  _reflections   = [];
  _playerStats   = replayData.player_stats;
  if (replayData.winner       !== undefined) gameState.winner       = replayData.winner;
  if (replayData.winner_color !== undefined) gameState.winner_color = replayData.winner_color;
  if (replayData.winners      !== undefined) gameState.winners      = replayData.winners;
  _mountStatsSidePanel();
}

// ── Live game entry (called from renderGame) ──────────────────────────────────

function maybeShowPostGame() {
  if (_postgameShown) return;
  if (!gameState || gameState.winner === null) return;
  if (!gameState.player_stats) return;
  _postgameShown = true;
  _playerStats   = gameState.player_stats;
  _reflections   = [];
  _startReflectionPhase();
}

// ── Reflection (small modal) ──────────────────────────────────────────────────

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
  if (!players.length) { _mountStatsSidePanel(); return; }
  _promptReflection(players, 0);
}

function _promptReflection(players, idx) {
  if (idx >= players.length) { _mountStatsSidePanel(); return; }

  const playerIdx = players[idx];
  const isBot  = gamePlayerType(playerIdx) !== 'human';
  const color  = gameState.players[playerIdx]?.color || 'blue';
  const name   = gamePlayerName(playerIdx);
  const hex    = COLORS[color] || '#888';
  const avatar = typeof playerAvatarHtml === 'function'
    ? playerAvatarHtml(playerIdx, { className: 'pg-reflect-avatar', color: hex })
    : `<span class="pg-reflect-avatar" style="color:${hex}"><i class="fa-solid ${isBot ? 'fa-robot' : (typeof getPlayerIcon==='function' ? getPlayerIcon(playerIdx) : 'fa-face-smile')}"></i></span>`;
  const title  = isBot ? `How did ${escapeAttr(name)} play?` : 'How did you play?';
  const sub    = isBot ? `Rate this bot's play before seeing the stats.` : 'Rate yourself before seeing the stats.';
  const btnLbl = idx < players.length - 1 ? 'Next' : 'See stats';

  document.getElementById('pg-reflection-modal')?.remove();

  const axis = (id, lo, hi) => `
    <div class="pg-axis">
      <div class="pg-axis-labels">
        <span style="color:${hex}">${lo}</span><span style="color:#8A91A0">${hi}</span>
      </div>
      <div class="pg-pips" id="${id}">
        ${[1,2,3,4,5].map(v=>`<button class="pg-pip" data-v="${v}">${v}</button>`).join('')}
      </div>
    </div>`;

  const modal = document.createElement('div');
  modal.id = 'pg-reflection-modal';
  modal.innerHTML = `
    <div class="pg-reflect-card">
      <div class="pg-reflect-badge" style="--pc:${hex}">
        ${avatar} ${escapeAttr(name)}
      </div>
      <h2 class="pg-reflect-title">${title}</h2>
      <p class="pg-reflect-sub">${sub}</p>
      ${axis('r-aggressive', 'Aggressive', 'Passive')}
      ${axis('r-risky',      'Risky',      'Cautious')}
      ${axis('r-lucky',      'Lucky',      'Unlucky')}
      <div class="pg-reflect-actions">
        <button class="btn btn-primary" id="r-next" disabled>${btnLbl}</button>
        <button class="btn btn-ghost" id="r-skip">Skip</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  let agg = null, risk = null, lucky = null;
  const nextBtn = modal.querySelector('#r-next');

  ['r-aggressive','r-risky','r-lucky'].forEach(axisId => {
    modal.querySelectorAll(`#${axisId} .pg-pip`).forEach(b => b.addEventListener('click', () => {
      modal.querySelectorAll(`#${axisId} .pg-pip`).forEach(x => x.classList.remove('sel'));
      b.classList.add('sel');
      if (axisId === 'r-aggressive') agg   = +b.dataset.v;
      if (axisId === 'r-risky')      risk  = +b.dataset.v;
      if (axisId === 'r-lucky')      lucky = +b.dataset.v;
      nextBtn.disabled = !(agg && risk && lucky);
    }));
  });

  nextBtn.addEventListener('click', () => {
    _reflections.push({ player: playerIdx, color, name, is_bot: isBot,
      self_aggressive: agg, self_risky: risk, self_lucky: lucky,
      skipped: false, timestamp: new Date().toISOString() });
    modal.remove();
    _promptReflection(players, idx + 1);
  });
  modal.querySelector('#r-skip').addEventListener('click', () => {
    _reflections.push({ player: playerIdx, color, name, is_bot: isBot,
      self_aggressive: null, self_risky: null, self_lucky: null,
      skipped: true, timestamp: new Date().toISOString() });
    modal.remove();
    _promptReflection(players, idx + 1);
  });
}

// ── Stats side panel ──────────────────────────────────────────────────────────

function _mountStatsSidePanel() {
  if (_reflections.length) _saveReflections();

  const sp = document.getElementById('side-panel');
  if (!sp) return;
  _sidePanelOrigHTML = sp.innerHTML;

  const stats   = _playerStats || [];
  const winner  = gameState.winner;
  const wColor  = gameState.winner_color || 'blue';
  const wName   = gamePlayerName(winner);
  const wHex    = COLORS[wColor] || '#888';
  const n       = stats.length;
  const { captureMatrix, blockMatrix } = _computeMatrices(stats);
  const hasReflections = _reflections.some(r => !r.skipped);

  sp.innerHTML = `
    <div id="pg-side-header">
      <div class="pg-winner-banner" style="--wc:${wHex}">
        <i class="fa-solid fa-trophy"></i> ${escapeAttr(wName)} wins!
      </div>
    </div>

    <div id="pg-stats-scroll">

      <div class="pg-section">
        <div class="pg-section-head">
          <span class="pg-section-title">Dice distribution</span>
          <div class="pg-radio-group">
            ${stats.map(s => `
              <label class="pg-radio-label">
                <input type="radio" name="dice-player" value="${s.player}">
                <span style="color:${COLORS[s.color]||'#888'}">${escapeAttr(gamePlayerName(s.player))}</span>
              </label>`).join('')}
            <label class="pg-radio-label">
              <input type="radio" name="dice-player" value="all" checked> All
            </label>
          </div>
        </div>
        <div id="pg-histogram-wrap"></div>
      </div>

      <div class="pg-section">
        <div class="pg-stat-table" style="--cols:${n}">
          ${_buildStatTable(stats, captureMatrix, blockMatrix)}
        </div>
      </div>

      ${hasReflections ? `
      <div class="pg-section">
        <span class="pg-section-title">Self-perception vs actual play</span>
        <p class="pg-section-hint">◆ Measured &nbsp;○ Self-rated</p>
        <div class="pg-scatter-row">
          <div>
            <canvas id="pg-scatter" width="200" height="200"></canvas>
            <div class="pg-scatter-x-labels"><span>Aggressive</span><span>Passive</span></div>
          </div>
          <div class="pg-scatter-descriptions">
            ${_buildReflectionDescriptions(stats)}
          </div>
        </div>
        <div class="pg-scatter-y-labels-row">
          <span>Risky</span><span style="margin-left:auto">Cautious</span>
        </div>
      </div>` : ''}

      <div class="pg-footer">
        <button class="btn btn-primary btn-sm" onclick="requestNewGame()">
          <i class="ti ti-plus"></i> New game
        </button>
      </div>

    </div>
  `;

  _drawHistogram('all');
  sp.querySelectorAll('input[name="dice-player"]').forEach(r =>
    r.addEventListener('change', () => _drawHistogram(r.value))
  );

  if (hasReflections) _drawScatter();
}

// ── Matrices ──────────────────────────────────────────────────────────────────

function _computeMatrices(stats) {
  const n = stats.length;
  const captureMatrix = Array.from({length: n}, () => Array(n).fill(0));
  const blockMatrix   = Array.from({length: n}, () => Array(n).fill(0));
  for (const ev of (gameState.history || [])) {
    if (ev.type === 'capture' && ev.by_player < n && ev.captured_player < n)
      captureMatrix[ev.by_player][ev.captured_player]++;
    if (ev.type === 'blocked' && ev.player < n && ev.blocked_by != null && ev.blocked_by < n)
      blockMatrix[ev.player][ev.blocked_by]++;
  }
  return { captureMatrix, blockMatrix };
}

function _matrixHTML(stats, matrix, rowLabel, colLabel) {
  const n = stats.length;
  if (n < 2) return '';
  const headers = stats.map(s => `<th style="color:${COLORS[s.color]||'#888'}">${escapeAttr(gamePlayerName(s.player))}</th>`).join('');
  const rows = stats.map((rowS, i) => {
    const cells = stats.map((colS, j) => {
      if (i === j) return `<td class="pg-matrix-diag">—</td>`;
      const v = matrix[i][j];
      return `<td class="${v > 0 ? 'pg-matrix-hit' : ''}">${v}</td>`;
    }).join('');
    return `<tr><td class="pg-matrix-row-label" style="color:${COLORS[rowS.color]||'#888'}">${escapeAttr(gamePlayerName(rowS.player))}</td>${cells}</tr>`;
  }).join('');
  return `
    <div class="pg-matrix-wrap">
      <div class="pg-matrix-title">${rowLabel} → ${colLabel}</div>
      <table class="pg-matrix"><thead><tr><th></th>${headers}</tr></thead><tbody>${rows}</tbody></table>
    </div>`;
}

// ── Stat table ────────────────────────────────────────────────────────────────

function _buildStatTable(stats, captureMatrix, blockMatrix) {
  const n = stats.length;
  const EXP = { dice_avg: '3.5', luck_score: '0.00', sixes_pct: '16.7%' };

  const header = `<div class="pg-stat-row pg-stat-head">
    <span></span><span class="pg-exp-col">Exp.</span>
    ${stats.map(s => {
      const ic = typeof playerIconClass==='function' ? playerIconClass(s.player) : 'fa-face-smile';
      return `<span style="color:${COLORS[s.color]||'#888'}" title="${escapeAttr(gamePlayerName(s.player))}">
        <i class="fa-solid ${ic}"></i>
      </span>`;
    }).join('')}
  </div>`;

  const sep = label => `<div class="pg-stat-sep"><span>${label}</span></div>`;

  const row = (label, key, opts = {}) => {
    const { exp, fmt, derived, cls } = opts;
    const expVal = exp ?? EXP[key] ?? '—';
    return `<div class="pg-stat-row${cls ? ' '+cls : ''}">
      <span class="pg-stat-label">${label}</span>
      <span class="pg-exp-col">${expVal}</span>
      ${stats.map(s => {
        const v = derived ? derived(s) : s[key];
        return `<span>${v == null ? '—' : fmt ? fmt(v) : v}</span>`;
      }).join('')}
    </div>`;
  };

  const sections = [
    sep('Game'),
    row('Rounds',   'rounds',  { exp: '—' }),
    row('Turns',    'turns',   { exp: '—' }),
    row('Rolls',    'rolls',   { exp: '—' }),

    sep('Dice'),
    row('Avg roll',     'dice_avg',   { fmt: v => v.toFixed(2) }),
    row('Luck (avg−3.5)', 'luck_score', { fmt: v => (v>0?'+':'')+v.toFixed(2) }),
    row('Sixes',          'sixes_pct',  { fmt: v => v+'%' }),

    sep('Captures & Blockades'),
    row('Captures made',  'captures_made'),
    row('Captured',       'captures_suffered'),
    row('Blockades formed','blockades_formed'),
    row('Blocked',        'times_blocked'),

    sep('Forfeited turns'),
    row('Total',              null, { exp: '—', derived: s => (s.forfeit_no_pawn||0)+(s.forfeit_blockade||0)+(s.forfeit_no_exact||0) }),
    row('— no pawn out yet',  'forfeit_no_pawn',   { exp: '—', cls: 'indent' }),
    row('— blocked',          'forfeit_blockade',  { exp: '—', cls: 'indent' }),
    row('— need exact roll',  'forfeit_no_exact',  { exp: '—', cls: 'indent' }),

    sep('Pawn progress'),
    row('Finished',         'pawns_finished'),
    row('Home stretch',     'pawns_home_stretch'),
    row('On track',         'pawns_on_track'),
    row('In yard',          'pawns_in_yard'),
    row('Avg spaces left',  'avg_spaces_remaining', { exp: '—' }),
  ].join('');

  // Self-rated luck row if any reflections exist
  const luckyRatings = _reflections.filter(r => !r.skipped && r.self_lucky != null);
  const luckyRow = luckyRatings.length ? `
    <div class="pg-stat-sep"><span>Perception</span></div>
    <div class="pg-stat-row pg-self-row">
      <span class="pg-stat-label">Self-rated luck</span><span class="pg-exp-col">—</span>
      ${stats.map(s => {
        const ref = luckyRatings.find(r => r.player === s.player);
        if (!ref) return '<span>—</span>';
        const labels = ['','Lucky','Somewhat lucky','Neutral','Somewhat unlucky','Unlucky'];
        return `<span title="${labels[ref.self_lucky]||''}">${ref.self_lucky}</span>`;
      }).join('')}
    </div>` : '';

  const matrices = n >= 2 ? `
    <div class="pg-stat-sep"><span>Capture breakdown</span></div>
    <div class="pg-matrices">
      ${_matrixHTML(stats, captureMatrix, 'Attacker', 'Victim')}
      ${_matrixHTML(stats, blockMatrix,   'Blocked', 'By')}
    </div>` : '';

  return header + sections + luckyRow + matrices;
}

// ── Dice histogram ────────────────────────────────────────────────────────────

function _drawHistogram(playerFilter) {
  const wrap = document.getElementById('pg-histogram-wrap');
  if (!wrap) return;
  const stats  = _playerStats || [];
  const faces  = [1,2,3,4,5,6];
  const filtered = playerFilter === 'all'
    ? stats
    : stats.filter(s => String(s.player) === String(playerFilter));

  const singlePlayer = filtered.length === 1;

  // Find max count across all filtered players and all faces
  let maxCount = 1;
  filtered.forEach(s => faces.forEach(f => { maxCount = Math.max(maxCount, s.dice_distribution?.[f] || 0); }));

  // Y-axis ticks (4 steps)
  const tickStep = Math.max(1, Math.ceil(maxCount / 4));
  const ticks = [];
  for (let t = 0; t <= maxCount + tickStep; t += tickStep) ticks.push(t);

  const barGroups = faces.map(face => {
    const bars = filtered.map(s => {
      const count = s.dice_distribution?.[face] || 0;
      const pct   = Math.round(count / maxCount * 100);
      const color = singlePlayer ? 'var(--color-primary, #10099F)' : (COLORS[s.color] || '#888');
      return `<div class="pg-bar" style="--h:${pct}%;--bc:${color}" title="${gamePlayerName(s.player)}: ${count}"></div>`;
    }).join('');
    const total = filtered.reduce((a, s) => a + (s.dice_distribution?.[face]||0), 0);
    return `<div class="pg-bar-group">
      <div class="pg-bars">${bars}</div>
      <div class="pg-bar-face">${DICE_FACES[face]}</div>
    </div>`;
  }).join('');

  const yAxisTicks = [...ticks].reverse().map(t =>
    `<span>${t}</span>`
  ).join('');

  wrap.innerHTML = `
    <div class="pg-histogram-outer">
      <div class="pg-y-axis">${yAxisTicks}</div>
      <div class="pg-histogram">${barGroups}</div>
    </div>`;
}

// ── Scatter ───────────────────────────────────────────────────────────────────

function _buildReflectionDescriptions(stats) {
  const labels = {
    agg:  ['','Aggressive','Somewhat aggressive','Neutral','Somewhat passive','Passive'],
    risk: ['','Risky','Somewhat risky','Balanced','Somewhat cautious','Cautious'],
    luck: ['','Lucky','Somewhat lucky','Neutral','Somewhat unlucky','Unlucky'],
  };
  return (_playerStats || []).map(s => {
    const ref = _reflections.find(r => r.player === s.player && !r.skipped);
    const hex = COLORS[s.color] || '#888';
    const name = escapeAttr(gamePlayerName(s.player));
    if (!ref) return `<div class="pg-desc-row"><span class="pg-desc-name" style="color:${hex}">${name}</span><span class="pg-desc-text">—</span></div>`;
    return `<div class="pg-desc-row">
      <span class="pg-desc-name" style="color:${hex}">${name}</span>
      <span class="pg-desc-text">
        ${labels.agg[ref.self_aggressive]||ref.self_aggressive},
        ${labels.risk[ref.self_risky]||ref.self_risky},
        ${labels.luck[ref.self_lucky]||ref.self_lucky}
      </span>
    </div>`;
  }).join('');
}

function _drawScatter() {
  const canvas = document.getElementById('pg-scatter');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height, pad = 20;

  ctx.clearRect(0, 0, W, H);
  ctx.strokeStyle = '#E2E5EE'; ctx.lineWidth = 1;
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
    const r = 6;

    // Measured: filled diamond
    ctx.fillStyle = hex;
    ctx.beginPath();
    ctx.moveTo(mx, my-r); ctx.lineTo(mx+r, my); ctx.lineTo(mx, my+r); ctx.lineTo(mx-r, my);
    ctx.closePath(); ctx.fill();

    const ref = _reflections.find(x => x.player === s.player && !x.skipped);
    if (ref) {
      const selfAgg  = (ref.self_aggressive - 1) / 4;
      const selfRisk = 1 - (ref.self_risky - 1) / 4;
      const sx = toX(selfAgg), sy = toY(selfRisk);
      ctx.strokeStyle = hex; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sx, sy, 6, 0, 2*Math.PI); ctx.stroke();
      ctx.setLineDash([3,3]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(mx, my); ctx.stroke();
      ctx.setLineDash([]);
    }

    // Player name label
    ctx.fillStyle = hex; ctx.font = '10px sans-serif';
    ctx.fillText(gamePlayerName(s.player), mx + 8, my - 4);
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
