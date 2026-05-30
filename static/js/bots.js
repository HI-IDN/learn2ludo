// Bot system — auto-play loop + server-side policy dispatch.
//
// All bots (heuristic and future RL) run through POST /api/game/bot-move.
// JS policies are offline fallbacks only — do not add game logic here.

const FALLBACK_BOTS = [
  { id: 'eris', name: 'Eris', description: 'Goddess of Discord — moves at random' },
  { id: 'ares', name: 'Ares', description: 'God of War — captures enemy pawns when possible' },
];

let BOT_REGISTRY = FALLBACK_BOTS;

async function loadBotRegistry() {
  try {
    const r = await fetch('/api/bots');
    const d = await r.json();
    if (Array.isArray(d.bots) && d.bots.length) BOT_REGISTRY = d.bots;
  } catch { /* keep fallback */ }
}

function getBotRegistry() { return BOT_REGISTRY; }

// ---- Server-side policy (primary) ------------------------------------------

async function runBotPolicy(botId, validMoves) {
  try {
    const r = await fetch('/api/game/bot-move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bot_id: botId, valid_moves: validMoves, game_state: gameState ?? {} }),
    });
    if (r.ok) return await r.json();
  } catch { /* fall through to JS fallback */ }
  return runBotPolicyLocal(botId, validMoves);
}

// ---- JS fallback policies (offline / demo mode) ----------------------------

function runBotPolicyLocal(botId, validMoves) {
  if (!validMoves?.length) return null;
  if (botId === 'ares') return _aresLocal(validMoves);
  return _erisLocal(validMoves);
}

function _erisLocal(validMoves) {
  return validMoves[Math.floor(Math.random() * validMoves.length)];
}

function _aresLocal(validMoves) {
  const captures = validMoves.filter(m => _isCaptureLocal(m));
  return captures.length ? captures[Math.floor(Math.random() * captures.length)] : _erisLocal(validMoves);
}

function _isCaptureLocal(move) {
  if (!gameState) return false;
  const trackSize  = gameState.config?.board?.track_size ?? 52;
  const pawnsPerPlayer = gameState.config?.board?.pawns_per_player ?? 4;
  if (move.target >= trackSize) return false;
  const movingPlayer = Math.floor(move.piece_idx / pawnsPerPlayer);
  const slot   = playerSlot(movingPlayer, gameState.num_players);
  const start  = gameState.board?.starts?.[slot] ?? 0;
  const absTarget = (move.target + start) % trackSize;
  const safe   = gameState.board?.safe_havens ?? [];
  if (safe.includes?.(absTarget)) return false;
  return (gameState.players ?? []).some((p, pi) =>
    pi !== movingPlayer &&
    (p.pieces ?? []).some(pc => !pc.in_yard && !pc.finished && pc.absolute_position === absTarget)
  );
}

// ---- Bots page -------------------------------------------------------------

function renderBotsPage() {
  const wrap = document.getElementById('bots-sections');
  if (!wrap) return;

  const heuristics = BOT_REGISTRY.filter(b => b.type === 'heuristic' || !b.type);
  const trained    = BOT_REGISTRY.filter(b => b.type === 'trained');

  wrap.innerHTML = `
    ${botSection('Heuristics', 'Rule-based opponents — no training required', heuristics)}
    ${botSection('Trained Models', 'RL agents produced by the Train tab', trained, true)}
  `;
}

function botSection(title, subtitle, bots, allowEmpty = false) {
  const cards = bots.length
    ? bots.map(b => `
        <div class="bot-card">
          <div class="bot-card-icon"><i class="fa-solid fa-robot"></i></div>
          <div class="bot-card-body">
            <div class="bot-card-name">${b.name}</div>
            <div class="bot-card-desc">${b.description}</div>
          </div>
        </div>`).join('')
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

// ---- Auto-play loop --------------------------------------------------------

let _botPlaying = false;
function resetBotPlaying() { _botPlaying = false; }

function scheduleBotPlay() {
  if (_botPlaying) return;
  const speed = settings.auto_play_speed || 'off';
  if (speed === 'off') return;
  if (!gameState || gameState.phase !== 'rolling' || gameState.winner !== null) return;
  if (getPlayerType(gameState.current_player) === 'human') return;
  _botPlaying = true;
  setTimeout(botTakeTurn, _AUTO_DELAY[speed].roll);
}

async function botTakeTurn() {
  try {
    const speed = settings.auto_play_speed || 'off';
    const cp = gameState?.current_player;
    if (!gameState || gameState.phase !== 'rolling' || getPlayerType(cp) === 'human' || speed === 'off') return;

    await rollDice();

    if (gameState.phase === 'moving' && gameState.valid_moves?.length > 0) {
      const botId = settings.bot_ids?.[cp] ?? 'eris';
      const move  = await runBotPolicy(botId, gameState.valid_moves);
      if (move) {
        // Auto-play: no shake — just execute after the move delay
        await new Promise(r => setTimeout(r, _AUTO_DELAY[speed].move));
        await makeMove(move.piece_idx, move.target);
      }
    }
  } finally {
    _botPlaying = false;
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
