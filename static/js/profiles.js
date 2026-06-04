// Profiles — player registration, consent, and session identity.
// Profile = { id, username (unique, ≤10 chars), icon (FA face), age_range, consent_ts, leaderboard_opt_in }
// Session consent tracked in sessionStorage so returning players re-consent each browser session.

const PROFILE_STORAGE_KEY = 'learn2ludo_profiles';
const SESSION_CONSENT_KEY  = 'learn2ludo_session_consented';
const SESSION_PROFILE_NAMES_KEY = 'learn2ludo_session_profile_names';
const PROFILE_NAME_MAX     = 10;

const AGE_RANGES = ['Under 13', '13–17', '18–29', '30–44', '45–59', '60+', 'Prefer not to say'];

const CONSENT_TEXT = `
<p>You are invited to participate in a research study on human decision-making in strategy games,
conducted at the University of Iceland.</p>
<p><strong>What data is collected:</strong> Your gameplay actions — moves made, game states, and any
written reflections you provide — will be recorded and stored. No personally identifiable information
(name, email, IP address, or device identifiers) is collected or linked to your data.</p>
<p><strong>How your data will be used:</strong> Anonymised data may be used in academic publications,
presentations, and for training AI models. Only researchers involved in this study will have access to
session data during analysis.</p>
<p><strong>Your right to withdraw:</strong> Participation is entirely voluntary. You may stop playing
at any time. Because data is stored anonymously and cannot be traced back to you once collected, it
may not be possible to remove your historical gameplay records from the dataset after they have been
submitted.</p>
<p><strong>Ethics approval:</strong> This study is conducted in accordance with the University of
Iceland's research ethics guidelines. Questions about your rights as a participant may be directed to
the research team.</p>
<p><a href="https://english.hi.is/about-ui/policies/policies-ui/research-data-policy" target="_blank" rel="noopener">
University of Iceland Research Data Policy ↗</a></p>
`;

// ── Storage ──────────────────────────────────────────────────────────────────

function loadProfiles() {
  try { return JSON.parse(localStorage.getItem(PROFILE_STORAGE_KEY) || '[]'); }
  catch { return []; }
}

function saveProfiles(profiles) {
  localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profiles));
}

function getProfileById(id) {
  return loadProfiles().find(p => p.id === id) || null;
}

function profileDisplayName(profile) {
  return profile?.username || profile?.id || '';
}

function getSessionProfileNames() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_PROFILE_NAMES_KEY) || '{}'); }
  catch { return {}; }
}

function markSessionProfileName(profile) {
  if (!profile?.id || !profile.username) return;
  const names = getSessionProfileNames();
  names[profile.id] = profile.username;
  sessionStorage.setItem(SESSION_PROFILE_NAMES_KEY, JSON.stringify(names));
}

function getSessionProfileName(profileId) {
  return getSessionProfileNames()[profileId] || '';
}

async function hydrateServerProfiles() {
  let data = null;
  try {
    const r = await fetch('/api/players');
    if (r.ok) data = await r.json();
  } catch {
    return;
  }
  const users = data?.users || {};
  const profiles = loadProfiles();
  const byId = new Map(profiles.map(p => [p.id, p]));
  Object.entries(users).forEach(([id, user]) => {
    if (!id || byId.has(id)) return;
    profiles.push({
      id,
      username: '',
      icon: user.icon || DEFAULT_FACE_ICON,
      age_range: user.age_range || 'Prefer not to say',
      consent_ts: user.last_consent_ts || user.joined_ts || Date.now(),
      leaderboard_opt_in: !!user.leaderboard_opt_in,
    });
  });
  if (profiles.length !== byId.size) saveProfiles(profiles);
}

// ── Session consent ───────────────────────────────────────────────────────────

function getSessionConsented() {
  try { return new Set(JSON.parse(sessionStorage.getItem(SESSION_CONSENT_KEY) || '[]')); }
  catch { return new Set(); }
}

function markSessionConsented(profileId) {
  const s = getSessionConsented();
  s.add(profileId);
  sessionStorage.setItem(SESSION_CONSENT_KEY, JSON.stringify([...s]));
  markSessionProfileName(getProfileById(profileId));
}

function isSessionConsented(profileId) {
  return getSessionConsented().has(profileId);
}

// ── Lobby integration ─────────────────────────────────────────────────────────

function getSlotProfile(playerIdx) {
  const id = settings.profile_ids?.[playerIdx];
  return id ? getProfileById(id) : null;
}

function setSlotProfile(playerIdx, profileId) {
  settings.profile_ids = settings.profile_ids || {};
  // Remove this profile from any other slot first (one profile per slot)
  if (profileId) {
    for (const k of Object.keys(settings.profile_ids)) {
      if (Number(k) !== playerIdx && settings.profile_ids[k] === profileId)
        delete settings.profile_ids[k];
    }
    settings.profile_ids[playerIdx] = profileId;
  } else {
    delete settings.profile_ids[playerIdx];
  }
  persistSettings();
}

function cleanStaleProfileIds() {
  if (!settings.profile_ids) return;
  const existing = new Set(loadProfiles().map(p => p.id));
  let changed = false;
  for (const k of Object.keys(settings.profile_ids)) {
    if (!existing.has(settings.profile_ids[k])) { delete settings.profile_ids[k]; changed = true; }
  }
  if (changed) persistSettings();
}

// ── Panel rendering ───────────────────────────────────────────────────────────

function renderProfiles() {
  const wrap = document.getElementById('profiles-grid');
  if (!wrap) return;
  const profiles = loadProfiles();
  if (!profiles.length) {
    wrap.innerHTML = `
      <div class="profiles-empty">
        <i class="fa-solid fa-user-plus"></i>
        <p>No players registered yet.<br>Add a player to get started.</p>
      </div>`;
    return;
  }
  wrap.innerHTML = profiles.map(p => {
    const ready = isSessionConsented(p.id);
    return `
      <div class="profile-card${ready ? ' profile-card--ready' : ''}">
        <button class="profile-card-edit" onclick="openProfileEdit('${p.id}')" title="Edit player">
          <i class="fa-solid fa-pen"></i>
        </button>
        <button class="profile-card-delete" onclick="deleteProfile('${p.id}')" title="Remove player">
          <i class="fa-solid fa-xmark"></i>
        </button>
        <div class="profile-card-icon">
          <i class="fa-solid ${escapeAttr(p.icon)}"></i>
        </div>
        <div class="profile-card-name">${escapeAttr(profileDisplayName(p))}</div>
        <div class="profile-card-age">${escapeAttr(p.age_range)}</div>
        ${ready
          ? `<div class="profile-card-status"><i class="fa-solid fa-circle-check"></i> Ready</div>`
          : `<button class="btn btn-primary btn-sm" onclick="openReconsent('${p.id}')">
               <i class="fa-solid fa-right-to-bracket"></i> Select
             </button>`}
      </div>`;
  }).join('');
}

// ── Delete ────────────────────────────────────────────────────────────────────

async function deleteProfile(id) {
  const profile = getProfileById(id);
  const customBots = profileCustomBots(id);
  const botMessage = customBots.length
    ? `\n\nThis will also delete ${customBots.length === 1 ? 'their custom bot' : `their ${customBots.length} custom bots`}:\n${customBots.map(b => `- ${b.name || b.id}`).join('\n')}`
    : '';
  if (!confirm(`Remove player "${profileDisplayName(profile) || id}"?${botMessage}`)) return;
  try {
    const r = await fetch(`/api/players/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!r.ok && !(r.status === 404 && !customBots.length)) {
      alert('Could not delete this player. Please try again.');
      return;
    }
  } catch {
    alert('Could not delete this player. Please try again.');
    return;
  }
  saveProfiles(loadProfiles().filter(p => p.id !== id));
  if (settings.profile_ids) {
    for (const k of Object.keys(settings.profile_ids)) {
      if (settings.profile_ids[k] === id) delete settings.profile_ids[k];
    }
    persistSettings();
  }
  renderProfiles();
  if (typeof renderLobbySlots === 'function') renderLobbySlots();
  if (customBots.length && typeof loadBotRegistry === 'function') await loadBotRegistry();
  if (typeof renderBotsPage === 'function') renderBotsPage();
}

function profileCustomBots(profileId) {
  const registry = typeof getBotRegistry === 'function' ? getBotRegistry() : [];
  return registry.filter(bot =>
    bot?.designer === profileId &&
    bot?._is_deleted !== true &&
    (bot.status === 'Custom' || bot.type === 'CDR')
  );
}

// ── Registration modal ────────────────────────────────────────────────────────

let _regIcon    = null;
let _editingId  = null; // non-null when editing an existing profile

function openProfileRegistration() {
  _editingId = null;
  _regIcon   = null;
  const modal = document.getElementById('profile-reg-modal');
  if (!modal) return;
  const titleEl = modal.querySelector('#reg-modal-title');
  if (titleEl) titleEl.textContent = 'New Player Registration';
  const submitEl = document.getElementById('reg-submit-btn');
  if (submitEl) submitEl.innerHTML = '<i class="fa-solid fa-user-check"></i> Register';
  const usernameEl = document.getElementById('reg-username');
  if (usernameEl) usernameEl.value = '';
  const ageEl = document.getElementById('reg-age-select');
  if (ageEl) ageEl.value = '';
  const consentEl = document.getElementById('reg-consent-check');
  if (consentEl) consentEl.checked = false;
  const parentEl = document.getElementById('reg-parent-check');
  if (parentEl) parentEl.checked = false;
  const ageConfirmEl = document.getElementById('reg-age-confirm-check');
  if (ageConfirmEl) ageConfirmEl.checked = false;
  const leaderEl = document.getElementById('reg-leaderboard-check');
  if (leaderEl) leaderEl.checked = false;
  // Show consent section for new registrations, hide for edits
  const consentSection = document.getElementById('reg-consent-section');
  if (consentSection) consentSection.hidden = false;
  modal.removeAttribute('hidden');
  _renderRegIcons();
  _updateRegParent();
  _updateRegSubmit();
  usernameEl?.focus();
}

function openProfileEdit(profileId) {
  const profile = getProfileById(profileId);
  if (!profile) return;
  _editingId = profileId;
  _regIcon   = profile.icon;
  const modal = document.getElementById('profile-reg-modal');
  if (!modal) return;
  const titleEl = modal.querySelector('#reg-modal-title');
  if (titleEl) titleEl.textContent = 'Edit Player';
  const submitEl = document.getElementById('reg-submit-btn');
  if (submitEl) submitEl.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save changes';
  const usernameEl = document.getElementById('reg-username');
  if (usernameEl) usernameEl.value = profileDisplayName(profile);
  const ageEl = document.getElementById('reg-age-select');
  if (ageEl) ageEl.value = profile.age_range;
  const leaderEl = document.getElementById('reg-leaderboard-check');
  if (leaderEl) leaderEl.checked = !!profile.leaderboard_opt_in;
  // Consent is already on file — hide the consent/age-gate sections in edit mode
  const consentSection = document.getElementById('reg-consent-section');
  if (consentSection) consentSection.hidden = true;
  const parentEl = document.getElementById('reg-parent-check');
  if (parentEl) parentEl.checked = true; // gates already passed at registration
  const ageConfirmEl = document.getElementById('reg-age-confirm-check');
  if (ageConfirmEl) ageConfirmEl.checked = true;
  modal.removeAttribute('hidden');
  _renderRegIcons();
  _updateRegParent();
  _updateRegSubmit();
  usernameEl?.focus();
}

function closeProfileRegistration() {
  document.getElementById('profile-reg-modal')?.setAttribute('hidden', '');
  _regIcon = null;
}

function _renderRegIcons() {
  const grid = document.getElementById('reg-icon-grid');
  if (!grid) return;
  const selected = _regIcon;
  grid.innerHTML = FACE_ICONS.map(ic =>
    `<button class="reg-icon-btn${ic === selected ? ' selected' : ''}"
      title="${ic.replace('fa-face-','').replace(/-/g,' ')}"
      onclick="regSelectIcon('${ic}')">
      <i class="fa-solid ${ic}"></i>
    </button>`
  ).join('');
}

function regSelectIcon(ic) {
  _regIcon = ic;
  _renderRegIcons();
  _updateRegSubmit();
}

function _updateRegParent() {
  const age = document.getElementById('reg-age-select')?.value;
  const parentRow  = document.getElementById('reg-parent-row');
  const confirmRow = document.getElementById('reg-age-confirm-row');
  if (parentRow)  parentRow.hidden  = age !== 'Under 13';
  if (confirmRow) confirmRow.hidden = age !== 'Prefer not to say';
  _updateRegSubmit();
}

function _updateRegSubmit() {
  const btn = document.getElementById('reg-submit-btn');
  if (!btn) return;
  const username = document.getElementById('reg-username')?.value.trim();
  const age      = document.getElementById('reg-age-select')?.value;
  const consent  = document.getElementById('reg-consent-check')?.checked;
  const parentOk  = age !== 'Under 13'         || document.getElementById('reg-parent-check')?.checked;
  const confirmOk = age !== 'Prefer not to say' || document.getElementById('reg-age-confirm-check')?.checked;
  const consentOk = _editingId ? true : consent;
  btn.disabled = !(_regIcon && username && age && consentOk && parentOk && confirmOk);
}

function _regUsernameError(msg) {
  const el = document.getElementById('reg-username-error');
  if (el) el.textContent = msg;
}

function submitRegistration() {
  const username    = document.getElementById('reg-username')?.value.trim();
  const age         = document.getElementById('reg-age-select')?.value;
  const leaderboard = document.getElementById('reg-leaderboard-check')?.checked ?? false;

  if (!_regIcon || !username || !age) return;

  const profiles = loadProfiles();
  const duplicate = profiles.find(p => (p.username || '').toLowerCase() === username.toLowerCase() && p.id !== _editingId);
  if (duplicate) {
    _regUsernameError('That name is already taken. Choose another.');
    document.getElementById('reg-username')?.focus();
    return;
  }
  _regUsernameError('');

  if (_editingId) {
    // Edit existing profile — preserve consent_ts and id
    const idx = profiles.findIndex(p => p.id === _editingId);
    if (idx !== -1) {
      profiles[idx] = { ...profiles[idx], username, icon: _regIcon, age_range: age, leaderboard_opt_in: leaderboard };
      saveProfiles(profiles);
      markSessionProfileName(profiles[idx]);
      _serverRegisterProfile(profiles[idx]);
    }
  } else {
    const consent = document.getElementById('reg-consent-check')?.checked;
    if (!consent) return;
    const id = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : Date.now().toString(36) + Math.random().toString(36).slice(2);
    const newProfile = { id, username, icon: _regIcon, age_range: age, consent_ts: Date.now(), leaderboard_opt_in: leaderboard };
    profiles.push(newProfile);
    saveProfiles(profiles);
    markSessionProfileName(newProfile);
    markSessionConsented(id);
    _serverRegisterProfile(newProfile);
  }

  closeProfileRegistration();
  renderProfiles();
  if (typeof renderLobbySlots === 'function') renderLobbySlots();
  if (typeof renderBotsPage === 'function') renderBotsPage();
}

// ── Re-consent modal ──────────────────────────────────────────────────────────

let _reconsentId       = null;
let _reconsentCallback = null;

function openReconsent(profileId, callback) {
  const profile = getProfileById(profileId);
  if (!profile) return;
  _reconsentId       = profileId;
  _reconsentCallback = callback || null;

  const modal = document.getElementById('profile-reconsent-modal');
  if (!modal) return;

  const nameEl = modal.querySelector('.reconsent-name');
  if (nameEl) nameEl.innerHTML =
    `<i class="fa-solid ${escapeAttr(profile.icon)}"></i> ${escapeAttr(profileDisplayName(profile))}`;

  const checkEl = document.getElementById('reconsent-check');
  if (checkEl) checkEl.checked = false;
  const btn = document.getElementById('reconsent-submit');
  if (btn) btn.disabled = true;

  modal.removeAttribute('hidden');
}

function closeReconsent() {
  document.getElementById('profile-reconsent-modal')?.setAttribute('hidden', '');
  _reconsentId       = null;
  _reconsentCallback = null;
}

function submitReconsent() {
  if (!document.getElementById('reconsent-check')?.checked) return;
  if (!_reconsentId) { closeReconsent(); return; }
  markSessionConsented(_reconsentId);
  const _rp = getProfileById(_reconsentId);
  if (_rp) {
    _rp.consent_ts = Date.now();
    saveProfiles(loadProfiles().map(p => p.id === _rp.id ? _rp : p));
    markSessionProfileName(_rp);
    _serverRegisterProfile(_rp);
  }
  const cb = _reconsentCallback;
  const id = _reconsentId;
  closeReconsent();
  renderProfiles();
  if (typeof renderLobbySlots === 'function') renderLobbySlots();
  if (typeof renderBotsPage === 'function') renderBotsPage();
  if (cb) cb(id);
}

// ── Lobby helpers ─────────────────────────────────────────────────────────────

function lobbyProfileSelect(slotIdx, playerIdx) {
  cleanStaleProfileIds();
  const allProfiles = loadProfiles();
  const currentId   = settings.profile_ids?.[playerIdx];
  const usedIds     = new Set(
    Object.entries(settings.profile_ids || {})
      .filter(([k]) => Number(k) !== playerIdx)
      .map(([, v]) => v)
  );
  // Only show players who have consented this session
  const profiles = allProfiles.filter(p => isSessionConsented(p.id) || p.id === currentId);
  const options = [
    `<option value="">— pick player —</option>`,
    ...profiles.map(p => {
      const inUse = usedIds.has(p.id) && p.id !== currentId;
      return `<option value="${p.id}"${p.id === currentId ? ' selected' : ''}${inUse ? ' disabled' : ''}>${escapeAttr(profileDisplayName(p))}${inUse ? ' (in use)' : ''}</option>`;
    })
  ].join('');

  return `<select class="lobby-bot-select lobby-profile-select"
    onchange="lobbyPickProfile(${slotIdx}, this.value)"
    onclick="event.stopPropagation()">
    ${options}
  </select>`;
}

function lobbyPickProfile(slotIdx, profileId) {
  const playerIdx = lobbyActiveSlots().indexOf(slotIdx);
  if (playerIdx === -1) return;
  if (!profileId) { setSlotProfile(playerIdx, null); renderLobbySlots(); return; }
  if (isSessionConsented(profileId)) {
    setSlotProfile(playerIdx, profileId);
    renderLobbySlots();
  } else {
    openReconsent(profileId, id => { setSlotProfile(playerIdx, id); renderLobbySlots(); });
  }
}

// ── Server registration ───────────────────────────────────────────────────────

function _serverRegisterProfile(profile) {
  fetch('/api/players/register', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      id: profile.id,
      icon: profile.icon,
      age_range: profile.age_range,
      consent_ts: profile.consent_ts,
      leaderboard_opt_in: profile.leaderboard_opt_in
    })
  }).catch(() => {}); // best-effort; local data is source of truth
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function initProfilesPanel() {
  await hydrateServerProfiles();
  cleanStaleProfileIds();
  const regText      = document.getElementById('reg-consent-text');
  if (regText) regText.innerHTML = CONSENT_TEXT;
  const reconsentText = document.getElementById('reconsent-consent-text');
  if (reconsentText) reconsentText.innerHTML = CONSENT_TEXT;
  renderProfiles();
  if (typeof renderBotsPage === 'function') renderBotsPage();
}
