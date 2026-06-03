const USER_BOT_WEIGHT_DEFS = [
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
    defaultValue: 0,
  },
  {
    key: 'hephaestus_blockade',
    label: 'Hephaestus',
    rule: 'Blockade',
    description: 'Prefer moves that land on friendly pawns.',
    defaultValue: 0,
  },
  {
    key: 'artemis_activation',
    label: 'Artemis',
    rule: 'Activation',
    description: 'Prefer moves that bring new pawns out of the yard.',
    defaultValue: 0.10,
  },
];

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
          type="range"
          min="-1"
          max="1"
          step="0.05"
          value="${value.toFixed(2)}"
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
        <div class="bot-card-desc">User CDR — Apollo's weight values, ready to adjust.</div>
        <div class="bot-builder-help">
          Weights do not need to add up. Positive values prefer a rule, negative values avoid it, and zero ignores it. If every weight is zero, every legal move ties and the bot chooses randomly like Eris.
        </div>
        <div class="bot-builder-summary" id="bot-builder-summary">${userBotSummary(weights)}</div>
        <div class="bot-builder-controls">${rows}</div>
        <div class="bot-builder-actions">
          <button class="btn btn-sm" type="button" onclick="botBuilderReset()">
            <i class="fa-solid fa-rotate-left"></i>
            Reset
          </button>
        </div>
      </div>
    </div>`;
}

function botBuilderSetWeight(key, rawValue) {
  settings.user_bot_weights = getUserBotWeights();
  settings.user_bot_weights[key] = Number(rawValue) || 0;
  persistSettings();
  botBuilderRefreshValues();
}

function botBuilderReset() {
  settings.user_bot_weights = defaultUserBotWeights();
  persistSettings();
  renderBotsPage();
}

function botBuilderRefreshValues() {
  const weights = getUserBotWeights();
  USER_BOT_WEIGHT_DEFS.forEach(def => {
    const value = weights[def.key] ?? 0;
    const out = document.getElementById(`bot-builder-value-${def.key}`);
    if (out) out.textContent = formatBotWeight(value);
  });
  const summary = document.getElementById('bot-builder-summary');
  if (summary) summary.textContent = userBotSummary(weights);
}

function formatBotWeight(value) {
  const numeric = Number(value || 0);
  return `${numeric >= 0 ? '+' : ''}${numeric.toFixed(2)}`;
}

function userBotSummary(weights = getUserBotWeights()) {
  const active = USER_BOT_WEIGHT_DEFS
    .filter(def => Math.abs(weights[def.key] || 0) > 0.001)
    .sort((a, b) => Math.abs(weights[b.key]) - Math.abs(weights[a.key]))
    .slice(0, 3)
    .map(def => `${formatBotWeight(weights[def.key])} ${def.label} ${def.rule}`);

  return active.length ? active.join(' · ') : 'All weights are zero: tied moves fall back to random choice.';
}
