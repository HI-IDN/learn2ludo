// Post-game flow: reflection → stats overlay
// Triggered once when gameState.winner is set (true finish, not tentative).
// Human players each self-rate on two axes privately, then a combined stats
// screen shows measured play vs self-perception.

let _postgameShown = false;
let _reflections = [];       // filled during reflection phase
let _playerStats = null;     // player_stats from server

function resetPostGame() {
  _postgameShown = false;
  _reflections = [];
  _playerStats = null;
}

// Called from renderGame() after every state update.
function maybeShowPostGame() {
  if (_postgameShown) return;
  if (!gameState || gameState.winner === null) return;
  // player_stats is only present on true finish (server sets it).
  if (!gameState.player_stats) return;
  _postgameShown = true;
  _playerStats = gameState.player_stats;
  _reflections = [];
  _startReflectionPhase();
}

// ── Reflection phase ────────────────────────────────────────────────────────

function _humanPlayersInOrder() {
  const n = gameState.num_players || 1;
  const players = [];
  for (let i = 0; i < n; i++) {
    if (gamePlayerType(i) === 'human') players.push(i);
  }
  return players;
}

function _startReflectionPhase() {
  const humans = _humanPlayersInOrder();
  if (!humans.length) { _showStatsOverlay(); return; }
  _promptReflection(humans, 0);
}

function _promptReflection(humans, idx) {
  if (idx >= humans.length) { _showStatsOverlay(); return; }
  const playerIdx = humans[idx];
  const color = gameState.players[playerIdx]?.color || 'blue';
  const name = gamePlayerName(playerIdx);
  const hex = COLORS[color] || '#888';

  const overlay = document.createElement('div');
  overlay.className = 'postgame-overlay reflection-overlay';
  overlay.innerHTML = `
    <div class="postgame-card">
      <div class="postgame-player-badge" style="--player-color:${hex}">
        <i class="fa-solid fa-user"></i> ${escapeAttr(name)}
      </div>
      <h2 class="postgame-title">How did you play?</h2>
      <p class="postgame-subtitle">Rate yourself before seeing the stats.</p>

      <div class="reflection-axis">
        <label class="axis-label">
          <span class="axis-lo">Aggressive</span>
          <span class="axis-hi">Passive</span>
        </label>
        <div class="axis-pips" id="axis-aggressive">
          ${[1,2,3,4,5].map(v=>`<button class="pip-btn" data-val="${v}">${v}</button>`).join('')}
        </div>
      </div>

      <div class="reflection-axis">
        <label class="axis-label">
          <span class="axis-lo">Risky</span>
          <span class="axis-hi">Cautious</span>
        </label>
        <div class="axis-pips" id="axis-risky">
          ${[1,2,3,4,5].map(v=>`<button class="pip-btn" data-val="${v}">${v}</button>`).join('')}
        </div>
      </div>

      <div class="reflection-actions">
        <button class="btn btn-primary" id="reflection-next" disabled>Next</button>
        <button class="btn btn-ghost" id="reflection-skip">Skip</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  let aggressiveVal = null;
  let riskyVal = null;

  function updateNext() {
    document.getElementById('reflection-next').disabled = (aggressiveVal === null || riskyVal === null);
  }

  overlay.querySelectorAll('#axis-aggressive .pip-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      overlay.querySelectorAll('#axis-aggressive .pip-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      aggressiveVal = Number(btn.dataset.val);
      updateNext();
    });
  });

  overlay.querySelectorAll('#axis-risky .pip-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      overlay.querySelectorAll('#axis-risky .pip-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      riskyVal = Number(btn.dataset.val);
      updateNext();
    });
  });

  document.getElementById('reflection-next').addEventListener('click', () => {
    _reflections.push({
      player: playerIdx, color, name,
      self_aggressive: aggressiveVal,
      self_risky: riskyVal,
      skipped: false,
      timestamp: new Date().toISOString(),
    });
    overlay.remove();
    _promptReflection(humans, idx + 1);
  });

  document.getElementById('reflection-skip').addEventListener('click', () => {
    _reflections.push({
      player: playerIdx, color, name,
      self_aggressive: null, self_risky: null,
      skipped: true,
      timestamp: new Date().toISOString(),
    });
    overlay.remove();
    _promptReflection(humans, idx + 1);
  });
}

// ── Stats overlay ────────────────────────────────────────────────────────────

function _showStatsOverlay() {
  if (_reflections.length) _saveReflections();

  const winner = gameState.winner;
  const winColor = gameState.winner_color || 'blue';
  const winName = gamePlayerName(winner);
  const winHex = COLORS[winColor] || '#888';
  const stats = _playerStats || [];

  const overlay = document.createElement('div');
  overlay.className = 'postgame-overlay stats-overlay';
  overlay.innerHTML = `
    <div class="postgame-card postgame-stats-card">
      <div class="postgame-winner-banner" style="--winner-color:${winHex}">
        <i class="fa-solid fa-trophy"></i>
        <span>${escapeAttr(winName)} wins!</span>
      </div>

      <div class="postgame-sections">
        <div class="postgame-section">
          <h3 class="section-title">Player stats</h3>
          <div class="stats-table">
            ${_renderStatsTable(stats)}
          </div>
        </div>

        <div class="postgame-section">
          <h3 class="section-title">Dice distribution</h3>
          <div class="dice-dist-grid">
            ${_renderDiceDist(stats)}
          </div>
        </div>

        ${_reflections.some(r => !r.skipped) ? `
        <div class="postgame-section">
          <h3 class="section-title">Self-perception vs actual play</h3>
          <p class="section-hint">You · Self-rated &nbsp;◆ Measured</p>
          <div class="scatter-wrap">
            <canvas id="scatter-canvas" width="260" height="260"></canvas>
            <div class="scatter-axis-x"><span>Aggressive</span><span>Passive</span></div>
            <div class="scatter-axis-y"><span>Risky</span><span>Cautious</span></div>
          </div>
        </div>` : ''}
      </div>

      <div class="postgame-footer">
        <button class="btn btn-primary" id="postgame-again">Play again</button>
        <button class="btn btn-ghost" id="postgame-close">Close</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  if (_reflections.some(r => !r.skipped)) {
    _drawScatter(stats);
  }

  document.getElementById('postgame-again').addEventListener('click', () => {
    overlay.remove();
    switchTab('lobby');
  });
  document.getElementById('postgame-close').addEventListener('click', () => overlay.remove());
}

function _renderStatsTable(stats) {
  const cols = [
    { key: 'rolls',          label: 'Rolls' },
    { key: 'dice_avg',       label: 'Avg dice' },
    { key: 'luck_score',     label: 'Luck', fmt: v => (v > 0 ? '+' : '') + v },
    { key: 'sixes_pct',      label: '6s %', fmt: v => v + '%' },
    { key: 'captures_made',  label: 'Captures' },
    { key: 'captures_suffered', label: 'Captured' },
    { key: 'blockades_formed',  label: 'Blockades' },
    { key: 'times_blocked',     label: 'Blocked' },
    { key: 'pawns_finished',    label: 'Finished' },
  ];

  const header = `<div class="stats-row stats-header">
    <span></span>
    ${stats.map(s => `<span style="color:${COLORS[s.color]||'#888'}">${escapeAttr(gamePlayerName(s.player))}</span>`).join('')}
  </div>`;

  const rows = cols.map(col => `
    <div class="stats-row">
      <span class="stat-row-label">${col.label}</span>
      ${stats.map(s => {
        const v = s[col.key];
        return `<span>${v == null ? '—' : (col.fmt ? col.fmt(v) : v)}</span>`;
      }).join('')}
    </div>
  `).join('');

  return header + rows;
}

function _renderDiceDist(stats) {
  return stats.map(s => {
    const hex = COLORS[s.color] || '#888';
    const dist = s.dice_distribution || {};
    const max = Math.max(1, ...Object.values(dist));
    const bars = [1,2,3,4,5,6].map(d => {
      const count = dist[String(d)] || 0;
      const pct = Math.round(count / max * 100);
      return `<div class="dice-bar-col">
        <div class="dice-bar" style="--bar-h:${pct}%;--bar-color:${hex}"></div>
        <span class="dice-bar-label">${DICE_FACES[d]}</span>
        <span class="dice-bar-count">${count}</span>
      </div>`;
    }).join('');
    return `<div class="dice-dist-player">
      <div class="dice-dist-name" style="color:${hex}">${escapeAttr(gamePlayerName(s.player))}</div>
      <div class="dice-bars">${bars}</div>
    </div>`;
  }).join('');
}

function _drawScatter(stats) {
  const canvas = document.getElementById('scatter-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const pad = 24;

  ctx.clearRect(0, 0, W, H);

  // Axes
  ctx.strokeStyle = 'var(--border, #ccc)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad, H / 2); ctx.lineTo(W - pad, H / 2);
  ctx.moveTo(W / 2, pad); ctx.lineTo(W / 2, H - pad);
  ctx.stroke();

  // Map aggression_score (0=aggressive,1=passive) → X
  // Map risk_score (1=risky,0=cautious) → Y  (invert so risky=top)
  function toX(agg) { return pad + agg * (W - 2 * pad); }
  function toY(risk) { return H - pad - (risk ?? 0.5) * (H - 2 * pad); }

  stats.forEach(s => {
    const hex = COLORS[s.color] || '#888';
    ctx.fillStyle = hex;

    // Measured dot (diamond)
    const mx = toX(s.aggression_score ?? 0.5);
    const my = toY(s.risk_score ?? null);
    const r = 7;
    ctx.beginPath();
    ctx.moveTo(mx, my - r);
    ctx.lineTo(mx + r, my);
    ctx.lineTo(mx, my + r);
    ctx.lineTo(mx - r, my);
    ctx.closePath();
    ctx.fill();

    // Self-rated dot (circle), only if reflection exists
    const ref = _reflections.find(r => r.player === s.player && !r.skipped);
    if (ref) {
      // self_aggressive: 1=aggressive → 0, 5=passive → 1
      const selfAgg = (ref.self_aggressive - 1) / 4;
      // self_risky: 1=risky → 1, 5=cautious → 0
      const selfRisk = 1 - (ref.self_risky - 1) / 4;
      const sx = toX(selfAgg);
      const sy = toY(selfRisk);
      ctx.strokeStyle = hex;
      ctx.lineWidth = 2;
      ctx.fillStyle = 'transparent';
      ctx.beginPath();
      ctx.arc(sx, sy, 7, 0, 2 * Math.PI);
      ctx.stroke();

      // Line connecting self to measured
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(mx, my);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  });
}

function _saveReflections() {
  fetch('/api/game/reflections', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reflections: _reflections }),
  }).catch(() => {});
}
