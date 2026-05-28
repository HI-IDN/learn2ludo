const DICE_FACES = ['', '⚀','⚁','⚂','⚃','⚄','⚅'];
const COLORS = {red:'#AC1A2F', blue:'#0098AA', green:'#719500', yellow:'#F5CF47'};
const PLAYER_COLORS = ['red','green','yellow','blue'];
const ENGINE = {
  track_size: 52,
  yard_count: 4,
  home_length: 6,
  phases: {ROLLING:'rolling', MOVING:'moving', NEXT:'next', FINISHED:'finished'}
};

let settings = {};
let gameState = null;
let tabConfig = [];
let adminToken = null;
let animatingPieceGlobalIdx = null;

function boardLayout(trackSize=52, yardCount=4) {
  const s = Math.floor(trackSize / yardCount);
  const starts = Array.from({length: yardCount}, (_, i) => i * s);
  const finishes = starts.map(x => (x - 1 + trackSize) % trackSize);
  const safe_havens = new Set(Array.from({length: yardCount}, (_, i) => (i * s + Math.floor(s / 2)) % trackSize));
  return {track_size: trackSize, yard_count: yardCount, starts, finishes, safe_havens};
}
function fairSlots(n,k){ return Array.from({length:k}, (_,i)=>(i*Math.floor(n/k))%n); }
function assignSlots(playerCount, slotMode='fair') {
  if (slotMode === 'explicit' && Array.isArray(settings.explicit_slots)) {
    return settings.explicit_slots.slice(0, playerCount).map(Number);
  }
  if (slotMode === 'fixed') return Array.from({length: playerCount}, (_, i) => i);
  if (slotMode === 'random') {
    const a = [0,1,2,3];
    for (let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
    return a.slice(0, playerCount);
  }
  return fairSlots(4, playerCount);
}
function currentLayout(){ return gameState?.board || boardLayout(); }
function playerSlot(playerIdx, n=gameState?.num_players || parseInt(document.getElementById('set-num-players')?.value || 4)) {
  return gameState?.slots?.[playerIdx] ?? assignSlots(n, settings.slot_mode || 'fair')[playerIdx] ?? playerIdx;
}
function playerColorName(playerIdx, n){ return PLAYER_COLORS[playerSlot(playerIdx,n)] || 'blue'; }
function absForPlayerPosition(playerIdx,pos){ return (pos + currentLayout().starts[playerSlot(playerIdx, gameState?.num_players || 4)]) % ENGINE.track_size; }

const DEFAULT_HUMAN_NAMES = ['Player 1','Player 2','Player 3','Player 4'];
const DEFAULT_BOT_NAMES = ['Athena','Hercules','Demeter','Zeus'];
function getPlayerType(i){ return settings.player_types?.[i] || (i===0 ? 'human':'random'); }
function getPlayerName(i){
  const type=getPlayerType(i);
  return type !== 'human' ? (settings.bot_names?.[i] || DEFAULT_BOT_NAMES[i] || `Bot ${i+1}`) : (settings.player_names?.[i] || DEFAULT_HUMAN_NAMES[i] || `Player ${i+1}`);
}
function setPlayerType(i,v){ settings.player_types=settings.player_types||{}; settings.player_types[i]=v; persistSettings(); renderPlayerTypes(); renderPlayerSlots(); renderPlayers(); }
function setPlayerName(i,v){ settings.player_names=settings.player_names||{}; settings.player_names[i]=v; persistSettings(); renderPlayers(); }
function persistSettings(){ localStorage.setItem('ludo_settings', JSON.stringify(settings)); }

function normalizeEngineState(raw) {
  const state = raw?.game || raw?.state || raw || {};
  const cfg = state.config || {};
  const playerCount = cfg.player_count || state.player_count || state.num_players || parseInt(document.getElementById('set-num-players')?.value || settings.num_players || 4);
  const slotMode = cfg.slot_mode || settings.slot_mode || 'fair';
  const slots = state.slots || assignSlots(playerCount, slotMode);
  const layout = state.board || boardLayout(cfg.board?.track_size || 52, cfg.board?.yard_count || 4);
  const players = state.players || Array.from({length: playerCount}, (_, p) => ({
    index:p, color:PLAYER_COLORS[slots[p]],
    pieces:Array.from({length:4}, (_,i)=>({index:i, position:-1, finished:false, in_yard:true, absolute_position:null}))
  }));
  return {
    ...state,
    config:{board:{track_size:52,yard_count:4,home_length:6}, player_count:playerCount, slot_mode:slotMode},
    board:layout, slots, num_players:playerCount,
    current_player: state.current_player ?? state.player ?? 0,
    dice: state.dice ?? state.last_roll ?? 0,
    phase: state.phase || 'rolling',
    players, valid_moves: state.valid_moves || [], history: state.history || [], winner: state.winner ?? null
  };
}

async function init(){
  loadSettings(); applySettingsToControls(); if(typeof initSoundControls==='function') initSoundControls();
  await loadTabs(); await loadStats(); renderPlayerTypes(); renderPlayerSlots(); renderPlayers(); drawBoard();
}
function loadSettings(){ try{ settings=JSON.parse(localStorage.getItem('ludo_settings')||'{}'); }catch{settings={};} if(settings.slot_mode===undefined) settings.slot_mode='fair'; if(settings.sound_volume===undefined) settings.sound_volume=0.8; }
function applySettingsToControls(){
  const c=(id,v)=>{const e=document.getElementById(id); if(e)e.checked=v;};
  const val=(id,v)=>{const e=document.getElementById(id); if(e)e.value=v;};
  c('rule-safe', settings.safe_squares ?? true); c('set-show-cell-numbers', settings.show_cell_numbers ?? false); c('set-animate', settings.animate ?? true);
  val('set-num-players', settings.num_players ?? 4); val('set-slot-mode', settings.slot_mode ?? 'fair');
}
function saveSettings(){
  settings={...settings,
    num_players:parseInt(document.getElementById('set-num-players')?.value||4),
    slot_mode:document.getElementById('set-slot-mode')?.value || 'fair',
    explicit_slots: readExplicitSlots(),
    safe_squares:document.getElementById('rule-safe')?.checked ?? true,
    show_cell_numbers:document.getElementById('set-show-cell-numbers')?.checked ?? false,
    animate:document.getElementById('set-animate')?.checked ?? true,
    sound_volume: typeof getSoundVolume==='function' ? getSoundVolume() : (settings.sound_volume ?? 0.8)
  };
  persistSettings(); renderPlayerTypes(); renderPlayerSlots(); renderPlayers(); drawBoard();
}
function getGameRules(){ return {safe_squares: settings.safe_squares ?? true}; }
function buildNewGamePayload(){
  const playerCount=parseInt(document.getElementById('set-num-players')?.value || settings.num_players || 4);
  const slotMode=document.getElementById('set-slot-mode')?.value || settings.slot_mode || 'fair';
  return {num_players:playerCount, rules:getGameRules(), config:{board:{track_size:52,yard_count:4,home_length:6}, player_count:playerCount, slot_mode:slotMode}};
}

async function loadTabs(){
  try{ const r=await fetch('/api/tabs'); tabConfig=(await r.json()).tabs; }
  catch{ tabConfig=[
    {id:'play',label:'Play',icon:'ti-dice',enabled:true,default_visible:true,order:1},
    {id:'settings',label:'Settings',icon:'ti-settings',enabled:true,default_visible:true,order:2},
    {id:'train',label:'Train',icon:'ti-brain',enabled:true,default_visible:false,order:3},
    {id:'stats',label:'Stats & Replay',icon:'ti-chart-bar',enabled:true,default_visible:true,order:4},
    {id:'bots',label:'Bots',icon:'ti-robot',enabled:true,default_visible:false,order:5},
    {id:'admin',label:'Admin',icon:'ti-shield',enabled:true,default_visible:true,order:99,admin_only:true}
  ]; }
  renderTabs();
}
function getVisibleTabs(){ return tabConfig.filter(t=>t.enabled).sort((a,b)=>a.order-b.order); }
function renderTabs(){ const nav=document.getElementById('tab-nav'); nav.innerHTML=''; getVisibleTabs().forEach(t=>{ const b=document.createElement('button'); b.className='tab-btn'; b.id='tab-btn-'+t.id; b.innerHTML=`<i class="ti ${t.icon}"></i>${t.label}`; b.onclick=()=>switchTab(t.id); nav.appendChild(b); }); switchTab(getVisibleTabs()[0]?.id || 'play'); }
function switchTab(id){ document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active')); document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active')); document.getElementById('tab-btn-'+id)?.classList.add('active'); document.getElementById('panel-'+id)?.classList.add('active'); if(id==='stats')loadStats(); }
async function doAdminLogin(){adminToken='dev';}
async function doOverlayLogin(){adminToken='dev'; closeOverlay(); switchTab('admin');}
function closeOverlay(){ const o=document.getElementById('admin-overlay'); if(o)o.style.display='none'; }
function updateTabConfig(){}
async function saveTabConfig(){}

async function newGame(){
  if(typeof primeAudioForUserGesture==='function') primeAudioForUserGesture();
  saveSettings(); const payload=buildNewGamePayload();
  try{ const r=await fetch('/api/game/new',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}); gameState=normalizeEngineState(await r.json()); }
  catch{ gameState=makeDemoState(payload.config.player_count,payload.config.slot_mode); }
  renderGame();
}
function makeDemoState(n=4,slotMode='fair'){ const slots=assignSlots(n,slotMode); return normalizeEngineState({config:{player_count:n,slot_mode:slotMode,board:{track_size:52,yard_count:4,home_length:6}}, slots, phase:'rolling', player:0}); }
function animateDice(finalValue){
  const face=document.getElementById('dice-face'); const start=performance.now(); face.classList.add('rolling'); if(typeof playDiceRollSound==='function')playDiceRollSound();
  return new Promise(resolve=>{ const timer=setInterval(()=>{ face.textContent=DICE_FACES[1+Math.floor(Math.random()*6)]; if(performance.now()-start>=650){clearInterval(timer); face.textContent=DICE_FACES[finalValue]||DICE_FACES[1]; face.classList.remove('rolling'); resolve();}},55); });
}
async function rollDice(){
  if(typeof primeAudioForUserGesture==='function') primeAudioForUserGesture(); if(!gameState)return; document.getElementById('roll-btn').disabled=true;
  try{ const r=await fetch('/api/game/roll',{method:'POST'}); const d=await r.json(); const dice=Number(d.dice ?? d.roll ?? d.last_roll ?? d.value ?? d); await animateDice(dice); gameState=normalizeEngineState(d.game||d.state||d); if(!gameState.dice)gameState.dice=dice; }
  catch{ const dice=1+Math.floor(Math.random()*6); await animateDice(dice); gameState.dice=dice; gameState.last_roll=dice; gameState.phase='moving'; gameState.valid_moves=demoValidMoves(gameState.current_player,dice); }
  renderGame();
}
function demoValidMoves(playerIdx,dice){ const p=gameState.players[playerIdx]; const moves=[]; p.pieces.forEach((pc,i)=>{ const g=playerIdx*4+i; if(pc.finished)return; if(pc.in_yard){ if(dice===6)moves.push({piece_idx:g,target:0}); } else { const t=pc.position+dice; if(t<=57)moves.push({piece_idx:g,target:t}); }}); return moves; }
async function clickPiece(globalIdx){ const m=(gameState?.valid_moves||[]).find(x=>x.piece_idx===globalIdx); if(m) await makeMove(globalIdx,m.target); }
async function makeMove(pieceIdx,target){
  const p=Math.floor(pieceIdx/4), i=pieceIdx%4, pawn=gameState.players[p].pieces[i], from=pawn.position;
  await animatePawnSteps(pieceIdx,from,target);
  try{ const r=await fetch('/api/game/move',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({piece_idx:pieceIdx,target,target_position:target})}); if(!r.ok)throw new Error(); gameState=normalizeEngineState(await r.json()); }
  catch{ pawn.position=target; pawn.in_yard=false; pawn.finished=target>=57; pawn.absolute_position=target<52?absForPlayerPosition(p,target):null; gameState.history.push({player:p,piece:pieceIdx,from,to:target,dice:gameState.dice,round:gameState.round_count||0,events:{}}); if(gameState.dice===6){gameState.phase='rolling';gameState.valid_moves=[];} else {gameState.current_player=(gameState.current_player+1)%gameState.num_players; gameState.phase='rolling'; gameState.valid_moves=[];} }
  renderGame();
}

function renderGame(){
  if(!gameState)return; drawBoard(); renderPlayers(); renderPawnOptions(); renderMoveHistory();
  const phase=gameState.phase, cp=gameState.current_player, color=COLORS[playerColorName(cp,gameState.num_players)]||COLORS.blue;
  const banner=document.getElementById('turn-banner'), name=document.getElementById('turn-player-name'), instr=document.getElementById('action-instruction'), roll=document.getElementById('roll-btn');
  banner.classList.remove('idle'); banner.style.background=color; banner.querySelector('i').className=getPlayerType(cp)!=='human'?'fa-solid fa-robot':'fa-solid fa-user'; name.textContent=`${getPlayerName(cp)}'s turn`;
  instr.textContent=phase==='rolling'?'Roll the dice.':phase==='moving'?'Choose one of the highlighted pawns to move.':phase==='next'?'Ending turn.':'Game finished.';
  roll.disabled=phase!=='rolling' || gameState.winner!==null; roll.style.background=roll.disabled?'':'#10099F'; roll.style.borderColor=roll.disabled?'':'#10099F';
}
function displayCellLabel(player,pos){ if(pos===-1||pos==null)return 'yard'; if(pos>=52)return `home ${pos-51}`; return `cell ${((pos+currentLayout().starts[playerSlot(player,gameState?.num_players||4)])%52)+1}`; }
function spacesRemaining(pos,finished=false){ if(finished)return 0; if(pos===-1||pos==null)return 57; return Math.max(0,57-pos); }
function renderPawnOptions(){ const card=document.getElementById('pawn-options-card'); if(!card)return; if(!gameState){card.innerHTML='<div class="move-history-empty">Start a game to inspect pawn options.</div>';return;} const p=gameState.players[gameState.current_player]; const col=COLORS[p.color]||COLORS.blue; const valid=new Map(gameState.valid_moves.map(m=>[m.piece_idx,m])); card.innerHTML=`<div class="pawn-options-turn-head" style="--player-color:${col}"><i class="fa-solid ${getPlayerType(p.index)!=='human'?'fa-robot':'fa-user'}"></i><strong>${getPlayerName(p.index)}</strong><span class="pawn-options-dice">dice ${gameState.dice||'–'}</span></div><div class="pawn-options-header pawn-options-grid compact"><span>pawn</span><span>move</span><span>remaining</span></div><div class="pawn-options-list">${p.pieces.map((pc,i)=>{const g=p.index*4+i,m=valid.get(g);return `<div class="pawn-option-row pawn-options-grid compact${m?' clickable':''}" ${m?`onclick="clickPiece(${g})"`:''}><span><strong>P${i+1}</strong></span><span>${displayCellLabel(p.index,pc.position)} → ${m?displayCellLabel(p.index,m.target):'—'}</span><span><strong>${spacesRemaining(m?m.target:pc.position,pc.finished)}</strong></span></div>`}).join('')}</div>`; }
function renderMoveHistory(){ const list=document.getElementById('move-history-list'); if(!list)return; const h=gameState?.history||[]; list.innerHTML=h.length?h.slice().reverse().slice(0,8).map(e=>`<div class="move-history-row"><span class="move-history-dot" style="background:${COLORS[playerColorName(e.player,gameState.num_players)]}"></span><i class="fa-solid fa-user"></i><div class="move-history-text"><strong>pawn ${(e.piece%4)+1}: ${displayCellLabel(e.player,e.from)} → ${displayCellLabel(e.player,e.to)}</strong><span>dice ${e.dice??'–'}</span></div></div>`).join(''):'<div class="move-history-empty">No committed moves yet.</div>'; }
function renderPlayers(){ const list=document.getElementById('players-list'); if(!list)return; const n=gameState?.num_players||parseInt(document.getElementById('set-num-players')?.value||4); const players=gameState?.players||Array.from({length:n},(_,i)=>({index:i,color:playerColorName(i,n),pieces:Array.from({length:4},()=>({in_yard:true,finished:false}))})); list.innerHTML=players.map((p,i)=>{const col=COLORS[p.color]||COLORS.blue; return `<div class="player-order-row-min${p.index===gameState?.current_player?' current':''}"><i class="fa-solid ${getPlayerType(p.index)!=='human'?'fa-robot':'fa-user'}" style="color:${col}"></i><div><span class="player-order-name">${getPlayerName(p.index)}</span> <span class="player-order-place">${i+1}${['st','nd','rd'][i]||'th'}</span> <span class="player-order-dot">·</span> <span class="player-order-color">${p.color}</span></div><div class="player-order-pawns">${p.pieces.map(pc=>`<span class="player-order-pawn${pc.finished?' done':(!pc.in_yard?' active':'')}" style="--player-color:${col}"></span>`).join('')}</div></div>`}).join(''); }
function readExplicitSlots() {
  const np = parseInt(document.getElementById('set-num-players')?.value || settings.num_players || 4);
  const current = settings.explicit_slots || assignSlots(np, settings.slot_mode === 'explicit' ? 'fair' : (settings.slot_mode || 'fair'));
  return Array.from({length: np}, (_, i) => {
    const el = document.getElementById(`player-slot-${i}`);
    return parseInt(el?.value ?? current[i] ?? i);
  });
}

function setExplicitSlot(i, value) {
  const np = parseInt(document.getElementById('set-num-players')?.value || settings.num_players || 4);
  settings.explicit_slots = settings.explicit_slots || assignSlots(np, 'fair');
  settings.explicit_slots[i] = parseInt(value);
  settings.slot_mode = 'explicit';
  const mode = document.getElementById('set-slot-mode');
  if (mode) mode.value = 'explicit';
  persistSettings();
  renderPlayerSlots();
  renderPlayerTypes();
  renderPlayers();
  drawBoard();
}

function renderPlayerSlots() {
  const wrap = document.getElementById('player-slots');
  if (!wrap) return;
  const np = parseInt(document.getElementById('set-num-players')?.value || settings.num_players || 4);
  const mode = document.getElementById('set-slot-mode')?.value || settings.slot_mode || 'fair';
  const slots = assignSlots(np, mode);
  const used = new Set();
  wrap.innerHTML = Array.from({length: np}, (_, i) => {
    const slot = slots[i] ?? i;
    const duplicate = used.has(slot);
    used.add(slot);
    const color = COLORS[PLAYER_COLORS[slot]] || COLORS.blue;
    const options = PLAYER_COLORS.map((name, idx) => `<option value="${idx}" ${idx === slot ? 'selected' : ''}>${name}</option>`).join('');
    return `
      <div class="form-row player-slot-row ${duplicate ? 'slot-duplicate' : ''}">
        <label><span class="move-history-dot" style="background:${color}"></span> ${getPlayerName(i)} color</label>
        <select id="player-slot-${i}" onchange="setExplicitSlot(${i}, this.value)">
          ${options}
        </select>
      </div>`;
  }).join('');
}

function renderPlayerTypes(){
  const wrap=document.getElementById('player-types');
  if(!wrap)return;
  const n=parseInt(document.getElementById('set-num-players')?.value||settings.num_players||4);
  wrap.innerHTML=Array.from({length:n},(_,i)=>{
    const type = getPlayerType(i);
    const isHuman = type === 'human';
    const displayName = getPlayerName(i);
    return `<div class="player-config-row">
      <div class="form-row">
        <label>${DEFAULT_HUMAN_NAMES[i]}</label>
        <select onchange="setPlayerType(${i},this.value)">
          <option value="human" ${type==='human'?'selected':''}>Human</option>
          <option value="random" ${type==='random'?'selected':''}>Robot</option>
          <option value="greedy" ${type==='greedy'?'selected':''}>Greedy robot</option>
        </select>
      </div>
      <div class="form-row">
        <label>${isHuman ? 'Human name' : 'Robot name'}</label>
        ${isHuman
          ? `<input type="text" value="${displayName}" onchange="setPlayerName(${i}, this.value)" onkeydown="if(event.key==='Enter')this.blur()">`
          : `<input type="text" value="${displayName}" onchange="settings.bot_names=settings.bot_names||{};settings.bot_names[${i}]=this.value||DEFAULT_BOT_NAMES[${i}]||'Robot';persistSettings();renderPlayers();renderPlayerSlots();" onkeydown="if(event.key==='Enter')this.blur()">`
        }
      </div>
    </div>`;
  }).join('');
}

async function startTraining(){try{await fetch('/api/train/start',{method:'POST'});}catch{}}
async function stopTraining(){try{await fetch('/api/train/stop',{method:'POST'});}catch{}}
async function loadStats(){try{const r=await fetch('/api/stats'); const d=await r.json(); document.getElementById('st-games').textContent=d.games_played??0;}catch{}}
window.addEventListener('DOMContentLoaded', async () => { await (window.learn2ludoComponentsReady || Promise.resolve()); init(); });
