const USER_BOT_WEIGHT_DEFS = [
  {
    key: 'capture',
    label: 'Ares',
    rule: 'Capture',
    description: 'Prefer moves that send an opponent pawn back to the yard.',
    defaultValue: 0,
  },
  {
    key: 'safety',
    label: 'Athena',
    rule: 'Safety',
    description: 'Prefer moves that reduce danger or land in protected places.',
    defaultValue: 0,
  },
  {
    key: 'progress',
    label: 'Hestia',
    rule: 'Progress',
    description: 'Prefer moves that bring pawns closer to home.',
    defaultValue: 0,
  },
  {
    key: 'spread',
    label: 'Hermes',
    rule: 'Spread',
    description: 'Prefer moves that keep friendly pawns less clustered.',
    defaultValue: 0,
  },
  {
    key: 'blockade',
    label: 'Hephaestus',
    rule: 'Blockade',
    description: 'Prefer moves that land on friendly pawns.',
    defaultValue: 0,
  },
  {
    key: 'activation',
    label: 'Artemis',
    rule: 'Activation',
    description: 'Prefer moves that bring new pawns out of the yard.',
    defaultValue: 0,
  },
];

const BOT_PROFILE_STRONG_GAP = 0.10;

function defaultUserBotWeights() {
  return Object.fromEntries(USER_BOT_WEIGHT_DEFS.map(def => [def.key, def.defaultValue]));
}

function getUserBotWeights() {
  const saved = settings?.user_bot_weights || {};
  return {
    ...defaultUserBotWeights(),
    ...Object.fromEntries(Object.entries(saved).map(([key, value]) => [key, Number(value) || 0])),
  };
}

function renderBotBuilderCard() {
  const weights = getUserBotWeights();
  const draft = getUserBotDraft();
  const rows = USER_BOT_WEIGHT_DEFS.map(def => {
    const value = weights[def.key] ?? 0;
    return `
      <label class="bot-builder-row" title="${def.description}">
        <span class="bot-builder-label">
          <span class="bot-builder-rule">${def.rule}</span>
          <span class="bot-builder-source">${def.label}</span>
        </span>
        <input
          class="bot-builder-slider"
          id="bot-builder-slider-${def.key}"
          type="range"
          min="-1"
          max="1"
          step="0.05"
          value="${value.toFixed(2)}"
          oninput="botBuilderSetWeight('${def.key}', this.value)"
        >
        <input
          class="bot-builder-number"
          id="bot-builder-number-${def.key}"
          type="number"
          min="-1"
          max="1"
          step="0.05"
          value="${value.toFixed(2)}"
          oninput="botBuilderSetWeight('${def.key}', this.value)"
          onblur="botBuilderRefreshValues()"
        >
      </label>`;
  }).join('');

  const saveValid = botBuilderDraftValid(draft);

  const collapsed = settings.bot_builder_collapsed ?? false;

  return `
    <div class="bot-card bot-builder-card${collapsed ? ' bot-builder-card--collapsed' : ''}">
      <div class="bot-card-icon"><i class="fa-solid fa-sliders"></i></div>
      <div class="bot-card-body">
        <div class="bot-builder-header">
          <div>
            <div class="bot-card-name">Build-a-bot</div>
            <div class="bot-card-desc">User-defined composite dispatching rule</div>
          </div>
          <button class="bot-builder-toggle" type="button" onclick="botBuilderToggleCollapse()" title="${collapsed ? 'Expand' : 'Collapse'}">
            <i class="fa-solid fa-chevron-${collapsed ? 'down' : 'up'}"></i>
          </button>
        </div>
        <div class="bot-builder-layout">
          <div class="bot-builder-main">
            <div class="bot-builder-help">
              Each weight must be between -1.00 and +1.00. Weights do not need to add up. Positive values prefer a rule, negative values avoid it, and zero ignores it. If every weight is zero, every legal move ties and the bot chooses randomly like Eris.
            </div>
            <div class="bot-builder-controls">${rows}</div>
            <div class="bot-builder-actions">
              <span class="bot-builder-save-status" id="bot-builder-save-status"></span>
              <button class="btn btn-sm" type="button" onclick="botBuilderReset()">
                <i class="fa-solid fa-rotate-left"></i>
                Reset
              </button>
            </div>
          </div>
          <div class="bot-builder-draft">
            <label class="bot-builder-field bot-builder-field--name">
              <span>Name</span>
              <input
              type="text"
              maxlength="10"
              placeholder="Build-a-bot"
              value="${escapeBotText(draft.name)}"
              oninput="botBuilderSetDraftName(this.value)"
            >
            </label>
            <label class="bot-builder-field bot-builder-field--tldr">
              <span>TLDR</span>
              <input
              type="text"
              maxlength="25"
              placeholder="User-defined composite rule"
              value="${escapeBotText(draft.tldr)}"
              oninput="botBuilderSetDraftTldr(this.value)"
            >
            </label>
            <label class="bot-builder-field bot-builder-field--description">
              <span>Description</span>
              <textarea
              maxlength="360"
              placeholder="Describe the kind of bot you hope to create."
              rows="4"
              oninput="botBuilderSetDraftDescription(this.value)"
            >${escapeBotText(draft.description)}</textarea>
            </label>
            <label class="bot-builder-field bot-builder-field--designer">
              <span>Designer</span>
              <input
              type="text"
              maxlength="100"
              placeholder="Who designed this bot?"
              value="${escapeBotText(draft.designer)}"
              oninput="botBuilderSetDraftDesigner(this.value)"
            >
            </label>
            <div class="bot-builder-draft-actions">
              ${saveValid ? '' : `<em class="bot-builder-hint" id="bot-builder-hint">${botBuilderSaveTooltip()}</em>`}
              <button
                class="btn btn-sm btn-primary"
                id="bot-builder-save-btn"
                type="button"
                onclick="botBuilderSave()"
                ${saveValid ? '' : 'disabled'}
              >
                <i class="fa-solid fa-floppy-disk"></i>
                Save Bot
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>`;
}

function botBuilderSetWeight(key, rawValue) {
  settings.user_bot_weights = getUserBotWeights();
  settings.user_bot_weights[key] = normalizeBotWeight(rawValue);
  persistSettings();
  botBuilderRefreshValues();
  botBuilderRefreshSaveBtn();
}

function getUserBotDraft() {
  settings.user_bot_draft = settings.user_bot_draft || {};
  return {
    name: settings.user_bot_draft.name || '',
    tldr: settings.user_bot_draft.tldr || '',
    description: settings.user_bot_draft.description || '',
    designer: settings.user_bot_draft.designer || '',
  };
}

function botBuilderSetDraftDesigner(value) {
  settings.user_bot_draft = settings.user_bot_draft || {};
  settings.user_bot_draft.designer = String(value || '').slice(0, 100);
  persistSettings();
}

function _botBuilderWeightIssue() {
  const weights = getUserBotWeights();
  const nonzero = USER_BOT_WEIGHT_DEFS.filter(d => Math.abs(weights[d.key] || 0) > 0.001);
  if (nonzero.length === 0) return 'Set at least one weight — all-zero is just Eris';
  if (nonzero.length === 1 && (weights[nonzero[0].key] || 0) > 0)
    return 'A single positive weight duplicates an existing bot — add a second or use a negative weight';
  return null;
}

function botBuilderDraftValid(draft) {
  draft = draft || getUserBotDraft();
  if (!draft.name.trim() || !draft.tldr.trim() || !draft.description.trim()) return false;
  return _botBuilderWeightIssue() === null;
}

function botBuilderSaveTooltip() {
  const draft = getUserBotDraft();
  if (!draft.name.trim() || !draft.tldr.trim() || !draft.description.trim())
    return 'Fill in Name, TLDR, and Description to save';
  return _botBuilderWeightIssue() ?? 'Save this bot configuration';
}

function botBuilderSetDraftName(value) {
  settings.user_bot_draft = settings.user_bot_draft || {};
  settings.user_bot_draft.name = String(value || '').slice(0, 10);
  persistSettings();
  botBuilderRefreshDraft();
  botBuilderRefreshSaveBtn();
}

function botBuilderSetDraftTldr(value) {
  settings.user_bot_draft = settings.user_bot_draft || {};
  settings.user_bot_draft.tldr = String(value || '').slice(0, 25);
  persistSettings();
  botBuilderRefreshDraft();
  botBuilderRefreshSaveBtn();
}

function botBuilderSetDraftDescription(value) {
  settings.user_bot_draft = settings.user_bot_draft || {};
  settings.user_bot_draft.description = String(value || '').slice(0, 360);
  persistSettings();
  botBuilderRefreshSaveBtn();
}

function botBuilderRefreshSaveBtn() {
  const btn = document.getElementById('bot-builder-save-btn');
  if (!btn) return;
  const valid = botBuilderDraftValid();
  btn.disabled = !valid;
  const hint = document.getElementById('bot-builder-hint');
  if (valid) {
    if (hint) hint.remove();
  } else {
    if (hint) hint.textContent = botBuilderSaveTooltip();
    else {
      const actions = btn.parentElement;
      const em = document.createElement('em');
      em.id = 'bot-builder-hint';
      em.className = 'bot-builder-hint';
      em.textContent = botBuilderSaveTooltip();
      actions.insertBefore(em, btn);
    }
  }
}

async function botBuilderSave() {
  const draft = getUserBotDraft();
  if (!botBuilderDraftValid(draft)) return;
  const bot = buildSavedUserBot();
  try {
    const r = await fetch('/api/bots/custom', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bot),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      botBuilderSetSaveStatus(`Error: ${err.detail || r.status}`);
      return;
    }
  } catch {
    botBuilderSetSaveStatus('Save failed — server unreachable');
    return;
  }
  settings.user_bot_draft = { name: '', tldr: '', description: '', designer: '' };
  settings.user_bot_weights = defaultUserBotWeights();
  persistSettings();
  await loadBotRegistry();
  renderBotsPage();
}

function botBuilderToggleCollapse() {
  settings.bot_builder_collapsed = !(settings.bot_builder_collapsed ?? false);
  persistSettings();
  renderBotsPage();
}

function botBuilderReset() {
  settings.user_bot_weights = defaultUserBotWeights();
  settings.user_bot_draft = { name: '', tldr: '', description: '', designer: '' };
  persistSettings();
  renderBotsPage();
}

function botBuilderRefreshValues() {
  const weights = getUserBotWeights();
  USER_BOT_WEIGHT_DEFS.forEach(def => {
    const value = weights[def.key] ?? 0;
    const slider = document.getElementById(`bot-builder-slider-${def.key}`);
    const number = document.getElementById(`bot-builder-number-${def.key}`);
    if (slider) slider.value = value.toFixed(2);
    if (number) number.value = value.toFixed(2);
  });
}

function botBuilderRefreshDraft() {
  const draft = getUserBotDraft();
  const name = document.getElementById('bot-builder-draft-name');
  const desc = document.getElementById('bot-builder-draft-desc');
  if (name) name.textContent = draft.name || 'Build-a-bot';
  if (desc) desc.textContent = botBuilderDraftDescriptionText(draft);
}

function botBuilderDraftDescriptionText(draft) {
  return draft.tldr || 'User-defined composite dispatching rule';
}

function buildSavedUserBot() {
  const draft = getUserBotDraft();
  const allWeights = getUserBotWeights();
  const weights = Object.fromEntries(
    Object.entries(allWeights).filter(([, v]) => Math.abs(v) > 0.001)
  );
  return {
    id: uniqueUserBotId(),
    name: draft.name.trim(),
    type: 'CDR',
    tldr: draft.tldr.trim(),
    description: draft.description.trim(),
    designer: draft.designer.trim(),
    weights,
    created_at: new Date().toISOString(),
  };
}

function uniqueUserBotId() {
  const existing = new Set((settings.saved_user_bots || []).map(bot => bot.id));
  let id = '';
  do {
    id = `bot-${randomBotIdSuffix()}`;
  } while (existing.has(id));
  return id;
}

function randomBotIdSuffix() {
  const bytes = new Uint8Array(4);
  if (window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(bytes);
    return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
  }
  return `${Date.now().toString(36)}-${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')}`;
}

function botBuilderSetSaveStatus(text) {
  const status = document.getElementById('bot-builder-save-status');
  if (!status) return;
  status.textContent = text;
}

function formatBotWeight(value) {
  const numeric = Number(value || 0);
  return `${numeric >= 0 ? '+' : ''}${numeric.toFixed(2)}`;
}

function normalizeBotWeight(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(-1, Math.min(1, numeric));
}

function botProfileText(weights = getUserBotWeights()) {
  const active = USER_BOT_WEIGHT_DEFS
    .filter(def => Math.abs(weights[def.key] || 0) > 0.001)
    .map(def => ({ ...def, weight: weights[def.key] || 0 }))
    .sort((a, b) => b.weight - a.weight);

  if (!active.length) return 'Profile: all legal moves tie; random choice like Eris.';

  const groups = [];
  active.forEach(item => {
    const last = groups[groups.length - 1];
    if (last && Math.abs(last[0].weight - item.weight) < 0.001) {
      last.push(item);
    } else {
      groups.push([item]);
    }
  });

  const parts = groups.map(group => group
    .map(item => `${formatBotWeight(item.weight)} ${item.rule}`)
    .join(' ≡ '));

  return `Profile: ${parts.reduce((text, part, index) => {
    if (index === 0) return part;
    const prev = groups[index - 1][0].weight;
    const next = groups[index][0].weight;
    const separator = prev - next >= BOT_PROFILE_STRONG_GAP ? ' ≫ ' : ' ≥ ';
    return `${text}${separator}${part}`;
  }, '')}`;
}

function escapeBotText(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
