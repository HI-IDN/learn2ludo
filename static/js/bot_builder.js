const STUDENT_BOT_ID = 'student-weighted';

const STUDENT_BOT_WEIGHT_DEFS = [
  {
    key: 'ares_capture',
    label: 'Ares',
    rule: 'Capture',
    description: 'Prefer moves that send an opponent pawn back to the yard.',
    defaultValue: 0.30,
  },
  {
    key: 'athena_safety',
    label: 'Athena',
    rule: 'Safety',
    description: 'Prefer moves that reduce danger or land in protected places.',
    defaultValue: 0.35,
  },
  {
    key: 'hestia_progress',
    label: 'Hestia',
    rule: 'Progress',
    description: 'Prefer moves that bring pawns closer to home.',
    defaultValue: 0.25,
  },
  {
    key: 'hermes_spread',
    label: 'Hermes',
    rule: 'Spread',
    description: 'Prefer moves that keep friendly pawns less clustered.',
    defaultValue: 0.00,
  },
  {
    key: 'hephaestus_blockade',
    label: 'Hephaestus',
    rule: 'Blockade',
    description: 'Prefer moves that land on friendly pawns.',
    defaultValue: 0.00,
  },
  {
    key: 'artemis_activation',
    label: 'Artemis',
    rule: 'Activation',
    description: 'Prefer moves that bring new pawns out of the yard.',
    defaultValue: 0.10,
  },
];

function defaultStudentBotWeights() {
  return Object.fromEntries(STUDENT_BOT_WEIGHT_DEFS.map(def => [def.key, def.defaultValue]));
}

function getStudentBotWeights() {
  const saved = settings?.student_bot_weights || {};
  return {
    ...defaultStudentBotWeights(),
    ...Object.fromEntries(Object.entries(saved).map(([key, value]) => [key, Number(value) || 0])),
  };
}

function studentBotIsAvailable() {
  return settings?.student_bot_deleted !== true;
}

function renderBotBuilderCard() {
  if (!studentBotIsAvailable()) {
    return `
      <div class="bot-card bot-builder-card bot-builder-card--empty">
        <div class="bot-card-icon"><i class="fa-solid fa-sliders"></i></div>
        <div class="bot-card-body">
          <div class="bot-card-title">
            <div class="bot-card-name">Your Bot</div>
            <span class="bot-card-status">Deleted</span>
          </div>
          <div class="bot-card-desc">Start a new slider draft when you are ready to build another CDR.</div>
          <div class="bot-builder-actions">
            <button class="btn btn-sm btn-primary" type="button" onclick="botBuilderCreate()">
              <i class="fa-solid fa-plus"></i>
              New
            </button>
          </div>
        </div>
      </div>`;
  }

  const weights = getStudentBotWeights();
  const rows = STUDENT_BOT_WEIGHT_DEFS.map(def => {
    const value = weights[def.key] ?? 0;
    return `
      <label class="bot-builder-row" title="${def.description}">
        <span class="bot-builder-label">
          <span class="bot-builder-rule">${def.rule}</span>
          <span class="bot-builder-source">${def.label}</span>
        </span>
        <input
          class="bot-builder-slider"
          type="range"
          min="-2"
          max="2"
          step="0.1"
          value="${value.toFixed(1)}"
          oninput="botBuilderSetWeight('${def.key}', this.value)"
        >
        <output class="bot-builder-value" id="bot-builder-value-${def.key}">${formatBotWeight(value)}</output>
      </label>`;
  }).join('');

  return `
    <div class="bot-card bot-builder-card">
      <div class="bot-card-icon"><i class="fa-solid fa-sliders"></i></div>
      <div class="bot-card-body">
        <div class="bot-card-title">
          <div class="bot-card-name">Your Bot</div>
          <span class="bot-card-status">Custom</span>
        </div>
        <div class="bot-card-desc">Student CDR — combine Apollo-style dispatching rules with sliders.</div>
        <div class="bot-builder-summary" id="bot-builder-summary">${studentBotSummary(weights)}</div>
        <div class="bot-builder-controls">${rows}</div>
        <div class="bot-builder-actions">
          <button class="btn btn-sm btn-danger" type="button" onclick="botBuilderDelete()">
            <i class="fa-solid fa-trash"></i>
            Delete
          </button>
          <button class="btn btn-sm" type="button" onclick="botBuilderReset()">
            <i class="fa-solid fa-rotate-left"></i>
            Reset
          </button>
        </div>
      </div>
    </div>`;
}

function botBuilderSetWeight(key, rawValue) {
  settings.student_bot_deleted = false;
  settings.student_bot_weights = getStudentBotWeights();
  settings.student_bot_weights[key] = Number(rawValue) || 0;
  persistSettings();
  botBuilderRefreshValues();
}

function botBuilderReset() {
  settings.student_bot_deleted = false;
  settings.student_bot_weights = defaultStudentBotWeights();
  persistSettings();
  renderBotsPage();
}

function botBuilderDelete() {
  settings.student_bot_deleted = true;
  delete settings.student_bot_weights;
  if (settings.bot_ids) {
    Object.keys(settings.bot_ids).forEach(playerIdx => {
      if (settings.bot_ids[playerIdx] === STUDENT_BOT_ID) delete settings.bot_ids[playerIdx];
    });
  }
  persistSettings();
  renderBotsPage();
  if (typeof renderLobbySlots === 'function') renderLobbySlots();
}

function botBuilderCreate() {
  settings.student_bot_deleted = false;
  settings.student_bot_weights = defaultStudentBotWeights();
  persistSettings();
  renderBotsPage();
  if (typeof renderLobbySlots === 'function') renderLobbySlots();
}

function botBuilderRefreshValues() {
  const weights = getStudentBotWeights();
  STUDENT_BOT_WEIGHT_DEFS.forEach(def => {
    const value = weights[def.key] ?? 0;
    const out = document.getElementById(`bot-builder-value-${def.key}`);
    if (out) out.textContent = formatBotWeight(value);
  });
  const summary = document.getElementById('bot-builder-summary');
  if (summary) summary.textContent = studentBotSummary(weights);
}

function formatBotWeight(value) {
  return Number(value || 0).toFixed(1);
}

function studentBotSummary(weights = getStudentBotWeights()) {
  const active = STUDENT_BOT_WEIGHT_DEFS
    .filter(def => Math.abs(weights[def.key] || 0) > 0.001)
    .sort((a, b) => Math.abs(weights[b.key]) - Math.abs(weights[a.key]))
    .slice(0, 3)
    .map(def => `${def.rule} ${formatBotWeight(weights[def.key])}`);

  return active.length ? active.join(' · ') : 'All weights are zero: tied moves fall back to random choice.';
}
