// Replays page — lightweight saved-game picker.

function renderReplaysAdminWidget() {
  const el = document.getElementById('replays-admin-widget');
  if (!el) return;
  const isAdmin = typeof adminToken !== 'undefined' && adminToken;
  if (isAdmin) {
    el.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px;">
        <span class="badge badge-purple">Admin</span>
        <button class="btn btn-ghost btn-sm" onclick="doReplaysAdminLogout()"><i class="ti ti-logout"></i> Log out</button>
      </div>`;
  } else {
    el.innerHTML = `
      <div id="replays-login-form" style="display:flex; align-items:center; gap:8px;">
        <input type="password" id="replays-admin-pw" placeholder="Admin password..."
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
  if (typeof doAdminLoginSuccess === 'function') doAdminLoginSuccess(token);
  renderReplaysAdminWidget();
  loadReplaysPage();
}

function doReplaysAdminLogout() {
  if (typeof doAdminLogout === 'function') doAdminLogout();
  else { window.adminToken = null; }
  renderReplaysAdminWidget();
  loadReplaysPage();
}

function moveReplaySurfaceToReplays() {
  const playLayout = document.getElementById('play-layout');
  const replayHost = document.getElementById('replays-play-host');
  if (playLayout && replayHost && playLayout.parentElement !== replayHost) {
    replayHost.appendChild(playLayout);
  }
}

function moveReplaySurfaceToPlay() {
  const panelPlay = document.getElementById('panel-play');
  const playLayout = document.getElementById('play-layout');
  if (panelPlay && playLayout && playLayout.parentElement !== panelPlay) {
    panelPlay.appendChild(playLayout);
  }
}

function quitReplayFromPage() {
  if (typeof clearReplayMode === 'function') clearReplayMode();
  moveReplaySurfaceToPlay();
  const viewer = document.getElementById('replays-viewer');
  const title = document.getElementById('replays-viewer-title');
  if (viewer) viewer.hidden = true;
  if (title) title.textContent = 'Replay';
}

let _replaysPageGames = [];

async function loadReplaysPage() {
  renderReplaysAdminWidget();
  const list = document.getElementById('replays-list');
  const count = document.getElementById('replays-count');
  if (list) list.innerHTML = '<p class="replay-picker-empty">Loading...</p>';
  try {
    const r = await fetch('/api/games');
    _replaysPageGames = (await r.json()).games || [];
  } catch (_) {
    _replaysPageGames = [];
  }
  const isAdmin = typeof adminToken !== 'undefined' && adminToken;
  if (count) count.textContent = `${_replaysPageGames.length} saved game${_replaysPageGames.length !== 1 ? 's' : ''}`;
  if (list) list.innerHTML = renderReplaysPageRows(_replaysPageGames, isAdmin);
}

function renderReplaysPageRows(games, isAdmin) {
  if (!games.length) return '<p class="replay-picker-empty">No saved games found.</p>';
  return games.map(g => {
    const displayName = g.name || g.filename.replace('.json', '');
    const isNamed = !!g.name;
    const dt = g.finished_at_ms ? new Date(g.finished_at_ms).toLocaleString() : (g.started_at_ms ? new Date(g.started_at_ms).toLocaleString() : '-');
    const meta = [g.player_count ? `${g.player_count}p` : null, g.yard_count ? `${g.yard_count} yards` : null, dt].filter(Boolean).join(' · ');
    const adminBtns = isAdmin ? `
      <button class="replay-picker-action" title="Rename" onclick="event.stopPropagation(); startRenameReplay('${g.filename}', this)"><i class="ti ti-pencil"></i></button>
      <button class="replay-picker-action danger" title="Delete" onclick="event.stopPropagation(); deleteReplay('${g.filename}', this)"><i class="ti ti-trash"></i></button>` : '';
    return `<div class="replay-picker-row" onclick="loadReplayFromPage('${g.filename}')">
      <div class="replay-picker-row-main">
        <span class="replay-picker-name${isNamed ? '' : ' unnamed'}">${escapeReplayName(displayName)}</span>
        <div class="replay-picker-row-actions">${adminBtns}</div>
      </div>
      <span class="replay-picker-meta">${meta}</span>
    </div>`;
  }).join('');
}

function escapeReplayName(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function loadReplayFromPage(filename) {
  try {
    const r = await fetch(`/api/games/${encodeURIComponent(filename)}`);
    if (!r.ok) throw new Error();
    if (typeof loadReplayJson === 'function') {
      moveReplaySurfaceToReplays();
      const viewer = document.getElementById('replays-viewer');
      const title = document.getElementById('replays-viewer-title');
      const game = _replaysPageGames.find(g => g.filename === filename);
      if (viewer) viewer.hidden = false;
      if (title) title.textContent = game?.name || filename.replace('.json', '');
      if (typeof prepareReplayBoard === 'function') prepareReplayBoard();
      loadReplayJson(await r.json());
    }
  } catch (_) {
    alert('Could not load game.');
  }
}

async function startRenameReplay(filename, btn) {
  const row = btn.closest('.replay-picker-row');
  const nameEl = row.querySelector('.replay-picker-name');
  const current = nameEl.textContent;
  nameEl.outerHTML = `<input class="replay-picker-rename-input" value="${escapeReplayName(current)}" maxlength="80" onclick="event.stopPropagation()">`;
  const input = row.querySelector('input');
  input.focus(); input.select();
  input.onkeydown = async e => {
    if (e.key === 'Enter') await _confirmRenameReplay(filename, input.value.trim());
    if (e.key === 'Escape') loadReplaysPage();
  };
  btn.innerHTML = '<i class="ti ti-check"></i>';
  btn.onclick = e => { e.stopPropagation(); _confirmRenameReplay(filename, input.value.trim()); };
}

async function _confirmRenameReplay(filename, name) {
  if (!name) return;
  await fetch(`/api/games/${encodeURIComponent(filename)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  await loadReplaysPage();
}

async function deleteReplay(filename) {
  if (!confirm('Delete this game? This cannot be undone.')) return;
  await fetch(`/api/games/${encodeURIComponent(filename)}`, {
    method: 'DELETE',
    headers: { 'X-Admin-Token': adminToken },
  });
  await loadReplaysPage();
}
