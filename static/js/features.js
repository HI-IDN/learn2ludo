// Learn2Ludo pawn feature panel.
// Classic script, not ES module.
// This used to be called "pawn features"; it shows current pawn features and legal moves.

function renderPawnOptions(){
  const card=document.getElementById('pawn-options-card');
  if(!card)return;
  if(!gameState){
	card.innerHTML='<div class="move-history-empty">Start a game to inspect pawn features.</div>';
	return;
  }

  const _speed=settings?.auto_play_speed||'off';
  const _isBotTurn=getPlayerType(gameState.current_player)!=='human';
  if(_speed!=='off'&&gameState.phase==='moving'&&(_isBotTurn||gameState.valid_moves.length<=1)){
	card.innerHTML='';
	return;
  }

  const p=gameState.players[gameState.current_player];
  const col=COLORS[p.color]||COLORS.blue;
  const pawns=gameState?.config?.board?.pawns_per_player||4;
  const valid=new Map(gameState.valid_moves.map(m=>[m.pawn_id||`idx:${m.piece_idx}`,m]));

  card.innerHTML=`<div class="pawn-options-turn-head" style="--player-color:${col}"><i class="fa-solid ${getPlayerType(p.index)!=='human'?'fa-robot':'fa-user'}"></i><strong>${getPlayerName(p.index)}</strong><span class="pawn-options-dice">dice ${gameState.dice||'–'}</span></div><div class="pawn-options-header pawn-options-grid compact"><span>pawn</span><span>move</span><span>remaining</span></div><div class="pawn-options-list">${p.pieces.map((pc,i)=>{const g=p.index*pawns+i;const pid=pc.pawn_id||pawnId(p.color,i);const m=valid.get(pid)||valid.get(`idx:${g}`);return `<div class="pawn-option-row pawn-options-grid compact${m?' clickable':''}" ${m?`onclick="clickPiece(${g})"`:''}><span><strong>${pid}</strong></span><span>${displayCellLabel(p.index,pc.position)} → ${m?displayCellLabel(p.index,m.target):'—'}</span><span><strong>${spacesRemaining(m?m.target:pc.position,pc.finished)}</strong></span></div>`}).join('')}</div>`;
}
