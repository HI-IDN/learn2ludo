// Replays page — browse, filter, and load saved games.

let _allGames = [];
let _replayFilterPlayers = 'all';
let _replayFilterYards = 'all';
let _replayFilterWinner = 'all';

async function loadReplaysPage() {
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
  filterReplays();
}

function _buildFilterPills() {
  const playerCounts = [...new Set(_allGames.map(g => g.player_count).filter(Boolean))].sort((a,b)=>a-b);
  const yardCounts   = [...new Set(_allGames.map(g => g.yard_count).filter(Boolean))].sort((a,b)=>a-b);

  const pEl = document.getElementById('replays-filter-players');
  const yEl = document.getElementById('replays-filter-yards');
  if (!pEl || !yEl) return;

  pEl.innerHTML = `<button class="replays-pill active" data-val="all" onclick="setPlayersFilter('all',this)">All</button>`
    + playerCounts.map(n => `<button class="replays-pill" data-val="${n}" onclick="setPlayersFilter(${n},this)">${n}p</button>`).join('');

  yEl.innerHTML = `<button class="replays-pill active" data-val="all" onclick="setYardsFilter('all',this)">All</button>`
    + yardCounts.map(n => `<button class="replays-pill" data-val="${n}" onclick="setYardsFilter(${n},this)">${n} yards</button>`).join('');
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

function setWinnerFilter(val, btn) {
  _replayFilterWinner = val;
  btn.closest('.replays-pills').querySelectorAll('.replays-pill').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  filterReplays();
}

function filterReplays() {
  const isAdmin = typeof adminToken !== 'undefined' && adminToken;
  const search = (document.getElementById('replays-search')?.value || '').toLowerCase();
  const filtered = _allGames.filter(g => {
    if (g.incomplete && !isAdmin) return false;           // hide incomplete from non-admin
    if (_replayFilterPlayers !== 'all' && g.player_count !== _replayFilterPlayers) return false;
    if (_replayFilterYards !== 'all' && g.yard_count !== _replayFilterYards) return false;
    if (_replayFilterWinner !== 'all') {
      const winnerType = _winnerType(g);
      if (_replayFilterWinner !== winnerType) return false;
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
  const isAdmin = typeof adminToken !== 'undefined' && adminToken;
  list.innerHTML = filtered.map(g => _renderGameCard(g, isAdmin)).join('');
}

function _winnerType(g) {
  if (g.winner === null || g.winner === undefined) return null;
  const winner = (g.players || []).find(p => p.index === g.winner);
  return winner?.type || null;
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
  if (typeof switchTab === 'function') switchTab('play');
  try {
    const r = await fetch(`/api/games/${encodeURIComponent(filename)}`);
    if (!r.ok) throw new Error();
    if (typeof loadReplayJson === 'function') {
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
