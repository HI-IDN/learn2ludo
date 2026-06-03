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
}

// ── Board mini-preview ────────────────────────────────────────────────────────

function renderLobbyBoardPreview() {
  const wrap = document.getElementById('lobby-board-preview');
  if (!wrap) return;

  const active   = lobbyActiveSlots();
  const yardCount = settings.board_yard_count ?? 4;
  const pawns    = settings.pawns_per_player ?? 4;
  const size     = 200;
  const cx       = size / 2;
  const cy       = size / 2;
  const r        = 72;

  // Angles: start at top (-90°), go clockwise
  const angleStep = (2 * Math.PI) / yardCount;
  const startAngle = -Math.PI / 2;

  const circles = Array.from({length: yardCount}, (_, i) => {
    const slotIdx   = i;
    const playerIdx = active.indexOf(slotIdx);
    const isActive  = playerIdx !== -1;
    const colorName = PLAYER_COLORS[slotIdx] || 'blue';
    const color     = COLORS[colorName] || '#888';
    const angle     = startAngle + i * angleStep;
    const x         = cx + r * Math.cos(angle);
    const y         = cy + r * Math.sin(angle);

    const profile = isActive && typeof getSlotProfile === 'function' ? getSlotProfile(playerIdx) : null;
    const icon    = isActive
      ? (getPlayerType(playerIdx) !== 'human' ? 'fa-robot' : (profile?.icon || 'fa-user'))
      : null;

    // Pawn dots
    const dotR    = 3.5;
    const dotRing = 16;
    const dots    = Array.from({length: Math.min(pawns, 6)}, (_, d) => {
      const da = (2 * Math.PI / Math.min(pawns, 6)) * d - Math.PI / 2;
      return `<circle cx="${(dotRing * Math.cos(da)).toFixed(1)}" cy="${(dotRing * Math.sin(da)).toFixed(1)}" r="${dotR}" fill="rgba(255,255,255,0.55)"/>`;
    }).join('');

    const label = colorName.charAt(0).toUpperCase() + colorName.slice(1);

    return `<g transform="translate(${x.toFixed(1)},${y.toFixed(1)})" style="cursor:default">
      <circle r="22" fill="${isActive ? color : '#ccc'}" opacity="${isActive ? '1' : '0.3'}"/>
      ${isActive ? dots : ''}
      <text y="34" text-anchor="middle" font-size="9" fill="${isActive ? color : '#999'}" font-family="Jost,sans-serif" font-weight="600">${label}</text>
    </g>`;
  });

  // Track ring (thin outline polygon)
  const pts = Array.from({length: yardCount}, (_, i) => {
    const angle = startAngle + i * angleStep;
    return `${(cx + r * Math.cos(angle)).toFixed(1)},${(cy + r * Math.sin(angle)).toFixed(1)}`;
  }).join(' ');

  // Center info
  const pawnLabel = `${pawns} pawn${pawns !== 1 ? 's' : ''}`;
  const shapeLabel = YARD_SHAPES[yardCount] ?? `${yardCount}-player`;

  wrap.innerHTML = `
    <div class="lobby-preview-wrap">
      <svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" class="lobby-preview-svg">
        <polygon points="${pts}" fill="none" stroke="#ddd" stroke-width="1.5" stroke-dasharray="4 3"/>
        ${circles.join('')}
        <text x="${cx}" y="${cy - 6}" text-anchor="middle" font-size="10" fill="#888" font-family="Jost,sans-serif">${shapeLabel}</text>
        <text x="${cx}" y="${cy + 10}" text-anchor="middle" font-size="9" fill="#bbb" font-family="Jost,sans-serif">${pawnLabel}</text>
      </svg>
      <p class="lobby-preview-hint">Play order goes clockwise. Drag slots to reorder.</p>
    </div>`;
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
  renderLobbyBoardPreview();
}

function renderLobbyHint(active) {
  const hint = document.getElementById('lobby-hint');
  if (!hint) return;
  hint.innerHTML = active.length === 2
    ? `<div class="lobby-hint">
         <i class="fa-solid fa-lightbulb"></i>
         Diagonal corners recommended:
         <strong>Red + Yellow</strong> or <strong>Green + Blue</strong>
       </div>`
    : '';
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
    if (getPlayerType(playerIdx) !== 'human' && !settings.bot_ids?.[playerIdx])
      return `Select a bot for the ${PLAYER_COLORS[slotIdx] || 'player'} slot.`;
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
