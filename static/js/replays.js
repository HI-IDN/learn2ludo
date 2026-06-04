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
  setReplayViewerLoaded();
}

function moveReplaySurfaceToPlay() {
  const panelPlay = document.getElementById('panel-play');
  const playLayout = document.getElementById('play-layout');
  if (panelPlay && playLayout && playLayout.parentElement !== panelPlay) {
    panelPlay.appendChild(playLayout);
  }
}

function quitReplayFromPage() {
  if (typeof resetPostGame === 'function') resetPostGame();
  if (typeof clearReplayMode === 'function') clearReplayMode();
  moveReplaySurfaceToPlay();
  _selectedReplayFilename = null;
  renderSelectedReplayRow();
  setReplayViewerEmpty();
}

function showReplayStatsFromPage() {
  if (typeof showReplayStats !== 'function' || typeof replayData === 'undefined' || !replayData?.player_stats) return;
  showReplayStats(replayData);
}

let _replaysPageGames = [];
let _selectedReplayFilename = null;
let _replaysSortKey = 'timestamp';
let _replaysSortDir = 'desc';

function setReplayViewerLoaded() {
  const viewer = document.getElementById('replays-viewer');
  const empty = document.getElementById('replays-empty-viewer');
  const actions = document.getElementById('replays-viewer-actions');
  if (viewer) viewer.hidden = false;
  if (empty) empty.style.display = 'none';
  if (actions) actions.style.display = 'flex';
}

function setReplayViewerEmpty() {
  const viewer = document.getElementById('replays-viewer');
  const empty = document.getElementById('replays-empty-viewer');
  const actions = document.getElementById('replays-viewer-actions');
  const title = document.getElementById('replays-viewer-title');
  if (viewer) viewer.hidden = false;
  if (empty) empty.style.display = 'flex';
  if (actions) actions.style.display = 'none';
  if (title) title.textContent = 'Replay';
}

async function loadReplaysPage() {
  renderReplaysAdminWidget();
  if (!(typeof isReplayActive === 'function' && isReplayActive())) setReplayViewerEmpty();
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
  if (list) list.innerHTML = renderReplaysTable(_replaysPageGames, isAdmin);
}

function renderReplaysTable(games, isAdmin) {
  if (!games.length) return '<p class="replay-picker-empty">No saved games found.</p>';
  const sorted = [...games].sort((a, b) => compareReplayRows(a, b));
  return `<table class="replays-table">
    <thead>
      <tr>
        <th><button type="button" onclick="sortReplaysBy('name')">Name ${sortMark('name')}</button></th>
        <th><button type="button" onclick="sortReplaysBy('players')">Players ${sortMark('players')}</button></th>
        <th><button type="button" onclick="sortReplaysBy('yards')">Yards ${sortMark('yards')}</button></th>
        <th><button type="button" onclick="sortReplaysBy('timestamp')">Timestamp ${sortMark('timestamp')}</button></th>
        ${isAdmin ? '<th class="replays-table-actions">Delete</th>' : ''}
      </tr>
    </thead>
    <tbody>
      ${sorted.map(g => renderReplayTableRow(g, isAdmin)).join('')}
    </tbody>
  </table>`;
}

function renderReplayTableRow(g, isAdmin) {
    const displayName = g.name || g.filename.replace('.json', '');
    const isNamed = !!g.name;
    const dt = g.finished_at_ms ? new Date(g.finished_at_ms).toLocaleString() : (g.started_at_ms ? new Date(g.started_at_ms).toLocaleString() : '-');
    const selected = g.filename === _selectedReplayFilename;
    const nameCell = isAdmin
      ? `<input class="replays-name-input${isNamed ? '' : ' unnamed'}" value="${escapeReplayName(displayName)}" onclick="event.stopPropagation()" onkeydown="handleReplayNameKey(event,'${g.filename}')" onblur="renameReplayFromInput('${g.filename}', this)">`
      : `<span class="replays-table-name${isNamed ? '' : ' unnamed'}">${escapeReplayName(displayName)}</span>`;
    return `<tr class="${selected ? 'selected' : ''}" data-filename="${escapeReplayName(g.filename)}" onclick="loadReplayFromPage('${g.filename}')">
      <td>${nameCell}</td>
      <td>${renderReplayPlayers(g)}</td>
      <td>${g.yard_count ?? '-'}</td>
      <td>${dt}</td>
      ${isAdmin ? `<td class="replays-table-actions"><button class="replay-picker-action danger" title="Delete" onclick="event.stopPropagation(); deleteReplay('${g.filename}')"><i class="ti ti-trash"></i></button></td>` : ''}
    </tr>`;
}

function renderReplayPlayers(g) {
  const players = Array.isArray(g.players) ? [...g.players] : [];
  if (!players.length) return escapeReplayName(g.player_count ?? '-');
  players.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const count = g.player_count ?? players.length;
  return `<div class="replays-player-list">
    <span class="replays-player-count">${escapeReplayName(count)}p</span>
    ${players.map(p => renderReplayPlayerLabel(p)).join('')}
  </div>`;
}

function renderReplayPlayerLabel(player) {
  const isBot = player.type === 'bot' || !!player.bot_id;
  const label = isBot ? replayBotName(player.bot_id) : replayHumanName(player.human_id);
  const fallback = `Player ${(player.index ?? 0) + 1}`;
  const text = label || fallback;
  const titleParts = [
    fallback,
    player.color,
    isBot ? player.bot_id : player.human_id,
  ].filter(Boolean);
  return `<span class="replays-player-chip ${isBot ? 'bot' : 'human'}" title="${escapeReplayName(titleParts.join(' · '))}">
    ${escapeReplayName(text)}
  </span>`;
}

function replayHumanName(humanId) {
  if (!humanId) return '';
  const profile = typeof getProfileById === 'function' ? getProfileById(humanId) : null;
  const profileName = typeof profileDisplayName === 'function' ? profileDisplayName(profile) : profile?.username;
  if (profileName && profileName !== humanId) return profileName;
  const sessionName = typeof getSessionProfileName === 'function' ? getSessionProfileName(humanId) : '';
  return sessionName || humanId;
}

function replayBotName(botId) {
  if (!botId) return '';
  const registry = typeof getBotRegistry === 'function' ? getBotRegistry() : [];
  return registry.find(bot => bot.id === botId)?.name || botId;
}

function sortReplaysBy(key) {
  if (_replaysSortKey === key) {
    _replaysSortDir = _replaysSortDir === 'asc' ? 'desc' : 'asc';
  } else {
    _replaysSortKey = key;
    _replaysSortDir = key === 'timestamp' ? 'desc' : 'asc';
  }
  const list = document.getElementById('replays-list');
  const isAdmin = typeof adminToken !== 'undefined' && adminToken;
  if (list) list.innerHTML = renderReplaysTable(_replaysPageGames, isAdmin);
}

function sortMark(key) {
  if (_replaysSortKey !== key) return '';
  return _replaysSortDir === 'asc' ? '<i class="ti ti-chevron-up"></i>' : '<i class="ti ti-chevron-down"></i>';
}

function compareReplayRows(a, b) {
  const av = replaySortValue(a, _replaysSortKey);
  const bv = replaySortValue(b, _replaysSortKey);
  const dir = _replaysSortDir === 'asc' ? 1 : -1;
  if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
  return String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' }) * dir;
}

function replaySortValue(g, key) {
  if (key === 'players') return g.player_count ?? 0;
  if (key === 'yards') return g.yard_count ?? 0;
  if (key === 'timestamp') return g.finished_at_ms || g.started_at_ms || 0;
  return g.name || g.filename.replace('.json', '');
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
      _selectedReplayFilename = filename;
      renderSelectedReplayRow();
      setReplayViewerLoaded();
      if (title) title.textContent = game?.name || filename.replace('.json', '');
      if (typeof prepareReplayBoard === 'function') prepareReplayBoard();
      loadReplayJson(await r.json());
    }
  } catch (_) {
    alert('Could not load game.');
  }
}

function renderSelectedReplayRow() {
  document.querySelectorAll('.replays-table tbody tr').forEach(row => row.classList.remove('selected'));
  document.querySelector(`.replays-table tbody tr[data-filename="${CSS.escape(_selectedReplayFilename || '')}"]`)?.classList.add('selected');
}

function handleReplayNameKey(event, filename) {
  if (event.key === 'Enter') {
    event.preventDefault();
    event.currentTarget.blur();
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    loadReplaysPage();
  }
}

async function renameReplayFromInput(filename, input) {
  const name = input.value.trim();
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
  if (_selectedReplayFilename === filename) quitReplayFromPage();
  await loadReplaysPage();
}
