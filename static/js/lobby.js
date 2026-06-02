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

function renderLobbyYardControl() {
  const n = settings.board_yard_count ?? 4;
  const disp = document.getElementById('lobby-yard-display');
  const shape = document.getElementById('lobby-yard-shape');
  if (disp) disp.textContent = n;
  if (shape) shape.textContent = YARD_SHAPES[n] ?? n + '-gon';
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
    const type      = isActive ? getPlayerType(playerIdx) : 'human';
    const isHuman   = type === 'human';
    const name      = isActive ? getPlayerName(playerIdx) : '';
    const canRemove = isActive && active.length > 2;

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
            <i class="fa-solid ${isActive && !isHuman ? 'fa-robot' : 'fa-user'} lobby-avatar-icon"></i>
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
          ${!isHuman ? lobbyBotSelect(slotIdx, playerIdx) : ''}
          <div class="lobby-name-wrap">
            <input class="lobby-name-input" type="text"
              placeholder="${isHuman ? 'Enter name…' : ''}"
              value="${isHuman ? name : ''}"
              ${isHuman ? '' : 'disabled'}
              oninput="lobbySetName(${slotIdx}, this.value)"
              onkeydown="if(event.key==='Enter')this.blur()">
            ${isHuman ? `<i class="fa-solid fa-pen lobby-name-edit-icon"></i>` : ''}
          </div>
        </div>` : `
        <div class="lobby-slot-body lobby-slot-add">
          <i class="fa-solid fa-plus"></i>
          <span>Add player</span>
        </div>`}
      </div>`;
  }).join('');

  renderLobbyHint(active);
  renderLobbyYardControl();
  if (typeof renderConsentGate === 'function') renderConsentGate();
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
  const bots = typeof getBotRegistry === 'function' ? getBotRegistry() : [];
  const current = settings.bot_ids?.[playerIdx] ?? (bots[0]?.id || 'eris');
  const options = bots.map(b =>
    `<option value="${b.id}" ${b.id === current ? 'selected' : ''}>${b.name}</option>`
  ).join('');
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
  // persist default bot id so getPlayerName doesn't fall back to "Bot"
  if (type !== 'human' && !settings.bot_ids?.[playerIdx]) {
    const bots = typeof getBotRegistry === 'function' ? getBotRegistry() : [];
    if (bots.length) { settings.bot_ids = settings.bot_ids || {}; settings.bot_ids[playerIdx] = bots[0].id; }
  }
  persistSettings();
  renderLobbySlots();
}

function lobbySetBotId(slotIdx, botId) {
  const playerIdx = lobbyActiveSlots().indexOf(slotIdx);
  if (playerIdx === -1) return;
  settings.bot_ids = settings.bot_ids || {};
  settings.bot_ids[playerIdx] = botId;
  persistSettings();
}

function lobbySetName(slotIdx, v) {
  const playerIdx = lobbyActiveSlots().indexOf(slotIdx);
  if (playerIdx === -1) return;
  settings.player_names = settings.player_names || {};
  settings.player_names[playerIdx] = v;
  persistSettings();
  if (typeof renderPlayers === 'function') renderPlayers();
}

function startFromLobby() {
  if (typeof enforceConsentGate === 'function' && !enforceConsentGate()) {
    return;
  }
  const active = lobbyActiveSlots();
  settings.num_players = active.length;
  persistSettings();
  switchTab('play');
  drawBoard();
  showPregame(active);
}
