// Bot system — auto-play loop + server-side policy dispatch.
//
// All bots (heuristic and future RL) run through POST /api/game/bot-move.
// JS policies are offline fallbacks only — do not add game logic here.

const FALLBACK_BOTS = [
  { id: 'eris', name: 'Eris', type: 'baseline', epithet: 'Goddess of Discord', description: 'Chooses from valid moves without using strategy.', focus: 'Useful as a baseline for comparing whether another strategy is actually helping.', status: 'Available', selectable: true, implemented: true },
  { id: 'ares', name: 'Ares', type: 'heuristic', epithet: 'God of War', description: 'Looks for chances to send opponent pawns back to their yard.', focus: 'Values disruption: a capture can slow one opponent more than a small advance helps Ares.', status: 'Available', selectable: true, implemented: true },
  { id: 'athena', name: 'Athena', type: 'heuristic', epithet: 'Goddess of Wisdom', description: 'Keeps pawns safe before looking for other moves.', focus: 'Compares current danger with landing-square danger, preferring moves that reduce exposure.', status: 'Available', selectable: true, implemented: true },
  { id: 'hestia', name: 'Hestia', type: 'heuristic', epithet: 'Goddess of the Hearth', description: 'Brings pawns home as directly as possible.', focus: 'Prefers the most progressed pawn, especially when a move brings it nearer to the home stretch.', status: 'Available', selectable: true, implemented: true },
  { id: 'apollo', name: 'Apollo', type: 'weighted', epithet: 'God of Order', description: 'Balanced weighted bot combining capture, safety, progress, and activation.', focus: 'Profile: +0.35 Safety ≥ +0.30 Capture ≥ +0.25 Progress ≫ +0.10 Activation.', status: 'Available', selectable: true, implemented: true },
  { id: 'user-weighted', name: 'Build-a-bot', type: 'weighted', epithet: 'User CDR', description: 'Custom weighted bot configured with sliders.', focus: 'Template: Weighted CDR.', status: 'Custom', selectable: true, implemented: true },
  { id: 'hermes', name: 'Hermes', type: 'heuristic', epithet: 'God of Travel', description: 'Keeps pawns distributed across the board.', focus: 'Avoids clustering by choosing moves that increase distance from friendly pawns already in play.', status: 'Available', selectable: true, implemented: true },
  { id: 'hephaestus', name: 'Hephaestus', type: 'heuristic', epithet: 'God of the Forge', description: 'Builds defensive stacks with friendly pawns.', focus: 'Looks for moves that land on another friendly pawn to form a blockade.', status: 'Available', selectable: true, implemented: true },
  { id: 'artemis', name: 'Artemis', type: 'heuristic', epithet: 'Goddess of the Hunt', description: 'Gets pawns out of the yard whenever possible.', focus: 'Prioritises activating new pawns so more pieces can join the chase.', status: 'Available', selectable: true, implemented: true },
];

let BOT_REGISTRY = FALLBACK_BOTS;
const BOT_TYPE_ORDER = ['baseline', 'heuristic', 'weighted-template', 'weighted', 'trained'];

async function loadBotRegistry() {
  try {
    const r = await fetch('/api/bots');
    const d = await r.json();
    if (Array.isArray(d.bots) && d.bots.length) BOT_REGISTRY = d.bots;
  } catch { /* keep fallback */ }
}

function botTypeOrder(bot) {
  const idx = BOT_TYPE_ORDER.indexOf(bot?.type || 'heuristic');
  return idx === -1 ? BOT_TYPE_ORDER.length : idx;
}

function getOrderedBotRegistry() {
  return BOT_REGISTRY
    .map((bot, index) => ({ bot, index }))
    .sort((a, b) => botTypeOrder(a.bot) - botTypeOrder(b.bot) || a.index - b.index)
    .map(item => item.bot);
}

function getBotRegistry() { return BOT_REGISTRY; }
function getSelectableBots() {
  return getOrderedBotRegistry().filter(b =>
    b.selectable !== false &&
    b.implemented !== false
  );
}

function botEpithet(bot) {
  return bot?.epithet || '';
}

function botLobbyLabel(bot) {
  const epithet = botEpithet(bot);
  return epithet ? `${bot.name} (${epithet})` : bot.name;
}

// ---- Server-side policy (primary) ------------------------------------------

async function runBotPolicy(botId, validMoves) {
  const weights = botId === 'user-weighted' && typeof getUserBotWeights === 'function'
    ? getUserBotWeights()
    : {};
  try {
    const r = await fetch('/api/game/bot-move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bot_id: botId, valid_moves: validMoves, game_state: gameState ?? {}, weights }),
    });
    if (r.ok) return await r.json();
  } catch { /* fall through to JS fallback */ }
  return runBotPolicyLocal(botId, validMoves);
}

// ---- JS fallback policies (offline / demo mode) ----------------------------

function runBotPolicyLocal(botId, validMoves) {
  if (!validMoves?.length) return null;
  if (botId === 'ares') return _aresLocal(validMoves);
  if (botId === 'athena') return _chooseByLocalFeature(validMoves, f => [f.riskReduction, f.safety, -f.risk]);
  if (botId === 'hestia') return _chooseByLocalFeature(validMoves, f => f.progress);
  if (botId === 'apollo') return _chooseByLocalFeature(validMoves, _apolloLocalScore);
  if (botId === 'user-weighted') return _chooseByLocalFeature(validMoves, _userWeightedLocalScore);
  if (botId === 'hermes') return _chooseByLocalFeature(validMoves, f => f.spread);
  if (botId === 'hephaestus') return _chooseByLocalFeature(validMoves, f => f.blockade);
  if (botId === 'artemis') return _chooseByLocalFeature(validMoves, f => f.activation);
  return _erisLocal(validMoves);
}

function _apolloLocalScore(f) {
  const athenaScore = (f.riskReduction * 0.45) + (f.safety * 0.35) + ((1 - f.risk) * 0.20);
  return (f.capture * 0.30) + (athenaScore * 0.35) + (f.progress * 0.25) + (f.activation * 0.10);
}

function _userWeightedLocalScore(f) {
  const weights = typeof getUserBotWeights === 'function' ? getUserBotWeights() : {};
  const athenaScore = (f.riskReduction * 0.45) + (f.safety * 0.35) + ((1 - f.risk) * 0.20);
  return (
    (f.capture * (weights.ares_capture ?? 0)) +
    (athenaScore * (weights.athena_safety ?? 0)) +
    (f.progress * (weights.hestia_progress ?? 0)) +
    (f.spread * (weights.hermes_spread ?? 0)) +
    (f.blockade * (weights.hephaestus_blockade ?? 0)) +
    (f.activation * (weights.artemis_activation ?? 0))
  );
}

function _erisLocal(validMoves) {
  return validMoves[Math.floor(Math.random() * validMoves.length)];
}

function _aresLocal(validMoves) {
  const captures = validMoves.filter(m => _isCaptureLocal(m));
  return captures.length ? captures[Math.floor(Math.random() * captures.length)] : _erisLocal(validMoves);
}

function _chooseByLocalFeature(validMoves, scoreFn) {
  const scored = validMoves.map(m => [scoreFn(_localMoveFeatures(m)), m]);
  const compareScore = (a, b) => Array.isArray(a)
    ? a.reduce((result, value, i) => result || (value > b[i] ? 1 : value < b[i] ? -1 : 0), 0)
    : (a > b ? 1 : a < b ? -1 : 0);
  const best = scored.reduce((max, item) => compareScore(item[0], max[0]) > 0 ? item : max, scored[0])[0];
  const pool = scored.filter(item => compareScore(item[0], best) === 0).map(item => item[1]);
  return pool[Math.floor(Math.random() * pool.length)];
}

function _localMoveFeatures(move) {
  const targetAbs = _absoluteTargetLocal(move);
  const currentAbs = _currentAbsoluteLocal(move);
  const risk = _riskAtLocal(targetAbs, _movingPlayerLocal(move));
  const currentRisk = _riskAtLocal(currentAbs, _movingPlayerLocal(move));
  const trackSize = gameState?.config?.board?.track_size ?? 52;
  const homeLength = gameState?.config?.board?.home_length ?? 6;
  const finish = trackSize + homeLength - 2;
  return {
    capture: _isCaptureLocal(move) ? 1 : 0,
    risk,
    riskReduction: Math.max(currentRisk - risk, 0),
    progress: Math.max(0, Math.min((move.target ?? 0) / finish, 1)),
    safety: _isSafeLandingLocal(move, targetAbs) ? 1 : 0,
    blockade: _isBlockadeLocal(move, targetAbs) ? 1 : 0,
    spread: _spreadLocal(move, targetAbs),
    activation: _isActivationLocal(move) ? 1 : 0,
  };
}

function _isActivationLocal(move) {
  const piece = _movingPieceLocal(move, _movingPlayerLocal(move));
  return (piece?.position ?? -1) === -1 && move.target === 0;
}

function _isCaptureLocal(move) {
  if (!gameState) return false;
  const movingPlayer = _movingPlayerLocal(move);
  if (movingPlayer == null) return false;
  const absTarget = _absoluteTargetLocal(move);
  if (absTarget == null) return false;
  const safe   = gameState.board?.safe_havens ?? [];
  if (safe.includes?.(absTarget)) return false;
  return (gameState.players ?? []).some((p, pi) =>
    (p.index ?? pi) !== movingPlayer &&
    (p.pieces ?? []).some(pc => !pc.in_yard && !pc.finished && pc.absolute_position === absTarget)
  );
}

function _movingPlayerLocal(move) {
  const pawnsPerPlayer = gameState?.config?.board?.pawns_per_player ?? 4;
  if (typeof move.piece_idx === 'number') return Math.floor(move.piece_idx / pawnsPerPlayer);
  if (!move.pawn_id) return null;
  const pid = String(move.pawn_id).toUpperCase();
  let movingPlayer = null;
  (gameState?.players ?? []).forEach((player, idx) => {
    if (movingPlayer != null) return;
    const found = (player.pieces ?? []).some(pc => String(pc.pawn_id || '').toUpperCase() === pid);
    if (found) movingPlayer = player.index ?? idx;
  });
  return movingPlayer;
}

function _playerStartLocal(playerIdx) {
  const slot = typeof playerSlot === 'function' ? playerSlot(playerIdx, gameState?.num_players) : playerIdx;
  return gameState?.board?.starts?.[slot] ?? 0;
}

function _absoluteForPlayerLocal(playerIdx, position) {
  if (playerIdx == null) return null;
  const trackSize = gameState?.config?.board?.track_size ?? 52;
  const entry = typeof homeEntryPosition === 'function' ? homeEntryPosition() : trackSize - 1;
  if (position == null || position < 0 || position >= entry) return null;
  return (position + _playerStartLocal(playerIdx)) % trackSize;
}

function _absoluteTargetLocal(move) {
  return _absoluteForPlayerLocal(_movingPlayerLocal(move), move.target);
}

function _currentAbsoluteLocal(move) {
  const movingPlayer = _movingPlayerLocal(move);
  const piece = _movingPieceLocal(move, movingPlayer);
  return _absoluteForPlayerLocal(movingPlayer, piece?.position ?? -1);
}

function _movingPieceLocal(move, movingPlayer) {
  if (movingPlayer == null) return null;
  const pawnsPerPlayer = gameState?.config?.board?.pawns_per_player ?? 4;
  const localIdx = typeof move.piece_idx === 'number' ? move.piece_idx % pawnsPerPlayer : null;
  const pid = String(move.pawn_id || '').toUpperCase();
  const player = (gameState?.players ?? []).find((p, idx) => (p.index ?? idx) === movingPlayer);
  return (player?.pieces ?? []).find(pc =>
    (pid && String(pc.pawn_id || '').toUpperCase() === pid) ||
    (localIdx != null && pc.index === localIdx)
  ) || null;
}

function _riskAtLocal(absTarget, movingPlayer) {
  if (absTarget == null || movingPlayer == null) return 0;
  const safe = gameState?.board?.safe_havens ?? [];
  if (safe.includes?.(absTarget)) return 0;
  const trackSize = gameState?.config?.board?.track_size ?? 52;
  const entry = typeof homeEntryPosition === 'function' ? homeEntryPosition() : trackSize - 1;
  const rolls = new Set();
  (gameState?.players ?? []).forEach((player, idx) => {
    const opponent = player.index ?? idx;
    if (opponent === movingPlayer) return;
    const targetLocal = (absTarget - _playerStartLocal(opponent) + trackSize) % trackSize;
    (player.pieces ?? []).forEach(pc => {
      if (pc.in_yard || pc.finished || pc.position == null || pc.position < 0 || pc.position >= entry) return;
      const distance = targetLocal - pc.position;
      if (distance >= 1 && distance <= 6) rolls.add(distance);
    });
  });
  return rolls.size / 6;
}

function _isSafeLandingLocal(move, absTarget) {
  const trackSize = gameState?.config?.board?.track_size ?? 52;
  const entry = typeof homeEntryPosition === 'function' ? homeEntryPosition() : trackSize - 1;
  if ((move.target ?? -1) >= entry) return true;
  const safe = gameState?.board?.safe_havens ?? [];
  if (safe.includes?.(absTarget)) return true;
  return _isBlockadeLocal(move, absTarget);
}

function _isBlockadeLocal(move, absTarget) {
  const movingPlayer = _movingPlayerLocal(move);
  return (gameState?.players ?? []).some((player, idx) =>
    (player.index ?? idx) === movingPlayer &&
    (player.pieces ?? []).some(pc => !pc.in_yard && !pc.finished && pc.absolute_position === absTarget && String(pc.pawn_id || '').toUpperCase() !== String(move.pawn_id || '').toUpperCase())
  );
}

function _spreadLocal(move, absTarget) {
  const movingPlayer = _movingPlayerLocal(move);
  if (absTarget == null || movingPlayer == null) return 0;
  const trackSize = gameState?.config?.board?.track_size ?? 52;
  const pid = String(move.pawn_id || '').toUpperCase();
  const distances = [];
  (gameState?.players ?? []).forEach((player, idx) => {
    if ((player.index ?? idx) !== movingPlayer) return;
    (player.pieces ?? []).forEach(pc => {
      if (pid && String(pc.pawn_id || '').toUpperCase() === pid) return;
      if (pc.in_yard || pc.finished || pc.absolute_position == null) return;
      const raw = Math.abs(absTarget - pc.absolute_position);
      distances.push(Math.min(raw, trackSize - raw));
    });
  });
  if (!distances.length) return 1;
  return Math.min(distances.reduce((sum, d) => sum + d, 0) / distances.length / (trackSize / 2), 1);
}

// ---- Bots page -------------------------------------------------------------

function renderBotsPage() {
  const wrap = document.getElementById('bots-sections');
  if (!wrap) return;

  const ordered    = getOrderedBotRegistry();
  const baseline   = ordered.filter(b => b.type === 'baseline');
  const heuristics = ordered.filter(b => b.type === 'heuristic' || !b.type);
  const weighted   = ordered.filter(b => b.type === 'weighted-template' || b.type === 'weighted');
  const trained    = ordered.filter(b => b.type === 'trained');
  const botBuilder = typeof renderBotBuilderCard === 'function' ? renderBotBuilderCard() : '';

  wrap.innerHTML = `
    ${botSection('Baseline', 'No strategy — useful for comparison', baseline)}
    ${botSection('Heuristics', 'Rule-based opponents — no training required', heuristics)}
    ${botSection('Build-a-bot', 'Combine heuristic features with sliders to make a weighted CDR', weighted.filter(b => b.id !== 'user-weighted'), true, botBuilder)}
    ${botSection('Trained Models', 'RL agents produced by the Train tab', trained, true)}
  `;
}

function botSection(title, subtitle, bots, allowEmpty = false, extraCardHtml = '') {
  const botCards = bots.length
    ? bots.map(b => `
        <div class="bot-card${b.status && b.status !== 'Available' ? ' bot-card--planned' : ''}">
          <div class="bot-card-icon"><i class="fa-solid fa-robot"></i></div>
          <div class="bot-card-body">
            <div class="bot-card-title">
              <div class="bot-card-name">${b.name}</div>
              ${b.status && b.status !== 'Available' ? `<span class="bot-card-status">${b.status}</span>` : ''}
            </div>
            <div class="bot-card-desc">${botCardDescription(b)}</div>
            ${b.focus ? `<div class="bot-card-focus">${b.focus}</div>` : ''}
          </div>
        </div>`).join('')
    : '';
  const cards = botCards || extraCardHtml
    ? `${extraCardHtml}${botCards}`
    : allowEmpty
      ? `<div class="bot-empty">
           <i class="ti ti-brain"></i>
           <span>No trained models yet — run training to create one</span>
         </div>`
      : '';

  return `
    <div class="bots-section">
      <div class="bots-section-header">
        <div class="bots-section-title">${title}</div>
        <div class="bots-section-sub">${subtitle}</div>
      </div>
      <div class="bot-cards">${cards}</div>
    </div>`;
}

function botCardDescription(bot) {
  return [bot?.epithet, bot?.description].filter(Boolean).join(' — ');
}

// ---- Auto-play loop --------------------------------------------------------

let _botTimer = null;
let _botRunning = false;

function resetBotState() {
  clearTimeout(_botTimer);
  _botTimer = null;
  _botRunning = false;
}

function scheduleBotPlay(overrideDelay) {
  clearTimeout(_botTimer);
  if (typeof _pg !== 'undefined' && _pg) return; // pregame drives its own rolls
  const speed = settings.auto_play_speed || 'off';
  if (speed === 'off') return;
  if (!gameState || gameState.phase !== 'rolling' || gameState.winner !== null) return;
  if (getPlayerType(gameState.current_player) === 'human') return;
  if (_botRunning) return;
  const mode = speed === 'fast' ? 'fast' : 'normal';
  _botTimer = setTimeout(botTakeTurn, overrideDelay ?? _AUTO_DELAY[mode].roll);
}

async function botTakeTurn() {
  const speed = settings.auto_play_speed || 'off';
  if (speed === 'off') return;
  const mode = speed === 'fast' ? 'fast' : 'normal';
  const cp = gameState?.current_player;
  if (_botRunning) return;
  if (!gameState || gameState.phase !== 'rolling' || getPlayerType(cp) === 'human') return;
  _botRunning = true;
  try {
    await rollDice();

    if (gameState.phase === 'moving' && gameState.valid_moves?.length > 0) {
      let move = gameState.valid_moves.length === 1 ? gameState.valid_moves[0] : null;
      if (!move) {
        const botId = settings.bot_ids?.[cp] ?? 'eris';
        move = await runBotPolicy(botId, gameState.valid_moves);
      }
      if (!move && gameState.valid_moves.length === 1) move = gameState.valid_moves[0];
      if (move) {
        await new Promise(r => setTimeout(r, _AUTO_DELAY[mode].move));
        await makeMove(move.piece_idx ?? null, move.target, move.pawn_id ?? null);
      }
    }
  } finally {
    _botRunning = false;
    scheduleBotPlay();
  }
}

// When auto-play is OFF and a bot just rolled, suggest its chosen move via shake.
// The user must click the shaking pawn to execute; other valid pawns are blocked.
let _botSuggesting = false;
async function suggestBotMove() {
  if (_botSuggesting) return;
  const speed = settings.auto_play_speed || 'off';
  if (speed !== 'off') return;
  if (_botRunning) return;
  if (!gameState || gameState.phase !== 'moving' || gameState.winner !== null) return;
  if (getPlayerType(gameState.current_player) === 'human') return;
  if (window._botChosenMove) return;
  _botSuggesting = true;
  try {
    const cp = gameState.current_player;
    const botId = settings.bot_ids?.[cp] ?? 'eris';
    const move = await runBotPolicy(botId, gameState.valid_moves);
    if (move && gameState.phase === 'moving') {
      window._botChosenMove = move;
      renderGame();
    }
  } finally {
    _botSuggesting = false;
  }
}

let _botFastAdvancing = false;
async function fastAdvanceBotMove() {
  if (_botFastAdvancing) return;
  const speed = settings.auto_play_speed || 'off';
  if (speed !== 'fast') return;
  if (_botRunning) return;
  if (!gameState || gameState.phase !== 'moving' || gameState.winner !== null) return;
  const cp = gameState.current_player;
  if (getPlayerType(cp) === 'human') return;
  if (window._botChosenMove) return;
  if (!gameState.valid_moves?.length) return;

  _botFastAdvancing = true;
  try {
    let move = gameState.valid_moves.length === 1 ? gameState.valid_moves[0] : null;
    if (!move) {
      const botId = settings.bot_ids?.[cp] ?? 'eris';
      move = await runBotPolicy(botId, gameState.valid_moves);
    }
    if (!move && gameState.valid_moves.length === 1) move = gameState.valid_moves[0];
    if (move && gameState.phase === 'moving' && gameState.current_player === cp) {
      await makeMove(move.piece_idx ?? null, move.target, move.pawn_id ?? null);
    }
  } finally {
    _botFastAdvancing = false;
  }
}
