// Learn2Ludo move history + compact JSON save/replay data.
// Classic script, not ES module.

function compactPawn(pawn, index, color) {
  return {
    id: pawn.pawn_id ?? pawnId(color, index),
    p: pawn.position ?? -1,
    y: !!pawn.in_yard,
    f: !!pawn.finished,
    a: pawn.absolute_position ?? null
  };
}

function compactGameState() {
  if (!gameState) return null;
  const history = (gameState.history || []).map(h => ({...h}));
  return {
    v: 2,
    saved_at: new Date().toISOString(),
    config: gameState.config || null,
    board: gameState.board || null,
    slots: gameState.slots || [],
    phase: gameState.phase,
    current_player: gameState.current_player,
    starting_player: gameState.starting_player ?? null,
    starting_player_color: gameState.starting_player_color ?? null,
    dice: gameState.dice || gameState.last_roll || null,
    winner: gameState.winner ?? null,
    winners: gameState.winners ?? [],
    winner_color: gameState.winner_color ?? null,
    winner_colors: gameState.winner_colors ?? [],
    player_times: typeof _playerTimes !== 'undefined' ? {..._playerTimes} : {},
    players: (gameState.players || []).map(p => ({
      index: p.index,
      type: typeof getPlayerType === 'function' ? getPlayerType(p.index) : 'unknown',
      name: typeof getPlayerName === 'function' ? getPlayerName(p.index) : `Player ${p.index + 1}`,
      color: p.color,
      slot: typeof playerSlot === 'function' ? playerSlot(p.index, gameState.num_players) : p.index,
      pawns: (p.pieces || []).map((pawn, idx) => compactPawn(pawn, idx, p.color))
    })),
    history
  };
}

function historyPlayer(playerIdx) {
  return (gameState?.players || []).find(p => p.index === playerIdx) || null;
}

function historyPlayerName(playerIdx) {
  const player = historyPlayer(playerIdx);
  return player?.name || getPlayerName(playerIdx);
}

function historyPlayerColorName(playerIdx, fallbackColor) {
  const player = historyPlayer(playerIdx);
  return fallbackColor || player?.color || playerColorName(playerIdx, gameState?.num_players || 4);
}

function historyPlayerColor(playerIdx, fallbackColor) {
  return COLORS[historyPlayerColorName(playerIdx, fallbackColor)] || COLORS.blue;
}

function resolvePawnIdFromMove(move, fallbackPlayer) {
  if (move?.pawn_id) return move.pawn_id;
  const pawnsPerPlayer = gameState?.config?.board?.pawns_per_player || 4;
  if (typeof move?.piece_idx === 'number') {
    const pi = Math.floor(move.piece_idx / pawnsPerPlayer);
    const li = move.piece_idx % pawnsPerPlayer;
    return pawnId(historyPlayerColorName(pi), li);
  }
  if (typeof fallbackPlayer === 'number') {
    const li = move?.piece ?? 0;
    return pawnId(historyPlayerColorName(fallbackPlayer), li);
  }
  return '?';
}

function saveGameJson() {
  const data = compactGameState();
  if (!data) return;
  const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  a.href = url;
  a.download = `learn2ludo-game-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function updateSaveGameButton() {
  const btn = document.getElementById('save-game-json-btn');
  if (btn) btn.disabled = !gameState;
}

const sessionHistory = [];
let _lastGameHistoryLen = 0;
let completedGameArchive = loadCompletedGameArchive();

function pushPregameRoll(playerIdx, name, color, roll, round) {
  sessionHistory.unshift({type: 'pregame', playerIdx, name, color, roll, round});
}

function syncGameHistory() {
  const h = gameState?.history || [];
  const newEntries = h.slice(_lastGameHistoryLen);
  newEntries.forEach(e => sessionHistory.unshift({...e, type: e.type || 'move'}));
  _lastGameHistoryLen = h.length;
}

function resetGameHistorySync() {
  _lastGameHistoryLen = 0;
}

function clearSessionHistory() {
  sessionHistory.length = 0;
  _lastGameHistoryLen = 0;
}

function setSessionHistory(entries) {
  sessionHistory.length = 0;
  (entries || []).slice().reverse().forEach(e => sessionHistory.push({...e, type: e.type || 'move'}));
  _lastGameHistoryLen = entries?.length || 0;
}

function loadCompletedGameArchive() {
  try {
    return JSON.parse(localStorage.getItem('learn2ludo_completed_games') || '[]');
  } catch {
    return [];
  }
}

function saveCompletedGameArchive() {
  localStorage.setItem('learn2ludo_completed_games', JSON.stringify(completedGameArchive));
}

function archiveCompletedGame() {
  if (!gameState || gameState.winner == null) return;
  const history = gameState.history || [];
  const winnerEvent = history.findLast?.(e => e.type === 'game_winner') || [...history].reverse().find(e => e.type === 'game_winner');
  const archiveId = `${gameState.starting_player ?? 'x'}:${winnerEvent?.player ?? gameState.winner}:${history.length}:${winnerEvent?.round ?? ''}`;
  if (completedGameArchive.some(g => g.archive_id === archiveId)) return;
  const compact = compactGameState();
  if (!compact) return;
  completedGameArchive.push({...compact, archive_id: archiveId});
  saveCompletedGameArchive();
}

function renderHistoryRows(entries) {
  const dot = '<span class="mh-sep"> &middot; </span>';
  return (entries || []).map((e, idx, all) => {
    if (e.type === 'pregame') {
      const sub = `rolled ${e.roll}${e.round > 1 ? ` (re-roll ${e.round})` : ''} &middot; first player`;
      return `<div class="move-history-row move-history-pregame"><i class="fa-solid fa-dice-d6" style="color:${e.color}"></i><span>${e.name}${dot}${sub}</span></div>`;
    }
    if (e.type === 'game_start') {
      const startColor = historyPlayerColorName(e.player, e.color);
      const startCol = historyPlayerColor(e.player, startColor);
      return `<div class="move-history-row move-history-game-start"><i class="fa-solid fa-flag-checkered" style="color:${startCol}"></i><span>Starting player${dot}${historyPlayerName(e.player)} (${startColor})</span></div>`;
    }
    if (e.type === 'game_winner') {
      const winners = e.winners?.length ? e.winners : [e.player];
      const labels = winners.map((w, i) => `${historyPlayerName(w)} (${historyPlayerColorName(w, e.winner_colors?.[i])})`);
      const winColor = historyPlayerColorName(e.player, e.color);
      const winCol = historyPlayerColor(e.player, winColor);
      const tentative = idx < all.length - 1;
      return `<div class="move-history-row move-history-game-winner"><i class="fa-solid fa-crown" style="color:${winCol}"></i><span>${tentative ? 'Tentative winner' : `Winner${winners.length > 1 ? 's' : ''}`}${dot}${labels.join(' & ')}</span></div>`;
    }
    const col = historyPlayerColor(e.player);
    const name = historyPlayerName(e.player);
    if (e.type === 'yard_roll') {
      return `<div class="move-history-row move-history-yard-roll"><i class="fa-solid fa-dice-d6" style="color:${col}"></i><span>${name}${dot}rolled ${e.dice} &middot; no pawn in play (try ${e.attempt}/${e.max_attempts})</span></div>`;
    }
    if (e.type === 'roll') {
      const moves = e.valid_moves || [];
      const moveSummary = moves.map(m => {
        const pawnsPerPlayer = gameState?.config?.board?.pawns_per_player || 4;
        const pi = typeof m.piece_idx === 'number' ? Math.floor(m.piece_idx / pawnsPerPlayer) : e.player;
        const playerCol = historyPlayerColor(pi);
        const pName = historyPlayerName(pi);
        const fromL = displayCellLabel(pi, m.from ?? -1);
        const toL = displayCellLabel(pi, m.target);
        const pid = resolvePawnIdFromMove(m, pi);
        return `<span class="mh-movable" style="--movable-color:${playerCol}">`
          + (pi !== e.player ? `${pName} ` : '')
          + `${pid}: ${fromL}&rarr;${toL}</span>`;
      }).join(' ');
      const blocked = e.blocked_pawns || [];
      const blockedSummary = blocked.map(b => {
        const pid = b.pawn_id || pawnId(historyPlayerColorName(e.player), b.piece ?? 0);
        let desc;
        if (b.reason === 'yard') desc = 'yard';
        else if (b.reason === 'overshoot') desc = 'exact roll needed';
        else if (b.blocked_by != null) desc = historyPlayerName(b.blocked_by);
        else desc = 'blockaded';
        const icon = b.reason === 'blockade'
          ? '<i class="fa-solid fa-dumbbell mh-blocked-icon"></i>'
          : '<i class="fa-solid fa-ban mh-blocked-icon"></i>';
        return `<span class="mh-blocked">${icon} ${pid}: ${desc}</span>`;
      }).join(' ');
      const noExactNote = e.no_exact_roll ? ` ${dot} <span class="mh-note">needs exact roll to finish</span>` : '';
      const parts = [moveSummary, blockedSummary].filter(Boolean).join(' ');
      return `<div class="move-history-row">`
        + `<i class="fa-solid fa-dice-d6" style="color:${col}"></i>`
        + `<span>${name}${dot}rolled ${e.dice}`
        + (parts ? ` ${dot} ${parts}` : noExactNote)
        + `</span></div>`;
    }
    if (e.type === 'blocked') {
      const blockerName = historyPlayerName(e.blocked_by);
      return `<div class="move-history-row move-history-blocked"><i class="fa-solid fa-ban" style="color:${col}"></i><span>${name}${dot}blocked by ${blockerName}'s blockade &middot; forced to forfeit turn</span></div>`;
    }
    if (e.type === 'capture') {
      const captorCol = historyPlayerColor(e.by_player);
      const capturedName = historyPlayerName(e.captured_player);
      const captorName = historyPlayerName(e.by_player);
      const capturedPid = e.captured_pawn_id || resolvePawnIdFromMove({piece_idx: e.captured_piece}, e.captured_player);
      const capturedCol = historyPlayerColor(e.captured_player);
      const captorPid = e.by_pawn_id || resolvePawnIdFromMove({piece_idx: e.by_piece}, e.by_player);
      return `<div class="move-history-row move-history-capture" style="--capture-color:${captorCol}"><i class="fa-solid fa-house-crack" style="color:${capturedCol}"></i><span>${captorName}${dot}${captorPid} captured ${capturedName}'s ${capturedPid} &middot; T${e.cell} &rarr; Y</span></div>`;
    }
    const pid = e.pawn_id || resolvePawnIdFromMove({piece_idx: e.piece}, e.player);
    return `<div class="move-history-row"><i class="fa-solid fa-person-walking" style="color:${col}"></i><span>${name}${dot}${pid}: ${displayCellLabel(e.player, e.from)} &rarr; ${displayCellLabel(e.player, e.to)}</span></div>`;
  });
}

function renderMoveHistory() {
  const list = document.getElementById('move-history-list');
  if (!list) return;
  if (typeof isReplayActive === 'function' && isReplayActive()) {
    const rows = renderHistoryRows([...(gameState?.history || [])].reverse());
    list.innerHTML = rows.length ? rows.join('') : '<div class="move-history-empty">No committed moves yet.</div>';
    return;
  }
  if (typeof isLiveHistoryBrowsing === 'function' && isLiveHistoryBrowsing()) {
    const rows = renderHistoryRows([...(gameState?.history || [])].reverse());
    list.innerHTML = rows.length ? rows.join('') : '<div class="move-history-empty">No committed moves yet.</div>';
    return;
  }
  syncGameHistory();
  archiveCompletedGame();
  const rows = renderHistoryRows(sessionHistory);
  list.innerHTML = rows.length ? rows.join('') : '<div class="move-history-empty">No committed moves yet.</div>';
}
