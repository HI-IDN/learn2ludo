// Lobby — player select screen shown before Play.
// Reads/writes the global `settings` object (owned by app.js).
//
// Active players are stored as settings.active_slots: an ordered array of
// slot indices (0=red,1=green,2=yellow,3=blue).

const YARD_SHAPES = {2:'line', 3:'triangle', 4:'cross', 5:'pentagon', 6:'hexagon'};

function lobbyMaxSlots() { return settings.board_yard_count ?? 4; }

function lobbyChangeYards(delta) {
  const current = settings.board_yard_count ?? 4;
  const next = Math.max(2, Math.min(6, current + delta));
  if (next === current) return;
  settings.board_yard_count = next;
  // Drop any active slots that exceed new max
  if (Array.isArray(settings.active_slots))
    settings.active_slots = settings.active_slots.filter(s => s < next);
  if ((settings.num_players ?? next) > next) settings.num_players = next;
  persistSettings();
  // Sync the hidden settings input so readBoardConfig() stays consistent
  const el = document.getElementById('board-yard-count');
  if (el) el.value = next;
  if (typeof invalidateBoardGeometry === 'function') invalidateBoardGeometry();
  renderLobbySlots();
  drawBoard();
}

function lobbyChangePawns(delta) {
  const current = settings.pawns_per_player ?? 4;
  const next = Math.max(1, Math.min(8, current + delta));
  if (next === current) return;
  settings.pawns_per_player = next;
  persistSettings();
  const el = document.getElementById('board-pawns-per-player');
  if (el) el.value = next;
  renderLobbySlots();
  drawBoard();
  setTimeout(renderLobbyBoardPreview, 80);
}

function renderLobbyYardControl() {
  const n = settings.board_yard_count ?? 4;
  const p = settings.pawns_per_player ?? 4;
  const disp = document.getElementById('lobby-yard-display');
  const shape = document.getElementById('lobby-yard-shape');
  if (disp) disp.textContent = n;
  if (shape) shape.textContent = YARD_SHAPES[n] ?? n + '-gon';
  const pd = document.getElementById('lobby-pawns-display');
  if (pd) pd.textContent = p;
  const boardBadge = document.getElementById('lobby-board-summary-state');
  if (boardBadge) boardBadge.textContent = `${YARD_SHAPES[n] ?? n + '-gon'} · ${p} pawn${p !== 1 ? 's' : ''}`;
}

function renderLobbyPlayersBadge(active) {
  const badge = document.getElementById('lobby-players-summary-state');
  if (!badge) return;
  const n = (active ?? lobbyActiveSlots()).length;
  badge.textContent = `${n} player${n !== 1 ? 's' : ''}`;
}

// ── Board mini-preview (clone of the real board SVG) ─────────────────────────

function renderLobbyBoardPreview() {
  const wrap = document.getElementById('lobby-board-preview');
  if (!wrap) return;

  const src = document.getElementById('ludo-board');
  if (!src || !src.innerHTML.trim()) {
    wrap.innerHTML = '<p class="lobby-preview-hint" style="padding:20px">Board preview renders after first draw.</p>';
    return;
  }

  const clone = src.cloneNode(true);
  clone.removeAttribute('id');
  clone.querySelectorAll('foreignObject').forEach(el => el.remove());
  // Force 200×200 — overrides any inline size board.js may have set
  clone.setAttribute('width', '200');
  clone.setAttribute('height', '200');
  clone.style.cssText = 'display:block;width:200px;height:200px;';
  clone.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  wrap.innerHTML = '';
  wrap.appendChild(clone);
}

function lobbyActiveSlots() {
  const max = lobbyMaxSlots();
  if (Array.isArray(settings.active_slots) && settings.active_slots.length >= 2) {
    // Drop any slots that exceed the current max
    const valid = settings.active_slots.filter(s => s < max);
    if (valid.length >= 2) return valid;
  }
  const n = settings.num_players ?? max;
  return Array.from({length: Math.max(2, Math.min(n, max))}, (_, i) => i);
}

function renderLobbySlots() {
  const wrap = document.getElementById('lobby-slots');
  if (!wrap) return;

  const active = lobbyActiveSlots();

  wrap.innerHTML = Array.from({length: lobbyMaxSlots()}, (_, slotIdx) => {
    const isActive  = active.includes(slotIdx);
    const playerIdx = active.indexOf(slotIdx);
    const colorName = PLAYER_COLORS[slotIdx] || 'blue';
    const color     = COLORS[colorName] || COLORS.blue;
    const type       = isActive ? getPlayerType(playerIdx) : 'human';
    const isHuman    = type === 'human';
    const profile    = isActive && isHuman && typeof getSlotProfile === 'function' ? getSlotProfile(playerIdx) : null;
    const canRemove  = isActive && active.length > 2;
    const botRegistry = typeof getBotRegistry === 'function' ? getBotRegistry() : [];
    const assignedBot = !isHuman && isActive ? botRegistry.find(b => b.id === settings.bot_ids?.[playerIdx]) : null;
    const avatarIcon  = !isActive || !isHuman
      ? (isActive ? 'fa-robot' : 'fa-user')
      : (profile ? (typeof getPlayerIcon === 'function' ? getPlayerIcon(playerIdx) : 'fa-face-smile') : 'fa-user');
    const avatarHtml = assignedBot && typeof botAvatarHtml === 'function'
      ? botAvatarHtml(assignedBot, { className: 'bot-avatar bot-avatar--lobby' })
      : `<i class="fa-solid ${avatarIcon} lobby-avatar-icon"></i>`;

    return `
      <div class="lobby-slot ${isActive ? 'slot-active' : 'slot-inactive'}"
           style="--slot-color:${color}"
           ${!isActive && active.length < lobbyMaxSlots() ? `onclick="lobbyToggleSlot(${slotIdx})"` : ''}>
        <div class="lobby-slot-top" style="background:${color}">
          ${canRemove
            ? `<button class="lobby-slot-remove" onclick="lobbyToggleSlot(${slotIdx})" title="Remove player">
                 <i class="fa-solid fa-xmark"></i>
               </button>`
            : ''}
          <div class="lobby-slot-avatar">
            ${avatarHtml}
          </div>
          <div class="lobby-slot-tag">${colorName}</div>
        </div>
        ${isActive ? `
        <div class="lobby-slot-body">
          <div class="lobby-type-toggle">
            <button class="lobby-type-btn${isHuman ? ' active' : ''}"
              onclick="lobbySetType(${slotIdx},'human')">
              <i class="fa-solid fa-user"></i> Human
            </button>
            <button class="lobby-type-btn${!isHuman ? ' active' : ''}"
              onclick="lobbySetType(${slotIdx},'bot')">
              <i class="fa-solid fa-robot"></i> Bot
            </button>
          </div>
          ${!isHuman ? lobbyBotSelect(slotIdx, playerIdx) : (typeof lobbyProfileSelect === 'function' ? lobbyProfileSelect(slotIdx, playerIdx) : '')}
          ${isHuman && typeof loadProfiles === 'function'
            ? (() => {
                const all = loadProfiles();
                const ready = all.filter(p => typeof isSessionConsented === 'function' && isSessionConsented(p.id));
                if (!all.length)
                  return `<p class="lobby-no-profile-hint">No players yet — <a href="#" onclick="event.preventDefault();switchTab('profiles')">go to Players tab</a>.</p>`;
                if (!ready.length)
                  return `<p class="lobby-no-profile-hint"><a href="#" onclick="event.preventDefault();switchTab('profiles')">Select yourself</a> in the Players tab first.</p>`;
                return '';
              })()
            : ''}
        </div>` : `
        <div class="lobby-slot-body lobby-slot-add">
          <i class="fa-solid fa-plus"></i>
          <span>Add player</span>
        </div>`}
      </div>`;
  }).join('');

  renderLobbyHint(active);
  renderLobbyYardControl();
  renderLobbyPlayersBadge(active);
  // Preview is cloned from the real board — defer so drawBoard() finishes first
  setTimeout(renderLobbyBoardPreview, 50);
}

function _colorSpan(slotIdx) {
  const name = (PLAYER_COLORS[slotIdx] || 'blue');
  const hex  = COLORS[name] || '#888';
  return `<span style="color:${hex};font-weight:700">${name.charAt(0).toUpperCase() + name.slice(1)}</span>`;
}

function _slotGaps(sortedSlots, yards) {
  const n = sortedSlots.length;
  return sortedSlots.map((s, i) => ((sortedSlots[(i + 1) % n] - s + yards) % yards));
}

function renderLobbyHint(active) {
  const hint = document.getElementById('lobby-hint');
  if (!hint) return;
  const n = active.length;
  const yards = settings.board_yard_count ?? 4;

  if (n < 2) { hint.innerHTML = ''; return; }

  const sorted = [...active].sort((a, b) => a - b);
  const gaps   = _slotGaps(sorted, yards);
  const maxG   = Math.max(...gaps);
  const minG   = Math.min(...gaps);
  const isEven = maxG === minG;

  // -- Even spacing: no warning needed (optionally encourage) --
  if (isEven) {
    hint.innerHTML = n === yards
      ? '' // all slots filled = always balanced, no hint needed
      : `<div class="lobby-hint">
           <i class="fa-solid fa-circle-check lobby-hint-icon"></i>
           Players are evenly spaced — balanced setup.
         </div>`;
    return;
  }

  // -- Uneven spacing --
  // Build the set of all optimal distributions (evenly-spaced starting slots)
  const step = yards / n; // may be fractional
  const isInteger = Number.isInteger(step);

  let body = '';

  if (n === 2 && yards === 4) {
    // Special case: name the two diagonal pairs
    const d1 = `${_colorSpan(0)} + ${_colorSpan(2)}`;
    const d2 = `${_colorSpan(1)} + ${_colorSpan(3)}`;
    body = `<i class="fa-solid fa-lightbulb lobby-hint-icon"></i>
      Diagonal corners recommended for a fair start:
      <div class="lobby-hint-pairs">
        ${d1}
        <span class="lobby-hint-or">or</span>
        ${d2}
      </div>`;
  } else if (isInteger) {
    // Can enumerate all balanced starting offsets
    const options = Array.from({length: step}, (_, offset) => {
      const slots = Array.from({length: n}, (_, i) => (offset + i * step) % yards);
      return slots.map(_colorSpan).join(' + ');
    });
    const pairs = options.map((o, i) =>
      i === 0 ? o : `<span class="lobby-hint-or">or</span> ${o}`
    ).join(' ');
    body = `<i class="fa-solid fa-lightbulb lobby-hint-icon"></i>
      For a balanced game, spread players evenly:
      <div class="lobby-hint-pairs">${pairs}</div>`;
  } else {
    // Fractional step — just warn, can't give a perfect arrangement
    body = `<i class="fa-solid fa-triangle-exclamation lobby-hint-icon"></i>
      ${n} players on a ${yards}-yard board cannot be perfectly balanced —
      some players will have more space than others.`;
  }

  hint.innerHTML = `<div class="lobby-hint">${body}</div>`;
}

function lobbyToggleSlot(slotIdx) {
  const active   = lobbyActiveSlots();
  const isActive = active.includes(slotIdx);

  if (isActive && active.length <= 2) return;
  if (!isActive && active.length >= lobbyMaxSlots()) return;

  const next = isActive
    ? active.filter(s => s !== slotIdx)
    : [...active, slotIdx].sort((a, b) => a - b);

  settings.active_slots = next;
  settings.num_players  = next.length;
  persistSettings();
  renderLobbySlots();
}

function lobbyBotSelect(slotIdx, playerIdx) {
  const bots = typeof getSelectableBots === 'function' ? getSelectableBots() : (typeof getBotRegistry === 'function' ? getBotRegistry() : []);
  const current = settings.bot_ids?.[playerIdx] ?? null;
  const options = [
    `<option value="">— pick a bot —</option>`,
    ...bots.map(b =>
      `<option value="${b.id}" ${b.id === current ? 'selected' : ''}>${typeof botLobbyLabel === 'function' ? botLobbyLabel(b) : b.name}</option>`)
  ].join('');
  return `<select class="lobby-bot-select"
    onchange="lobbySetBotId(${slotIdx}, this.value)"
    onclick="event.stopPropagation()">
    ${options}
  </select>`;
}

function lobbySetType(slotIdx, type) {
  const playerIdx = lobbyActiveSlots().indexOf(slotIdx);
  if (playerIdx === -1) return;
  settings.player_types = settings.player_types || {};
  settings.player_types[playerIdx] = type === 'human' ? 'human' : 'random';
  if (type === 'human') { settings.bot_ids = settings.bot_ids || {}; delete settings.bot_ids[playerIdx]; }
  persistSettings();
  renderLobbySlots();
}

function lobbySetBotId(slotIdx, botId) {
  const playerIdx = lobbyActiveSlots().indexOf(slotIdx);
  if (playerIdx === -1) return;
  settings.bot_ids = settings.bot_ids || {};
  if (botId) settings.bot_ids[playerIdx] = botId;
  else delete settings.bot_ids[playerIdx];
  persistSettings();
  renderLobbySlots();
}

function lobbySetName(slotIdx, v) {
  const playerIdx = lobbyActiveSlots().indexOf(slotIdx);
  if (playerIdx === -1) return;
  settings.player_names = settings.player_names || {};
  settings.player_names[playerIdx] = v;
  persistSettings();
  if (typeof renderPlayers === 'function') renderPlayers();
}

function lobbyValidationError() {
  const active = lobbyActiveSlots();
  for (const slotIdx of active) {
    const playerIdx = active.indexOf(slotIdx);
    if (getPlayerType(playerIdx) === 'human' && typeof getSlotProfile === 'function' && !getSlotProfile(playerIdx))
      return 'Each human player must select a profile. <a href="#" onclick="event.preventDefault();switchTab(\'profiles\')">Go to Players tab</a>';
    if (getPlayerType(playerIdx) !== 'human') {
      const selectable = typeof getSelectableBots === 'function' ? getSelectableBots() : [];
      const selectedBot = settings.bot_ids?.[playerIdx];
      if (!selectedBot || !selectable.some(bot => bot.id === selectedBot))
      return `Select a bot for the ${PLAYER_COLORS[slotIdx] || 'player'} slot.`;
    }
  }
  return null;
}

function startFromLobby() {
  const err = lobbyValidationError();
  if (err) {
    const hint = document.getElementById('lobby-hint');
    if (hint) hint.innerHTML = `<div class="lobby-hint lobby-hint--warn">
      <i class="fa-solid fa-triangle-exclamation"></i> ${err}
    </div>`;
    return;
  }
  const active = lobbyActiveSlots();
  settings.num_players = active.length;
  persistSettings();
  switchTab('play');
  drawBoard();
  showPregame(active);
}
