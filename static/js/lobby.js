// Lobby — player select screen shown before Play.
// Reads/writes the global `settings` object (owned by app.js).
//
// Active players are stored as settings.active_slots: an ordered array of
// slot indices (0=red,1=green,2=yellow,3=blue).

function lobbyMaxSlots() { return settings.board_max_players ?? 4; }

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
              onclick="lobbySetType(${slotIdx},'random')">
              <i class="fa-solid fa-robot"></i> Bot
            </button>
          </div>
          <div class="lobby-name-wrap">
            <input class="lobby-name-input" type="text"
              placeholder="${isHuman ? 'Enter name…' : botDisplayName(playerIdx)}"
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

function lobbySetType(slotIdx, type) {
  const playerIdx = lobbyActiveSlots().indexOf(slotIdx);
  if (playerIdx === -1) return;
  settings.player_types = settings.player_types || {};
  settings.player_types[playerIdx] = type;
  persistSettings();
  renderLobbySlots();
}

function lobbySetName(slotIdx, v) {
  const playerIdx = lobbyActiveSlots().indexOf(slotIdx);
  if (playerIdx === -1) return;
  settings.player_names = settings.player_names || {};
  settings.player_names[playerIdx] = v;
  persistSettings();
}

function startFromLobby() {
  const active = lobbyActiveSlots();
  settings.num_players = active.length;
  persistSettings();
  switchTab('play');
  newGame();
}
