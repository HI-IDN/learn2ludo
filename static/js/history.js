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
  return {
    v: 2,
    saved_at: new Date().toISOString(),
    config: gameState.config || null,
    board: gameState.board || null,
    slots: gameState.slots || [],
    phase: gameState.phase,
    current_player: gameState.current_player,
    dice: gameState.dice || gameState.last_roll || null,
    winner: gameState.winner ?? null,
    winners: gameState.winners ?? [],
    player_times: typeof _playerTimes!=='undefined'?{..._playerTimes}:{},
    players: (gameState.players || []).map(p => ({
      index: p.index,
      type: typeof getPlayerType === 'function' ? getPlayerType(p.index) : 'unknown',
      name: typeof getPlayerName === 'function' ? getPlayerName(p.index) : `Player ${p.index + 1}`,
      color: p.color,
      slot: typeof playerSlot === 'function' ? playerSlot(p.index, gameState.num_players) : p.index,
      pawns: (p.pieces || []).map((pawn, idx) => compactPawn(pawn, idx, p.color))
    })),
    history: [...sessionHistory].reverse().map(h => ({...h}))
  };
}

function resolvePawnIdFromMove(move, fallbackPlayer) {
  if (move?.pawn_id) return move.pawn_id;
  const pawnsPerPlayer = gameState?.config?.board?.pawns_per_player || 4;
  if (typeof move?.piece_idx === 'number') {
    const pi = Math.floor(move.piece_idx / pawnsPerPlayer);
    const li = move.piece_idx % pawnsPerPlayer;
    return pawnId(playerColorName(pi, gameState?.num_players || 4), li);
  }
  if (typeof fallbackPlayer === 'number') {
    const li = move?.piece ?? 0;
    return pawnId(playerColorName(fallbackPlayer, gameState?.num_players || 4), li);
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

// Persistent session history — never cleared, accumulates across games.
// Each entry: {type:'move'|'pregame', ...fields}
const sessionHistory = [];
let _lastGameHistoryLen = 0;

function pushPregameRoll(playerIdx, name, color, roll, round) {
  sessionHistory.unshift({type:'pregame', playerIdx, name, color, roll, round});
}

function syncGameHistory() {
  const h = gameState?.history || [];
  const newEntries = h.slice(_lastGameHistoryLen);
  // Preserve the type the server set (roll / yard_roll / move); fall back to 'move'.
  newEntries.forEach(e => sessionHistory.unshift({...e, type: e.type || 'move'}));
  _lastGameHistoryLen = h.length;
}

function resetGameHistorySync() {
  _lastGameHistoryLen = 0;
}

function renderMoveHistory(){
  const list=document.getElementById('move-history-list'); if(!list)return;
  syncGameHistory();

  const dot='<span class="mh-sep"> · </span>';
  const rows=sessionHistory.map(e=>{
    if(e.type==='pregame'){
      const sub=`rolled ${e.roll}${e.round>1?` (re-roll ${e.round})`:''} · first player`;
      return `<div class="move-history-row move-history-pregame"><i class="fa-solid fa-dice-d6" style="color:${e.color}"></i><span>${e.name}${dot}${sub}</span></div>`;
    }
    const col=COLORS[playerColorName(e.player,gameState?.num_players||4)];
    const name=getPlayerName(e.player);
    if(e.type==='yard_roll'){
      return `<div class="move-history-row move-history-yard-roll"><i class="fa-solid fa-dice-d6" style="color:${col}"></i><span>${name}${dot}rolled ${e.dice} · no pawn in play (try ${e.attempt}/${e.max_attempts})</span></div>`;
    }
    if(e.type==='roll'){
      const moves=e.valid_moves||[];
      const moveSummary=moves.map(m=>{
        const pawnsPerPlayer=gameState?.config?.board?.pawns_per_player||4;
        const pi=typeof m.piece_idx==='number'?Math.floor(m.piece_idx/pawnsPerPlayer):e.player;
        const playerCol=COLORS[playerColorName(pi,gameState?.num_players||4)];
        const pName=getPlayerName(pi);
        const fromL=displayCellLabel(pi,m.from??-1);
        const toL=displayCellLabel(pi,m.target);
        const pid=resolvePawnIdFromMove(m,pi);
        return `<span class="mh-movable" style="--movable-color:${playerCol}">`
          +(pi!==e.player?`${pName} `:'')
          +`${pid}: ${fromL}→${toL}</span>`;
      }).join(' ');
      const blocked=e.blocked_pawns||[];
      const blockedSummary=blocked.map(b=>{
        const pid=b.pawn_id||pawnId(playerColorName(e.player,gameState?.num_players||4), b.piece ?? 0);
        let desc;
        if(b.reason==='yard')          desc='yard';
        else if(b.reason==='overshoot') desc='exact roll needed';
        else if(b.blocked_by!=null)     desc=getPlayerName(b.blocked_by);
        else                            desc='blockaded';
        const icon=b.reason==='blockade'
          ?'<i class="fa-solid fa-dumbbell mh-blocked-icon"></i>'
          :'<i class="fa-solid fa-ban mh-blocked-icon"></i>';
        return `<span class="mh-blocked">${icon} ${pid}: ${desc}</span>`;
      }).join(' ');
      const noExactNote=e.no_exact_roll?` ${dot} <span class="mh-note">needs exact roll to finish</span>`:'';
      const parts=[moveSummary, blockedSummary].filter(Boolean).join(' ');
      return `<div class="move-history-row">`
        +`<i class="fa-solid fa-dice-d6" style="color:${col}"></i>`
        +`<span>${name}${dot}rolled ${e.dice}`
        +(parts?` ${dot} ${parts}`:noExactNote)
        +`</span></div>`;
    }
    if(e.type==='blocked'){
      const blockerCol=COLORS[playerColorName(e.blocked_by,gameState?.num_players||4)];
      const blockerName=getPlayerName(e.blocked_by);
      return `<div class="move-history-row move-history-blocked"><i class="fa-solid fa-ban" style="color:${col}"></i><span>${name}${dot}blocked by ${blockerName}'s blockade · forced to forfeit turn</span></div>`;
    }
    if(e.type==='capture'){
      const captorCol=COLORS[playerColorName(e.by_player,gameState?.num_players||4)];
      const capturedName=getPlayerName(e.captured_player);
      const captorName=getPlayerName(e.by_player);
      const capturedPid=e.captured_pawn_id||resolvePawnIdFromMove({piece_idx:e.captured_piece},e.captured_player);
      const capturedCol=COLORS[playerColorName(e.captured_player,gameState?.num_players||4)];
      const captorPid=e.by_pawn_id||resolvePawnIdFromMove({piece_idx:e.by_piece},e.by_player);
      return `<div class="move-history-row move-history-capture" style="--capture-color:${captorCol}"><i class="fa-solid fa-house-crack" style="color:${capturedCol}"></i><span>${captorName}${dot}${captorPid} captured ${capturedName}'s ${capturedPid} · T${e.cell} → Y</span></div>`;
    }
    const pid=e.pawn_id||resolvePawnIdFromMove({piece_idx:e.piece},e.player);
    return `<div class="move-history-row"><i class="fa-solid fa-person-walking" style="color:${col}"></i><span>${name}${dot}${pid}: ${displayCellLabel(e.player,e.from)} → ${displayCellLabel(e.player,e.to)}</span></div>`;
  });

  list.innerHTML=rows.length?rows.join(''):'<div class="move-history-empty">No committed moves yet.</div>';
}
