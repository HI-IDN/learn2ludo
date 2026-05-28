// Learn2Ludo move history + compact JSON save/replay data.
// Classic script, not ES module.

function compactPawn(pawn) {
  return {
    p: pawn.position ?? -1,
    y: !!pawn.in_yard,
    f: !!pawn.finished,
    a: pawn.absolute_position ?? null
  };
}

function compactGameState() {
  if (!gameState) return null;
  return {
    v: 1,
    saved_at: new Date().toISOString(),
    config: gameState.config || null,
    board: gameState.board || null,
    slots: gameState.slots || [],
    phase: gameState.phase,
    current_player: gameState.current_player,
    dice: gameState.dice || gameState.last_roll || null,
    winner: gameState.winner ?? null,
    players: (gameState.players || []).map(p => ({
      index: p.index,
      type: typeof getPlayerType === 'function' ? getPlayerType(p.index) : 'unknown',
      name: typeof getPlayerName === 'function' ? getPlayerName(p.index) : `Player ${p.index + 1}`,
      color: p.color,
      slot: typeof playerSlot === 'function' ? playerSlot(p.index, gameState.num_players) : p.index,
      pawns: (p.pieces || []).map(compactPawn)
    })),
    history: (gameState.history || []).map(h => ({
      player: h.player,
      pawn: h.piece !== undefined ? h.piece % 4 : h.pawn,
      piece: h.piece,
      from: h.from,
      to: h.to,
      dice: h.dice,
      round: h.round,
      events: h.events || {}
    }))
  };
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

function renderMoveHistory(){ const list=document.getElementById('move-history-list'); if(!list)return; const h=gameState?.history||[]; list.innerHTML=h.length?h.slice().reverse().slice(0,8).map(e=>`<div class="move-history-row"><span class="move-history-dot" style="background:${COLORS[playerColorName(e.player,gameState.num_players)]}"></span><i class="fa-solid fa-user"></i><div class="move-history-text"><strong>pawn ${(e.piece%4)+1}: ${displayCellLabel(e.player,e.from)} → ${displayCellLabel(e.player,e.to)}</strong><span>dice ${e.dice??'–'}</span></div></div>`).join(''):'<div class="move-history-empty">No committed moves yet.</div>'; }
