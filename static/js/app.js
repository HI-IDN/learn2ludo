const DICE_FACES = ['', '⚀','⚁','⚂','⚃','⚄','⚅'];
const COLORS = {red:'#AC1A2F', green:'#719500', yellow:'#F5CF47', blue:'#0098AA', purple:'#660451', orange:'#EB7125'};
const PLAYER_COLORS = ['red','green','yellow','blue','orange','purple'];
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

function boardLayout(trackSize=56, yardCount=4) {
  const s = Math.floor(trackSize / yardCount);
  const starts = Array.from({length: yardCount}, (_, i) => i * s);
  const finishes = starts.map(x => (x - 1 + trackSize) % trackSize);
  const safeOffset = settings.board_safe_offset ?? 7;
  const safe_havens = new Set([
    ...starts,
    ...starts.map(start => (start + safeOffset) % trackSize)
  ]);
  return {max_players: maxPlayers,
    track_size: trackSize, yard_count: yardCount, starts, finishes, safe_havens};
}
function fairSlots(n,k){ return Array.from({length:k}, (_,i)=>(i*Math.floor(n/k))%n); }
function assignSlots(playerCount, slotMode='fair') {
  if (slotMode === 'fixed') return Array.from({length: playerCount}, (_, i) => i);
  if (slotMode === 'random') {
    const a = Array.from({length: settings.board_yard_count || 4}, (_, i) => i);
    for (let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
    return a.slice(0, playerCount);
  }
  return fairSlots(settings.board_yard_count || 4, playerCount);
}
function currentLayout(){ return gameState?.board || boardLayout(); }
function isColorChoiceEnabled() {
  return (document.getElementById('set-slot-mode')?.value || settings.slot_mode || 'fair') === 'fixed';
}

function playerSlot(playerIdx, n=gameState?.num_players || settings.num_players || 4) {
  if (gameState?.slots?.[playerIdx] !== undefined) return gameState.slots[playerIdx];
  const active = Array.isArray(settings.active_slots) ? settings.active_slots : null;
  return active?.[playerIdx] ?? playerIdx;
}
function playerColorName(playerIdx, n){ return PLAYER_COLORS[playerSlot(playerIdx,n)] || 'blue'; }
function absForPlayerPosition(playerIdx,pos){ return (pos + currentLayout().starts[playerSlot(playerIdx, gameState?.num_players || 4)]) % ENGINE.track_size; }

const DEFAULT_HUMAN_NAMES = ['Óðinn','Freyja','Loki','Þór','Sif','Týr'];
const DEFAULT_BOT_NAMES = ['Artemis'];
function getPlayerType(i){ return settings.player_types?.[i] || (i===0 ? 'human':'random'); }

function playerDisplayOrder(n) {
  const order = settings.player_order || Array.from({length: n}, (_, i) => i);
  const filtered = order.filter(i => i >= 0 && i < n);
  const missing = Array.from({length: n}, (_, i) => i).filter(i => !filtered.includes(i));
  return filtered.concat(missing);
}

function botDisplayName(i) {
  const base = 'Artemis';
  const robotsBefore = Array.from({length: i + 1}, (_, idx) => getPlayerType(idx)).filter(t => t !== 'human').length;
  return robotsBefore <= 1 ? base : `${base}-${robotsBefore}`;
}

function getPlayerName(i){
  const type=getPlayerType(i);
  if (type !== 'human') return settings.bot_names?.[i] || botDisplayName(i);
  return settings.player_names?.[i] || DEFAULT_HUMAN_NAMES[i] || `Player ${i+1}`;
}
function setPlayerType(i,v){ settings.player_types=settings.player_types||{}; settings.player_types[i]=v; syncPlayerCountOptions(); validateBoardConfig(); persistSettings(); renderPlayerTypes(); renderPlayerSlots(); renderPlayers(); }
function setPlayerName(i,v){ settings.player_names=settings.player_names||{}; settings.player_names[i]=v; persistSettings(); renderPlayers(); renderPlayerSlots(); }
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
    pieces:Array.from({length:(state.config?.board?.pawns_per_player || 4)}, (_,i)=>({index:i, position:-1, finished:false, in_yard:true, absolute_position:null}))
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
  loadSettings(); applySettingsToControls(); if(typeof initSoundControls==='function') initSoundControls(); await loadTabs(); await loadStats(); renderPlayers(); renderLobbySlots(); drawBoard();
}
function loadSettings(){ try{ settings=JSON.parse(localStorage.getItem('ludo_settings')||'{}'); }catch{settings={};} if(settings.slot_mode===undefined) settings.slot_mode='fair'; if(settings.sound_volume===undefined) settings.sound_volume=0.8; }
function applySettingsToControls(){
  const c=(id,v)=>{const e=document.getElementById(id); if(e)e.checked=v;};
  const val=(id,v)=>{const e=document.getElementById(id); if(e)e.value=v;};
  c('rule-safe', settings.safe_squares ?? true); c('set-show-cell-numbers', settings.show_cell_numbers ?? false); c('set-animate', settings.animate ?? true); val('rule-max-sixes', settings.max_consecutive_sixes ?? 3); val('rule-empty-board-rolls', settings.empty_board_rolls ?? 3);
  val('set-num-players', settings.num_players ?? 4); val('set-board-size', settings.board_size ?? 480); val('set-slot-mode', settings.slot_mode ?? 'fair'); val('board-max-players', settings.board_max_players ?? 4); val('board-yard-count', settings.board_yard_count ?? 4); val('board-track-size', settings.board_track_size ?? 56); val('board-safe-offset', settings.board_safe_offset ?? 7); val('board-home-length', settings.board_home_length ?? 6); val('board-pawns-per-player', settings.pawns_per_player ?? 4); c('board-stack-home', settings.stack_home_pawns ?? false); val('set-board-size', settings.board_size ?? 480);
}
function saveSettings(){
  const boardCfg = readBoardConfig();
  settings={...settings,
    num_players: settings.num_players ?? 4,
    slot_mode: settings.slot_mode ?? 'fair',
    board_max_players: boardCfg.max_players ?? settings.board_max_players ?? 4,
    board_yard_count: boardCfg.yard_count ?? settings.board_yard_count ?? 4,
    board_track_size: boardCfg.track_size ?? settings.board_track_size ?? 56,
    board_safe_offset: boardCfg.safe_offset ?? settings.board_safe_offset ?? 7,
    board_home_length: boardCfg.home_length ?? settings.board_home_length ?? 6,
    pawns_per_player: boardCfg.pawns_per_player ?? settings.pawns_per_player ?? 4,
    stack_home_pawns: boardCfg.stack_home_pawns ?? settings.stack_home_pawns ?? false,
    safe_squares:document.getElementById('rule-safe')?.checked ?? true,
    six_to_enter:true,
    six_extra_turn:true,
    capture_enabled:true,
    no_pawn_three_rolls:true,
    max_consecutive_sixes:Math.max(1, parseInt(document.getElementById('rule-max-sixes')?.value || 3)),
    empty_board_rolls:Math.max(1, parseInt(document.getElementById('rule-empty-board-rolls')?.value || 3)),
    show_cell_numbers:document.getElementById('set-show-cell-numbers')?.checked ?? false,
    animate:document.getElementById('set-animate')?.checked ?? true,
    sound_volume: typeof getSoundVolume==='function' ? getSoundVolume() : (settings.sound_volume ?? 0.8)
  };
  validateBoardConfig(); persistSettings(); renderPlayers(); renderLobbySlots(); drawBoard();
}
function getGameRules(){ return {six_to_enter:true, six_extra_turn:true, capture_enabled:true, safe_squares: settings.safe_squares ?? true, max_consecutive_sixes: settings.max_consecutive_sixes ?? 3, no_pawn_three_rolls:true, empty_board_rolls: settings.empty_board_rolls ?? 3}; }

function readBoardConfig() {
  const maxPlayers = Math.max(2, Math.min(6, parseInt(document.getElementById('board-max-players')?.value || settings.board_max_players || 4)));
  const yardCount = Math.max(maxPlayers, Math.min(6, parseInt(document.getElementById('board-yard-count')?.value || settings.board_yard_count || 4)));
  let trackSize = Math.max(yardCount, parseInt(document.getElementById('board-track-size')?.value || settings.board_track_size || 56));
  trackSize = trackSize - (trackSize % yardCount);
  if (trackSize < yardCount) trackSize = yardCount;
  const pawns = Math.max(1, parseInt(document.getElementById('board-pawns-per-player')?.value || settings.pawns_per_player || 4));
  const homeLength = Math.max(pawns, parseInt(document.getElementById('board-home-length')?.value || settings.board_home_length || 6));
  const safeOffset = Math.max(1, parseInt(document.getElementById('board-safe-offset')?.value || settings.board_safe_offset || 7));
  const stackHome = document.getElementById('board-stack-home')?.checked ?? !!settings.stack_home_pawns;

  return {
    max_players: maxPlayers,
    track_size: trackSize,
    yard_count: yardCount,
    home_length: homeLength,
    pawns_per_player: pawns,
    safe_offset: safeOffset,
    stack_home_pawns: stackHome
  };
}


function syncPlayerCountOptions() {
  const select = document.getElementById('set-num-players');
  if (!select) return;
  const maxPlayers = readBoardConfig().max_players || 4;
  const current = Math.min(parseInt(select.value || settings.num_players || 4), maxPlayers);
  select.innerHTML = Array.from({length: maxPlayers - 1}, (_, i) => i + 2)
    .map(n => `<option value="${n}" ${n === current ? 'selected' : ''}>${n}</option>`).join('');
}

function validateBoardConfig() {
  const cfg = readBoardConfig();
  const warning = document.getElementById('board-config-warning');
  if (!warning) return cfg;

  const messages = [];
  if (cfg.track_size % cfg.yard_count !== 0) {
    messages.push('Track length must be divisible by number of yards; rounded down.');
  }
  if (cfg.home_length < cfg.pawns_per_player) {
    messages.push('Home stretch should be at least as long as the number of pawns.');
  }
  if (cfg.safe_offset >= cfg.track_size / cfg.yard_count) {
    messages.push('Safe haven offset is outside or near the next yard segment.');
  }

  const step = Math.floor(cfg.track_size / cfg.yard_count);
  const starts = Array.from({length: cfg.yard_count}, (_, i) => i * step);
  const safe = [...new Set([...starts, ...starts.map(s => (s + cfg.safe_offset) % cfg.track_size)])];
  warning.innerHTML = messages.concat([`Safe havens: { ${safe.join(', ')} }`]).join('<br>');
  return cfg;
}

function buildNewGamePayload(){
  const playerCount=parseInt(document.getElementById('set-num-players')?.value || settings.num_players || 4);
  const slotMode=document.getElementById('set-slot-mode')?.value || settings.slot_mode || 'fair';
  const boardCfg = validateBoardConfig();
  return {
    num_players:playerCount,
    rules:getGameRules(),
    config:{
      board:{
        max_players:boardCfg.max_players,
        track_size:boardCfg.track_size,
        yard_count:boardCfg.yard_count,
        home_length:boardCfg.home_length,
        pawns_per_player:boardCfg.pawns_per_player,
        safe_offset:boardCfg.safe_offset,
        stack_home_pawns:boardCfg.stack_home_pawns
      },
      player_count:playerCount,
      slot_mode:slotMode
    }
  };
}

async function loadTabs(){
  try{ const r=await fetch('/api/tabs'); tabConfig=(await r.json()).tabs; }
  catch{ tabConfig=[
    {id:'lobby',label:'Players',icon:'ti-users',enabled:true,default_visible:true,order:0},
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
function switchTab(id){ document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active')); document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active')); document.getElementById('tab-btn-'+id)?.classList.add('active'); document.getElementById('panel-'+id)?.classList.add('active'); if(id==='stats')loadStats(); if(id==='lobby')renderLobbySlots(); }
async function doAdminLogin(){adminToken='dev';}
async function doOverlayLogin(){adminToken='dev'; closeOverlay(); switchTab('admin');}
function closeOverlay(){ const o=document.getElementById('admin-overlay'); if(o)o.style.display='none'; }
function updateTabConfig(){}
async function saveTabConfig(){}

function gameInProgress(){
  return gameState && gameState.winner === null && (gameState.history?.length ?? 0) > 0;
}

function requestNewGame(){
  if(gameInProgress()){
    const ctrl = document.getElementById('new-game-control');
    if(!ctrl) { newGame(); return; }
    ctrl.innerHTML = `
      <div class="new-game-confirm">
        <span class="new-game-confirm-msg"><i class="fa-solid fa-triangle-exclamation"></i> Abandon current game?</span>
        <div class="new-game-confirm-btns">
          <button class="btn btn-danger btn-sm" onclick="newGame()">Yes, start new</button>
          <button class="btn btn-sm" onclick="cancelNewGame()">Cancel</button>
        </div>
      </div>`;
  } else {
    newGame();
  }
}

function cancelNewGame(){
  const ctrl = document.getElementById('new-game-control');
  if(ctrl) ctrl.innerHTML = `<button class="btn btn-primary" onclick="requestNewGame()"><i class="ti ti-plus"></i> New game</button>`;
}

async function newGame(){
  cancelNewGame();
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
function demoValidMoves(playerIdx,dice){ const p=gameState.players[playerIdx]; const moves=[]; p.pieces.forEach((pc,i)=>{ const g=playerIdx*(gameState?.config?.board?.pawns_per_player || 4)+i; if(pc.finished)return; if(pc.in_yard){ if(dice===6)moves.push({piece_idx:g,target:0}); } else { const t=pc.position+dice; if(t<=57)moves.push({piece_idx:g,target:t}); }}); return moves; }
async function clickPiece(globalIdx){ const m=(gameState?.valid_moves||[]).find(x=>x.piece_idx===globalIdx); if(m) await makeMove(globalIdx,m.target); }
async function makeMove(pieceIdx,target){
  const p=Math.floor(pieceIdx/(gameState?.config?.board?.pawns_per_player || 4)), i=pieceIdx%(gameState?.config?.board?.pawns_per_player || 4), pawn=gameState.players[p].pieces[i], from=pawn.position;
  await animatePawnSteps(pieceIdx,from,target);
  try{ const r=await fetch('/api/game/move',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({piece_idx:pieceIdx,target,target_position:target})}); if(!r.ok)throw new Error(); gameState=normalizeEngineState(await r.json()); }
  catch{ pawn.position=target; pawn.in_yard=false; pawn.finished=target>=57; pawn.absolute_position=target<52?absForPlayerPosition(p,target):null; gameState.history.push({player:p,piece:pieceIdx,from,to:target,dice:gameState.dice,round:gameState.round_count||0,events:{}}); if(gameState.dice===6){
      gameState.consecutive_sixes = (gameState.consecutive_sixes || 0) + 1;
      if (gameState.consecutive_sixes >= (settings.max_consecutive_sixes ?? 3)) {
        gameState.consecutive_sixes = 0;
        gameState.current_player=(gameState.current_player+1)%gameState.num_players;
      }
      gameState.phase='rolling';
      gameState.valid_moves=[];
    } else {
      gameState.consecutive_sixes = 0;
      gameState.current_player=(gameState.current_player+1)%gameState.num_players;
      gameState.phase='rolling';
      gameState.valid_moves=[];
    } }
  renderGame();
}

function renderGame(){
  if(!gameState)return; drawBoard(); renderCurrentAction(); renderPlayers(); renderPawnOptions(); renderMoveHistory(); updateSaveGameButton();
  const phase=gameState.phase, cp=gameState.current_player, color=COLORS[playerColorName(cp,gameState.num_players)]||COLORS.blue;
  const banner=document.getElementById('turn-banner'), name=document.getElementById('turn-player-name'), instr=document.getElementById('action-instruction'), roll=document.getElementById('roll-btn');
  banner.classList.remove('idle'); banner.style.background=color; banner.querySelector('i').className=getPlayerType(cp)!=='human'?'fa-solid fa-robot':'fa-solid fa-user'; name.textContent=`${getPlayerName(cp)}'s turn`;
  instr.textContent=phase==='rolling'?'Roll the dice.':phase==='moving'?'Choose one of the highlighted pawns to move.':phase==='next'?'Ending turn.':'Game finished.';
  roll.disabled=phase!=='rolling' || gameState.winner!==null; roll.style.background=roll.disabled?'':'#10099F'; roll.style.borderColor=roll.disabled?'':'#10099F';
}
function displayCellLabel(player,pos){ if(pos===-1||pos==null)return 'yard'; if(pos>=52)return `home ${pos-51}`; return `cell ${((pos+currentLayout().starts[playerSlot(player,gameState?.num_players||4)])%52)+1}`; }
function spacesRemaining(pos,finished=false){ if(finished)return 0; if(pos===-1||pos==null)return 57; return Math.max(0,57-pos); }

// Move history rendering lives in history.js.
function renderPlayers(){ const list=document.getElementById('players-list'); if(!list)return; const n=gameState?.num_players||parseInt(document.getElementById('set-num-players')?.value||4); const players=gameState?.players||Array.from({length:n},(_,i)=>({index:i,color:playerColorName(i,n),pieces:Array.from({length:(state.config?.board?.pawns_per_player || 4)},()=>({in_yard:true,finished:false}))})); list.innerHTML=players.map((p,i)=>{const col=COLORS[p.color]||COLORS.blue; return `<div class="player-order-row-min${p.index===gameState?.current_player?' current':''}"><i class="fa-solid ${getPlayerType(p.index)!=='human'?'fa-robot':'fa-user'}" style="color:${col}"></i><div><span class="player-order-name">${getPlayerName(p.index)}</span> <span class="player-order-place">${i+1}${['st','nd','rd'][i]||'th'}</span> <span class="player-order-dot">·</span> <span class="player-order-color">${p.color}</span></div><div class="player-order-pawns">${p.pieces.map(pc=>`<span class="player-order-pawn${pc.finished?' done':(!pc.in_yard?' active':'')}" style="--player-color:${col}"></span>`).join('')}</div></div>`}).join(''); }
function renderPlayerSlots() {
  const wrap = document.getElementById('player-slots');
  if (!wrap) return;
  const np = parseInt(document.getElementById('set-num-players')?.value || settings.num_players || 4);
  const mode = document.getElementById('set-slot-mode')?.value || settings.slot_mode || 'fair';
  const enabled = mode === 'fixed';
  const slots = assignSlots(np, mode === 'fixed' ? 'explicit' : mode);
  const order = playerDisplayOrder(np);
  wrap.innerHTML = `
    <p class="settings-help color-help">${enabled ? 'Choose colors for fixed assignment.' : 'Colors are assigned by the system. Select “Choose colors” to edit them.'}</p>
    ${order.map(i => {
      const slot = slots[i] ?? i;
      const colorName = PLAYER_COLORS[slot] || 'blue';
      const color = COLORS[colorName] || COLORS.blue;
      const type = getPlayerType(i);
      const icon = type !== 'human' ? 'fa-robot' : 'fa-user';
      const options = PLAYER_COLORS.slice(0, settings.board_yard_count || 4)
        .map((name, idx) => `<option value="${idx}" ${idx === slot ? 'selected' : ''}>${name}</option>`).join('');
      return `
        <div class="form-row player-slot-row ${enabled ? '' : 'disabled-color-row'}">
          <label><i class="fa-solid ${icon}" style="color:${color}" aria-hidden="true"></i> ${getPlayerName(i)} color</label>
          <select id="player-slot-${i}" onchange="setExplicitSlot(${i}, this.value)" ${enabled ? '' : 'disabled'}>
            ${options}
          </select>
        </div>`;
    }).join('')}
  `;
}

function renderPlayerTypes(){
  const wrap=document.getElementById('player-types');
  if(!wrap)return;
  const n=parseInt(document.getElementById('set-num-players')?.value||settings.num_players||4);
  const order = playerDisplayOrder(n);
  wrap.innerHTML = order.map((i, orderIdx)=>{
    const type = getPlayerType(i);
    const isHuman = type === 'human';
    const slot = playerSlot(i, n);
    const colorName = PLAYER_COLORS[slot] || 'blue';
    const color = COLORS[colorName] || COLORS.blue;
    const humanName = settings.player_names?.[i] || DEFAULT_HUMAN_NAMES[i] || `Player ${i+1}`;
    const botName = settings.bot_names?.[i] || botDisplayName(i);
    const icon = isHuman ? 'fa-user' : 'fa-robot';
    return `<div class="player-config-row" draggable="false" data-player="${i}">
      <div class="player-config-main">
        <i class="fa-solid ${icon}" style="color:${color}" aria-hidden="true"></i>
        <div class="player-config-fields">
          <div class="form-row compact-row">
            <label>Player ${i+1}</label>
            <select onchange="setPlayerType(${i},this.value)">
              <option value="human" ${type==='human'?'selected':''}>Human</option>
              <option value="random" ${type==='random'?'selected':''}>Robot</option>
            </select>
          </div>
          <div class="form-row compact-row">
            <label>${isHuman ? 'Name' : 'Bot'}</label>
            ${isHuman
              ? `<input type="text" value="${humanName}" onchange="setPlayerName(${i}, this.value)" onkeydown="if(event.key==='Enter')this.blur()">`
              : `<select onchange="settings.bot_names=settings.bot_names||{};settings.bot_names[${i}]=this.value;persistSettings();renderPlayers();renderPlayerTypes();renderPlayerSlots();">
                   <option value="${botName}" selected>${botName}</option>
                 </select>`
            }
          </div>
        </div>
      </div>
    </div>`;
  }).join('');
}

async function startTraining(){try{await fetch('/api/train/start',{method:'POST'});}catch{}}
async function stopTraining(){try{await fetch('/api/train/stop',{method:'POST'});}catch{}}
async function loadStats(){try{const r=await fetch('/api/stats'); const d=await r.json(); document.getElementById('st-games').textContent=d.games_played??0;}catch{}}
window.addEventListener('DOMContentLoaded', async () => { await (window.learn2ludoComponentsReady || Promise.resolve()); init(); });
