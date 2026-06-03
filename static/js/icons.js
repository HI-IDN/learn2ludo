// FontAwesome face icon pool for human players.
// Shuffled once at load time so the picker grid feels playful.

const FACE_ICONS = (() => {
  const icons = [
    'fa-face-angry','fa-face-dizzy','fa-face-flushed','fa-face-frown',
    'fa-face-frown-open','fa-face-grimace','fa-face-grin','fa-face-grin-beam',
    'fa-face-grin-beam-sweat','fa-face-grin-hearts','fa-face-grin-squint',
    'fa-face-grin-squint-tears','fa-face-grin-stars','fa-face-grin-tears',
    'fa-face-grin-tongue','fa-face-grin-tongue-squint','fa-face-grin-tongue-wink',
    'fa-face-grin-wide','fa-face-grin-wink','fa-face-kiss','fa-face-kiss-beam',
    'fa-face-kiss-wink-heart','fa-face-laugh','fa-face-laugh-beam',
    'fa-face-laugh-squint','fa-face-laugh-wink','fa-face-meh','fa-face-meh-blank',
    'fa-face-rolling-eyes','fa-face-sad-cry','fa-face-sad-tear','fa-face-smile',
    'fa-face-smile-beam','fa-face-smile-wink','fa-face-surprise','fa-face-tired',
  ];
  // Fisher-Yates shuffle (seeded by load order, stable within a session)
  for (let i = icons.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [icons[i], icons[j]] = [icons[j], icons[i]];
  }
  return icons;
})();

const DEFAULT_FACE_ICON = 'fa-face-smile';

function getPlayerIcon(playerIdx) {
  const profile = typeof getSlotProfile === 'function' ? getSlotProfile(playerIdx) : null;
  if (profile?.icon && FACE_ICONS.includes(profile.icon)) return profile.icon;
  const icon = settings.player_icons?.[playerIdx];
  if (icon && FACE_ICONS.includes(icon)) return icon;
  return DEFAULT_FACE_ICON;
}

function setPlayerIcon(playerIdx, icon) {
  settings.player_icons = settings.player_icons || {};
  settings.player_icons[playerIdx] = icon;
  persistSettings();
}

// Returns the FA class string for a player:
// humans → their chosen face icon, bots → fa-robot
function playerIconClass(playerIdx) {
  return gamePlayerType(playerIdx) !== 'human' ? 'fa-robot' : getPlayerIcon(playerIdx);
}

// ── Icon picker popover ───────────────────────────────────────────────────────

let _pickerOpenFor = null;

function openIconPicker(playerIdx, anchorEl) {
  closeIconPicker();
  _pickerOpenFor = playerIdx;
  const hex = COLORS[playerIconColor(playerIdx)] || '#888';
  const current = getPlayerIcon(playerIdx);

  const picker = document.createElement('div');
  picker.id = 'icon-picker-popover';
  const grid = FACE_ICONS.map(ic => `
    <button class="icon-pick-btn${ic === current ? ' selected' : ''}"
            title="${ic.replace('fa-face-','')}"
            onclick="selectIcon(${playerIdx},'${ic}')">
      <i class="fa-solid ${ic}" style="color:${hex}"></i>
    </button>`).join('');
  picker.innerHTML = `<div class="icon-pick-grid">${grid}</div>`;
  document.body.appendChild(picker);

  // Position near anchor
  const rect = anchorEl.getBoundingClientRect();
  picker.style.top  = (rect.bottom + 6 + window.scrollY) + 'px';
  picker.style.left = Math.max(4, rect.left + window.scrollX - 80) + 'px';

  // Close on outside click
  setTimeout(() => document.addEventListener('click', _pickerOutside, {once: true}), 0);
}

function _pickerOutside(e) {
  if (!document.getElementById('icon-picker-popover')?.contains(e.target)) closeIconPicker();
}

function closeIconPicker() {
  document.getElementById('icon-picker-popover')?.remove();
  _pickerOpenFor = null;
}

function selectIcon(playerIdx, icon) {
  setPlayerIcon(playerIdx, icon);
  closeIconPicker();
  if (typeof renderLobbySlots === 'function') renderLobbySlots();
  if (typeof renderGame === 'function' && typeof gameState !== 'undefined' && gameState) renderGame();
}

function playerIconColor(playerIdx) {
  if (gameState?.players?.[playerIdx]?.color) return gameState.players[playerIdx].color;
  const slot = typeof playerSlot === 'function' ? playerSlot(playerIdx) : playerIdx;
  return (typeof PLAYER_COLORS !== 'undefined' ? PLAYER_COLORS[slot] : null) || 'blue';
}
