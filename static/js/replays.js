// Replays page — browse, filter, and load saved games.

function renderReplaysAdminWidget() {
  const el = document.getElementById('replays-admin-widget');
  if (!el) return;
  const isAdmin = typeof adminToken !== 'undefined' && adminToken;
  if (isAdmin) {
    el.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px;">
        <span class="badge badge-green">Admin</span>
        <button class="btn btn-ghost btn-sm" onclick="doReplaysAdminLogout()"><i class="ti ti-logout"></i> Log out</button>
      </div>`;
  } else {
    el.innerHTML = `
      <div id="replays-login-form" style="display:flex; align-items:center; gap:8px;">
        <input type="password" id="replays-admin-pw" placeholder="Admin password…"
               style="padding:6px 10px; font-size:13px; border:1.5px solid var(--border-medium,#D4D8E5); border-radius:8px; width:160px;"
               onkeydown="if(event.key==='Enter')doReplaysAdminLogin()">
        <button class="btn btn-sm" onclick="doReplaysAdminLogin()"><i class="ti ti-shield"></i> Admin</button>
      </div>`;
  }
}

async function doReplaysAdminLogin() {
  const pw = document.getElementById('replays-admin-pw')?.value || '';
  const r = await fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: pw }),
  });
  if (!r.ok) {
    const input = document.getElementById('replays-admin-pw');
    if (input) { input.style.borderColor = 'var(--color-danger,#AC1A2F)'; input.focus(); }
    return;
  }
  const { token } = await r.json();
  if (typeof adminToken !== 'undefined') window.adminToken = token;
  // also sync app.js global
  if (typeof doAdminLoginSuccess === 'function') doAdminLoginSuccess(token);
  renderReplaysAdminWidget();
  filterReplays();
}

function doReplaysAdminLogout() {
  if (typeof doAdminLogout === 'function') doAdminLogout();
  else { window.adminToken = null; }
  renderReplaysAdminWidget();
  filterReplays();
}

let _allGames = [];
let _replayFilterPlayers = 'all';
let _replayFilterYards = 'all';
let _replayFilterPerson = null;   // human_id or null
let _replayFilterResult = 'all';  // 'all' | 'won' | 'lost'

function moveReplaySurfaceToReplays() {
  const board = document.getElementById('board-area');
  const boardHost = document.getElementById('replays-board-host');
  const controls = document.getElementById('replay-step-controls');
  const controlsHost = document.getElementById('replays-controls-host');
  if (board && boardHost && board.parentElement !== boardHost) {
    boardHost.appendChild(board);
    board.classList.add('board-area--replays');
  }
  if (controls && controlsHost && controls.parentElement !== controlsHost) {
    controlsHost.appendChild(controls);
  }
}

function moveReplaySurfaceToPlay() {
  const board = document.getElementById('board-area');
  const playLayout = document.getElementById('play-layout');
  const sidePanel = document.getElementById('side-panel');
  const controls = document.getElementById('replay-step-controls');
  const playControls = document.querySelector('#side-panel .side-section.controls');
  const liveControls = document.getElementById('live-speed-controls');
  if (board && playLayout && board.parentElement !== playLayout) {
    playLayout.insertBefore(board, sidePanel || playLayout.firstChild);
    board.classList.remove('board-area--replays');
  }
  if (controls && playControls && controls.parentElement !== playControls) {
    playControls.insertBefore(controls, liveControls?.nextSibling || playControls.firstChild);
  }
}

async function loadReplaysPage() {
  renderReplaysAdminWidget();
  renderReplaysReadyStrip();
  try {
    const r = await fetch('/api/games');
    _allGames = (await r.json()).games || [];
    // If summary is empty but we're admin, offer a rebuild
    if (_allGames.length === 0 && typeof adminToken !== 'undefined' && adminToken) {
      const list = document.getElementById('replays-list');
      if (list) list.innerHTML = '<p class="replays-empty">No games in summary. Use Admin → Rebuild games summary if you have existing files.</p>';
    }
  } catch (_) {
    _allGames = [];
  }
  _buildFilterPills();
  // Reset person filter state on fresh load
  _replayFilterPerson = null;
  _replayFilterResult = 'all';
  const rg = document.getElementById('replays-filter-result-group');
  if (rg) rg.style.display = 'none';
  filterReplays();
}

function _buildFilterPills() {
  const playerCounts = [...new Set(_allGames.map(g => g.player_count).filter(Boolean))].sort((a,b)=>a-b);
  const yardCounts   = [...new Set(_allGames.map(g => g.yard_count).filter(Boolean))].sort((a,b)=>a-b);

  const pEl = document.getElementById('replays-filter-players');
  const yEl = document.getElementById('replays-filter-yards');
  if (pEl) pEl.innerHTML = `<button class="replays-pill active" data-val="all" onclick="setPlayersFilter('all',this)">All</button>`
    + playerCounts.map(n => `<button class="replays-pill" data-val="${n}" onclick="setPlayersFilter(${n},this)">${n}p</button>`).join('');
  if (yEl) yEl.innerHTML = `<button class="replays-pill active" data-val="all" onclick="setYardsFilter('all',this)">All</button>`
    + yardCounts.map(n => `<button class="replays-pill" data-val="${n}" onclick="setYardsFilter(${n},this)">${n} yards</button>`).join('');

  _buildPersonPills();
}

function _buildPersonPills() {
  const el = document.getElementById('replays-filter-person');
  if (!el) return;
  const readyIds = _getReadyIds();
  if (!readyIds.size) { el.innerHTML = '<span style="font-size:12px;color:var(--text3)">No players ready</span>'; return; }
  el.innerHTML = `<button class="replays-pill active" data-val="" onclick="setPersonFilter(null,this)">All</button>`
    + [...readyIds].map(id => {
        const name = (typeof getProfileById === 'function' && getProfileById(id)?.name) || id.slice(0,8);
        return `<button class="replays-pill" data-val="${id}" onclick="setPersonFilter('${id}',this)">${name}</button>`;
      }).join('');
}

function setPlayersFilter(val, btn) {
  _replayFilterPlayers = val;
  btn.closest('.replays-pills').querySelectorAll('.replays-pill').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  filterReplays();
}

function setYardsFilter(val, btn) {
  _replayFilterYards = val;
  btn.closest('.replays-pills').querySelectorAll('.replays-pill').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  filterReplays();
}

function setPersonFilter(id, btn) {
  _replayFilterPerson = id || null;
  _replayFilterResult = 'all';
  btn.closest('.replays-pills').querySelectorAll('.replays-pill').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  // Reset result pills to 'all'
  document.querySelectorAll('#replays-filter-result .replays-pill').forEach(b => b.classList.toggle('active', b.dataset.val === 'all'));
  // Show/hide result filter
  const rg = document.getElementById('replays-filter-result-group');
  if (rg) rg.style.display = _replayFilterPerson ? '' : 'none';
  filterReplays();
}

function setResultFilter(val, btn) {
  _replayFilterResult = val;
  btn.closest('.replays-pills').querySelectorAll('.replays-pill').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  filterReplays();
}

function _getReadyIds() {
  return typeof getSessionConsented === 'function' ? getSessionConsented() : new Set();
}

function renderReplaysReadyStrip() {
  const strip = document.getElementById('replays-ready-strip');
  if (!strip) return;
  const readyIds = _getReadyIds();
  if (!readyIds.size) {
    strip.textContent = '';
    return;
  }
  const names = [...readyIds].map(id => {
    if (typeof getProfileById === 'function') {
      const p = getProfileById(id);
      if (p) return p.name || id.slice(0,8);
    }
    return id.slice(0, 8);
  });
  strip.innerHTML = `<i class="ti ti-filter" style="font-size:11px;"></i> Showing games for: <strong>${names.join(', ')}</strong>`;
}

function filterReplays() {
  const isAdmin = typeof adminToken !== 'undefined' && adminToken;
  const readyIds = _getReadyIds();
  const search = (document.getElementById('replays-search')?.value || '').toLowerCase();
  renderReplaysReadyStrip();
  const filtered = _allGames.filter(g => {
    if (g.incomplete && !isAdmin) return false;
    // Only show games that include at least one ready player (skip if no one is ready)
    if (readyIds.size > 0) {
      const hasReady = (g.players || []).some(p => p.human_id && readyIds.has(p.human_id));
      if (!hasReady) return false;
    }
    if (_replayFilterPlayers !== 'all' && g.player_count !== _replayFilterPlayers) return false;
    if (_replayFilterYards !== 'all' && g.yard_count !== _replayFilterYards) return false;
    if (_replayFilterPerson) {
      const personEntry = (g.players || []).find(p => p.human_id === _replayFilterPerson);
      if (!personEntry) return false;
      if (_replayFilterResult === 'won'  && personEntry.index !== g.winner) return false;
      if (_replayFilterResult === 'lost' && personEntry.index === g.winner) return false;
    }
    if (search) {
      const nameMatch = (g.name || '').toLowerCase().includes(search);
      const fileMatch = g.filename.toLowerCase().includes(search);
      const playerMatch = (g.players || []).some(p => (p.bot_id || '').toLowerCase().includes(search));
      if (!nameMatch && !fileMatch && !playerMatch) return false;
    }
    return true;
  });

  const countEl = document.getElementById('replays-count');
  if (countEl) countEl.textContent = `${filtered.length} of ${_allGames.length} game${_allGames.length !== 1 ? 's' : ''}`;

  const list = document.getElementById('replays-list');
  if (!list) return;
  if (!filtered.length) {
    list.innerHTML = '<p class="replays-empty">No games match the current filters.</p>';
    return;
  }
  list.innerHTML = filtered.map(g => _renderGameCard(g, isAdmin)).join('');
}


function _playerDots(players) {
  return (players || []).map(p => {
    const hex = (typeof COLORS !== 'undefined' && COLORS[p.color]) || '#888';
    const icon = p.type === 'bot'
      ? `<i class="ti ti-robot" style="font-size:11px;"></i>`
      : `<i class="ti ti-user" style="font-size:11px;"></i>`;
    return `<span class="replays-player-dot" style="--pc:${hex}" title="${p.type === 'bot' ? (p.bot_id || 'bot') : 'human'}">${icon}</span>`;
  }).join('');
}

function _renderGameCard(g, isAdmin) {
  const displayName = g.name || null;
  const uuid = g.filename.replace('.json', '');
  const dt = g.finished_at_ms
    ? new Date(g.finished_at_ms).toLocaleString()
    : (g.started_at_ms ? new Date(g.started_at_ms).toLocaleString() : '—');
  const winnerPlayer = (g.players || []).find(p => p.index === g.winner);
  const winnerHex = winnerPlayer && typeof COLORS !== 'undefined' ? (COLORS[winnerPlayer.color] || '#888') : '#888';
  const winnerLabel = winnerPlayer
    ? `<span class="replays-winner" style="--pc:${winnerHex}"><i class="ti ti-trophy" style="font-size:11px;"></i> ${winnerPlayer.color}${winnerPlayer.type === 'bot' ? ` (${winnerPlayer.bot_id || 'bot'})` : ''}</span>`
    : '';
  const justLabel = g.justification_count > 0 ? `${g.justification_count} justification${g.justification_count !== 1 ? 's' : ''}` : null;
  const meta = [g.player_count ? `${g.player_count}p` : null, g.yard_count ? `${g.yard_count} yards` : null, justLabel].filter(Boolean).join(' · ');

  const adminBtns = isAdmin ? `
    <button class="replays-card-action" title="Rename" onclick="event.stopPropagation(); startRenameReplay('${g.filename}', this)"><i class="ti ti-pencil"></i></button>
    <button class="replays-card-action danger" title="Delete" onclick="event.stopPropagation(); deleteReplay('${g.filename}', this)"><i class="ti ti-trash"></i></button>` : '';

  const incompleteBadge = g.incomplete ? `<span class="badge badge-purple" style="font-size:10px; margin-left:4px;">incomplete</span>` : '';
  return `<div class="replays-card${g.incomplete ? ' incomplete' : ''}" onclick="loadReplayFromPage('${g.filename}')">
    <div class="replays-card-header">
      <div class="replays-card-title">
        ${displayName
          ? `<span class="replays-card-name">${displayName}</span><span class="replays-card-uuid">${uuid}</span>`
          : `<span class="replays-card-name unnamed">${uuid}</span>`}
        ${incompleteBadge}
      </div>
      <div class="replays-card-actions">${adminBtns}</div>
    </div>
    <div class="replays-card-body">
      <div class="replays-player-dots">${_playerDots(g.players)}</div>
      <span class="replays-meta">${meta}</span>
      ${winnerLabel}
    </div>
    <div class="replays-card-footer">${dt}</div>
  </div>`;
}

async function loadReplayFromPage(filename) {
  try {
    const r = await fetch(`/api/games/${encodeURIComponent(filename)}`);
    if (!r.ok) throw new Error();
    if (typeof loadReplayJson === 'function') {
      moveReplaySurfaceToReplays();
      const viewer = document.getElementById('replays-viewer');
      const title = document.getElementById('replays-viewer-title');
      if (viewer) viewer.hidden = false;
      if (title) title.textContent = _allGames.find(g => g.filename === filename)?.name || filename.replace('.json', '');
      if (typeof prepareReplayBoard === 'function') prepareReplayBoard();
      loadReplayJson(await r.json());
    }
  } catch (_) {
    alert('Could not load game.');
  }
}

async function startRenameReplay(filename, btn) {
  const card = btn.closest('.replays-card');
  const nameEl = card.querySelector('.replays-card-name');
  const current = nameEl.classList.contains('unnamed') ? '' : nameEl.textContent;
  nameEl.outerHTML = `<input class="replays-rename-input" value="${current}" maxlength="80" placeholder="Game name…" onclick="event.stopPropagation()">`;
  const input = card.querySelector('.replays-rename-input');
  input.focus(); input.select();
  input.onkeydown = async e => {
    if (e.key === 'Enter') await _confirmRenameReplay(filename, input.value.trim());
    if (e.key === 'Escape') loadReplaysPage();
  };
  btn.innerHTML = '<i class="ti ti-check"></i>';
  btn.onclick = e => { e.stopPropagation(); _confirmRenameReplay(filename, input.value.trim()); };
}

async function _confirmRenameReplay(filename, name) {
  await fetch(`/api/games/${encodeURIComponent(filename)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  await loadReplaysPage();
}

async function deleteReplay(filename, btn) {
  if (!confirm('Delete this game? This cannot be undone.')) return;
  await fetch(`/api/games/${encodeURIComponent(filename)}`, {
    method: 'DELETE',
    headers: { 'X-Admin-Token': adminToken },
  });
  await loadReplaysPage();
}
