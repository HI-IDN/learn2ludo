const DICE_FACES = ['', '⚀','⚁','⚂','⚃','⚄','⚅'];
const COLORS = {red:'#AC1A2F', green:'#719500', yellow:'#F5CF47', blue:'#0098AA', purple:'#660451', orange:'#EB7125'};
const PLAYER_COLORS = ['red','green','yellow','blue','orange','purple'];
const ENGINE = {
  get track_size(){ return currentLayout()?.track_size ?? 52; },
  yard_count: 4,
  home_length: 6,
  phases: {ROLLING:'rolling', MOVING:'moving', NEXT:'next', FINISHED:'finished'}
};

let settings = {};
let gameState = null;
let gameStartingPlayer = null; // set when first player is determined
let tabConfig = [];
let adminToken = null;
let animatingPieceGlobalIdx = null;

function boardLayout(trackSize=52, yardCount=4) {
  const s = Math.floor(trackSize / yardCount);
  const starts = Array.from({length: yardCount}, (_, i) => i * s);
  const finishes = starts.map(x => (x - 1 + trackSize) % trackSize);
  const safeOffset = settings.board_safe_offset ?? 7;
  const safe_havens = new Set([
    ...starts,
    ...starts.map(start => (start + safeOffset) % trackSize)
  ]);
  return {track_size: trackSize, yard_count: yardCount, starts, finishes, safe_havens};
}
function currentLayout(){ return gameState?.board || boardLayout(); }

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
  if (type !== 'human') {
    const registry=typeof getBotRegistry==='function'?getBotRegistry():[];
    const botId=settings.bot_ids?.[i] ?? registry[0]?.id;
    if (botId) {
      const bot=registry.find(b=>b.id===botId);
      if (bot) return bot.name;
    }
    return settings.bot_names?.[i] || 'Bot';
  }
  return settings.player_names?.[i] || DEFAULT_HUMAN_NAMES[i] || `Player ${i+1}`;
}
function setPlayerType(i,v){ settings.player_types=settings.player_types||{}; settings.player_types[i]=v; syncPlayerCountOptions(); validateBoardConfig(); persistSettings(); renderPlayerTypes(); renderPlayerSlots(); renderPlayers(); }
function setPlayerName(i,v){ settings.player_names=settings.player_names||{}; settings.player_names[i]=v; persistSettings(); renderPlayers(); renderPlayerSlots(); }
function persistSettings(){ localStorage.setItem('ludo_settings', JSON.stringify(settings)); }

function normalizeEngineState(raw) {
  const state = raw?.game || raw?.state || raw || {};
  const cfg = state.config || {};
  const playerCount = cfg.player_count || state.player_count || state.num_players || parseInt(document.getElementById('set-num-players')?.value || settings.num_players || 4);
  const slots = state.slots || Array.from({length: playerCount}, (_, i) => i);
  const layout = state.board || boardLayout(cfg.board?.track_size || 52, cfg.board?.yard_count || 4);
  const players = state.players || Array.from({length: playerCount}, (_, p) => ({
    index:p, color:PLAYER_COLORS[slots[p]],
    pieces:Array.from({length:(gameState?.config?.board?.pawns_per_player || 4)}, (_,i)=>({index:i, position:-1, finished:false, in_yard:true, absolute_position:null}))
  }));
  return {
    ...state,
    config:{board:{track_size:cfg.board?.track_size||52,yard_count:cfg.board?.yard_count||4,home_length:cfg.board?.home_length||6}, player_count:playerCount},
    board:layout, slots, num_players:playerCount,
    current_player: state.current_player ?? state.player ?? 0,
    dice: state.dice ?? state.last_roll ?? 0,
    phase: state.phase || 'rolling',
    players, valid_moves: state.valid_moves || [], history: state.history || [], winner: state.winner ?? null
  };
}



async function init(){
  loadSettings(); applySettingsToControls(); if(typeof initSoundControls==='function') initSoundControls(); await loadTabs(); await loadStats(); await loadBotRegistry(); renderPlayers(); renderLobbySlots(); drawBoard();
}
function loadSettings(){
  try{ settings=JSON.parse(localStorage.getItem('ludo_settings')||'{}'); }catch{settings={};}
  settings.auto_play_speed='off';
  if(settings.sound_volume===undefined) settings.sound_volume=0.8;
}
function applySettingsToControls(){
  const c=(id,v)=>{const e=document.getElementById(id); if(e)e.checked=v;};
  const val=(id,v)=>{const e=document.getElementById(id); if(e)e.value=v;};
  c('rule-safe', settings.safe_squares ?? true); c('rule-equal-turns', settings.equal_rounds ?? false); c('set-show-cell-numbers', settings.show_cell_numbers ?? false); val('rule-max-sixes', settings.max_consecutive_sixes ?? 3); val('rule-empty-board-rolls', settings.empty_board_rolls ?? 3);
  val('set-num-players', settings.num_players ?? 4); val('board-yard-count', settings.board_yard_count ?? 4); val('board-track-size', settings.board_track_size ?? 52); val('board-safe-offset', settings.board_safe_offset ?? 7); val('board-home-length', settings.board_home_length ?? 6); val('board-pawns-per-player', settings.pawns_per_player ?? 4); c('board-stack-home', settings.stack_home_pawns ?? false);
}
function saveSettings(){
  const boardCfg = readBoardConfig();
  settings={...settings,
    num_players: settings.num_players ?? 4,
    board_yard_count: boardCfg.yard_count ?? settings.board_yard_count ?? 4,
    board_track_size: boardCfg.track_size ?? settings.board_track_size ?? 52,
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
    equal_rounds:document.getElementById('rule-equal-turns')?.checked ?? false,
    show_cell_numbers:document.getElementById('set-show-cell-numbers')?.checked ?? false,

    sound_volume: typeof getSoundVolume==='function' ? getSoundVolume() : (settings.sound_volume ?? 0.8)
  };
  validateBoardConfig(); persistSettings(); renderPlayers(); renderLobbySlots(); drawBoard();
}
function getGameRules(){ return {six_to_enter:true, six_extra_turn:true, capture_enabled:true, safe_squares: settings.safe_squares ?? true, max_consecutive_sixes: settings.max_consecutive_sixes ?? 3, no_pawn_three_rolls:true, empty_board_rolls: settings.empty_board_rolls ?? 3, equal_rounds: settings.equal_rounds ?? false}; }

function readBoardConfig() {
  const yardCount = Math.max(2, Math.min(6, parseInt(document.getElementById('board-yard-count')?.value || settings.board_yard_count || 4)));
  const homeLength = Math.max(2, parseInt(document.getElementById('board-home-length')?.value || settings.board_home_length || 6));
  const trackSize = yardCount * (2 * homeLength + 1);
  const pawns = Math.max(1, Math.min(4, parseInt(document.getElementById('board-pawns-per-player')?.value || settings.pawns_per_player || 4)));
  const safeOffset = Math.max(1, parseInt(document.getElementById('board-safe-offset')?.value || settings.board_safe_offset || 7));
  const stackHome = document.getElementById('board-stack-home')?.checked ?? !!settings.stack_home_pawns;

  return {
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
  const maxPlayers = readBoardConfig().yard_count || 4;
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
  const activeSlots=typeof lobbyActiveSlots==='function'?lobbyActiveSlots():null;
  const playerCount=activeSlots?activeSlots.length:parseInt(document.getElementById('set-num-players')?.value||settings.num_players||4);
  const boardCfg = validateBoardConfig();
  return {
    num_players:playerCount,
    rules:getGameRules(),
    config:{
      board:{
        track_size:boardCfg.track_size,
        yard_count:boardCfg.yard_count,
        home_length:boardCfg.home_length,
        pawns_per_player:boardCfg.pawns_per_player,
        safe_offset:boardCfg.safe_offset,
        stack_home_pawns:boardCfg.stack_home_pawns
      },
      player_count:playerCount,
      explicit_slots:activeSlots||Array.from({length:playerCount},(_,i)=>i)
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
function switchTab(id){ document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active')); document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active')); document.getElementById('tab-btn-'+id)?.classList.add('active'); document.getElementById('panel-'+id)?.classList.add('active'); if(id==='stats')loadStats(); if(id==='lobby')renderLobbySlots(); if(id==='bots')renderBotsPage(); }
async function doAdminLogin(){adminToken='dev';}
async function doOverlayLogin(){adminToken='dev'; closeOverlay(); switchTab('admin');}
function closeOverlay(){ const o=document.getElementById('admin-overlay'); if(o)o.style.display='none'; }
function updateTabConfig(){}
async function saveTabConfig(){}

function gameInProgress(){
  return gameState && gameState.winner === null;
}

function requestNewGame(){
  gameStartingPlayer=null;
  // Use the current game's slots so the pregame matches the Players panel.
  // Fall back to lobby slots when there's no active game.
  const slots = gameState?.slots ?? (typeof lobbyActiveSlots==='function' ? lobbyActiveSlots() : null);
  if(gameInProgress()){
    const ctrl = document.getElementById('new-game-control');
    if(!ctrl) { showPregame(slots); return; }
    ctrl.innerHTML = `
      <div class="new-game-confirm">
        <span class="new-game-confirm-msg"><i class="fa-solid fa-triangle-exclamation"></i> Abandon current game?</span>
        <div class="new-game-confirm-btns">
          <button class="btn btn-danger btn-sm" onclick="cancelNewGame();showPregame(${JSON.stringify(slots)})">Yes, new game</button>
          <button class="btn btn-sm" onclick="cancelNewGame()">Cancel</button>
        </div>
      </div>`;
  } else {
    showPregame(slots);
  }
}

function cancelNewGame(){
  const ctrl = document.getElementById('new-game-control');
  if(ctrl) ctrl.innerHTML = `<button class="btn btn-primary" onclick="requestNewGame()"><i class="ti ti-plus"></i> New game</button>`;
}

let _gameStartTime=null;
let _elapsedTimer=null;
let _playerTimes={};       // accumulated ms per player index
let _turnStartTime=null;   // when the current player's turn began
let _lastTurnPlayer=null;  // player index we last accumulated for

function startElapsedTimer(){
  _gameStartTime=Date.now();
  _playerTimes={};
  _turnStartTime=Date.now();
  _lastTurnPlayer=null;
  clearInterval(_elapsedTimer);
  _elapsedTimer=setInterval(()=>renderPlayers(),1000);
}
function _startGameClock(){
  // Start the wall-clock only (no per-player turn tracking yet — used during pregame).
  _gameStartTime=Date.now();
  _playerTimes={};
  _turnStartTime=null;
  _lastTurnPlayer=null;
  clearInterval(_elapsedTimer);
  _elapsedTimer=setInterval(()=>renderPlayers(),1000);
}
function _startTurnTracking(){
  // Begin per-player turn timing; preserves _gameStartTime set by _startGameClock.
  _playerTimes={};
  _turnStartTime=Date.now();
  _lastTurnPlayer=null;
}
function stopElapsedTimer(){
  clearInterval(_elapsedTimer); _elapsedTimer=null;
  if(_turnStartTime!=null&&_lastTurnPlayer!=null){
    _playerTimes[_lastTurnPlayer]=(_playerTimes[_lastTurnPlayer]||0)+(Date.now()-_turnStartTime);
    _turnStartTime=null;
  }
}
function _formatElapsed(){ const s=Math.floor((Date.now()-(_gameStartTime||Date.now()))/1000); const m=Math.floor(s/60); return `${m}:${String(s%60).padStart(2,'0')}`; }
function _formatPlayerTime(ms){ if(!ms)return '0:00'; const s=Math.floor(ms/1000); return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`; }

async function newGame(startingPlayer=0){
  gameStartingPlayer=startingPlayer;
  cancelNewGame();
  if(typeof primeAudioForUserGesture==='function') primeAudioForUserGesture();
  if(typeof resetBotState==='function') resetBotState();
  const payload=buildNewGamePayload();
  payload.config.starting_player=startingPlayer;
  try{
    const r=await fetch('/api/game/new',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    if(!r.ok) throw new Error(r.status);
    gameState=normalizeEngineState(await r.json());
  } catch(e){
    gameState=makeDemoState(payload?.config?.player_count ?? 2, payload?.config?.explicit_slots);
  }
  if(_gameStartTime) _startTurnTracking(); else startElapsedTimer();
  renderGame();
}
function makeDemoState(n=4,explicit_slots=null){ const slots=explicit_slots||Array.from({length:n},(_,i)=>i); const hl=settings.board_home_length||6; const ts=n*(2*hl+1); return normalizeEngineState({config:{player_count:n,board:{track_size:ts,yard_count:n,home_length:hl}}, slots, phase:'rolling', player:0}); }
function animateDice(finalValue){
  const face=document.getElementById('dice-face');
  if((settings?.auto_play_speed||'off')==='fast'){ face.textContent=DICE_FACES[finalValue]||DICE_FACES[1]; return Promise.resolve(); }
  const start=performance.now(); face.classList.add('rolling'); if(typeof playDiceRollSound==='function')playDiceRollSound();
  return new Promise(resolve=>{ const timer=setInterval(()=>{ face.textContent=DICE_FACES[1+Math.floor(Math.random()*6)]; if(performance.now()-start>=650){clearInterval(timer); face.textContent=DICE_FACES[finalValue]||DICE_FACES[1]; face.classList.remove('rolling'); resolve();}},55); });
}
async function rollDice(){
  if(typeof primeAudioForUserGesture==='function') primeAudioForUserGesture(); if(!gameState)return;
  const diceEl=document.getElementById('dice-face'); if(diceEl){diceEl.style.cursor='default';diceEl.style.opacity='0.45';}
  try{ const r=await fetch('/api/game/roll',{method:'POST'}); const d=await r.json(); const dice=Number(d.dice ?? d.roll ?? d.last_roll ?? d.value ?? d); await animateDice(dice); gameState=normalizeEngineState(d.game||d.state||d); if(!gameState.dice)gameState.dice=dice; }
  catch{ const dice=1+Math.floor(Math.random()*6); await animateDice(dice); gameState.dice=dice; gameState.last_roll=dice; gameState.phase='moving'; gameState.valid_moves=demoValidMoves(gameState.current_player,dice); }
  renderGame();
}
function demoValidMoves(playerIdx,dice){ const p=gameState.players[playerIdx]; const moves=[]; p.pieces.forEach((pc,i)=>{ const g=playerIdx*(gameState?.config?.board?.pawns_per_player || 4)+i; if(pc.finished)return; if(pc.in_yard){ if(dice===6)moves.push({piece_idx:g,target:0}); } else { const t=pc.position+dice; if(t<=57)moves.push({piece_idx:g,target:t}); }}); return moves; }
async function clickPiece(globalIdx){ if(window._botChosenMove&&window._botChosenMove.piece_idx!==globalIdx)return; const m=(gameState?.valid_moves||[]).find(x=>x.piece_idx===globalIdx); if(m) await makeMove(globalIdx,m.target); }
async function makeMove(pieceIdx,target){ window._botChosenMove=null;
  const p=Math.floor(pieceIdx/(gameState?.config?.board?.pawns_per_player || 4)), i=pieceIdx%(gameState?.config?.board?.pawns_per_player || 4), pawn=gameState.players[p].pieces[i], from=pawn.position;
  await animatePawnSteps(pieceIdx,from,target);
  try{ const r=await fetch('/api/game/move',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({piece_idx:pieceIdx,target,target_position:target})}); if(!r.ok)throw new Error(); gameState=normalizeEngineState(await r.json()); }
  catch{ const _ts=currentLayout().track_size; pawn.position=target; pawn.in_yard=false; pawn.finished=target>=57; pawn.absolute_position=target<_ts?absForPlayerPosition(p,target):null; gameState.history.push({player:p,piece:pieceIdx,from,to:target,dice:gameState.dice,round:gameState.round_count||0,events:{}}); if(gameState.dice===6){
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

function toggleSection(id){
  const el=document.getElementById(id);
  if(el) el.classList.toggle('collapsed');
}

const _AUTO_SPEEDS = ['off', 'normal', 'fast'];
const _AUTO_DELAY  = { normal: { roll: 900, move: 600 }, fast: { roll: 200, move: 150 } };
function toggleAutoPlay() {
  const cur = settings.auto_play_speed || 'off';
  settings.auto_play_speed = _AUTO_SPEEDS[(_AUTO_SPEEDS.indexOf(cur) + 1) % _AUTO_SPEEDS.length];
  persistSettings();
  if (gameState) { renderGame(); if (cur === 'off') _kickAutoPlay(); }
  else _updateAutoPlayBtn();
}
function _kickAutoPlay() {
  if (typeof _pg !== 'undefined' && _pg) return; // pregame handles its own rolls
  if (!gameState || gameState.phase !== 'rolling' || gameState.winner !== null) return;
  const speed = settings.auto_play_speed || 'off';
  if (speed === 'off') return;
  const delay = speed === 'fast' ? 50 : 120;
  if (getPlayerType(gameState.current_player) === 'human') {
    clearTimeout(_autoRollTimer);
    _autoRollTimer = setTimeout(rollDice, delay);
  } else if (typeof scheduleBotPlay === 'function') {
    scheduleBotPlay(delay);
  }
}
function _updateAutoPlayBtn() {
  const btn = document.getElementById('auto-play-btn');
  if (!btn) return;
  const speed = settings.auto_play_speed || 'off';
  btn.classList.toggle('active', speed !== 'off');
  btn.classList.toggle('fast', speed === 'fast');
  const icons  = { off: 'fa-pause', normal: 'fa-play', fast: 'fa-forward' };
  const labels = { off: 'Pause', normal: 'Normal', fast: 'Fast' };
  btn.innerHTML = `<i class="fa-solid ${icons[speed]}"></i> ${labels[speed]}`;
}

let _autoRollTimer = null;
function scheduleAutoRoll() {
  clearTimeout(_autoRollTimer);
  if (typeof _pg !== 'undefined' && _pg) return; // pregame drives its own rolls
  const speed = settings.auto_play_speed || 'off';
  if (speed === 'off') return;
  if (!gameState || gameState.phase !== 'rolling' || gameState.winner !== null) return;
  if (getPlayerType(gameState.current_player) !== 'human') return;
  _autoRollTimer = setTimeout(rollDice, _AUTO_DELAY[speed].roll);
}

function renderGame(){
  if(!gameState)return;
  // Accumulate per-player turn time when the active player changes.
  const _cp=gameState.current_player;
  if(_turnStartTime!=null&&_lastTurnPlayer!=null&&_cp!==_lastTurnPlayer){
    _playerTimes[_lastTurnPlayer]=(_playerTimes[_lastTurnPlayer]||0)+(Date.now()-_turnStartTime);
    _turnStartTime=Date.now();
  }
  if(_lastTurnPlayer!==_cp) _lastTurnPlayer=_cp;
  drawBoard(); renderCurrentAction(); renderPlayers(); renderPawnOptions(); renderMoveHistory(); updateSaveGameButton();
  _updateAutoPlayBtn();
  if(typeof scheduleBotPlay==='function') scheduleBotPlay();
  if(typeof suggestBotMove==='function') suggestBotMove();
  scheduleAutoRoll();
  // When auto-play is active and the move is unambiguous (≤1 valid move), execute without preview.
  const _apSpeed = settings.auto_play_speed || 'off';
  if(_apSpeed !== 'off' && gameState.phase==='moving' && gameState.winner===null
      && getPlayerType(gameState.current_player)==='human' && gameState.valid_moves?.length===1){
    const m=gameState.valid_moves[0];
    setTimeout(()=>makeMove(m.piece_idx,m.target), _AUTO_DELAY[_apSpeed].move);
  }
}
function displayCellLabel(player,pos){ if(pos===-1||pos==null)return 'Y'; const ts=currentLayout().track_size; if(pos>=ts)return `H${pos-ts+1}`; const abs=(pos+currentLayout().starts[playerSlot(player,gameState?.num_players||4)])%ts; return `T${abs+1}`; }
function spacesRemaining(pos,finished=false){ if(finished)return 0; if(pos===-1||pos==null)return 57; return Math.max(0,57-pos); }

// Move history rendering lives in history.js.
function renderPlayers(){
  const list=document.getElementById('players-list'); if(!list)return;
  const lobbyN=typeof lobbyActiveSlots==='function'?lobbyActiveSlots().length:null;
  const n=gameState?.num_players||lobbyN||parseInt(document.getElementById('set-num-players')?.value||4);
  const players=gameState?.players||Array.from({length:n},(_,i)=>({index:i,color:playerColorName(i,n),pieces:Array.from({length:(gameState?.config?.board?.pawns_per_player||4)},()=>({in_yard:true,finished:false}))}));
  // Always show in slot/color order
  const sorted=[...players].sort((a,b)=>playerSlot(a.index,n)-playerSlot(b.index,n));
  const ordinals=['1st','2nd','3rd','4th','5th','6th'];
  list.innerHTML=sorted.map((p)=>{
    const col=COLORS[p.color]||COLORS.blue;
    const inPregame=typeof _pg!=='undefined'&&_pg!==null;
    const turnPos=!inPregame&&gameStartingPlayer!=null?((p.index-gameStartingPlayer+n)%n):null;
    const ordinal=inPregame?`<span class="player-order-place"> · ?</span>`:(turnPos!=null?`<span class="player-order-place"> · ${ordinals[turnPos]||turnPos+1+'th'}</span>`:'');
    const isCurrent=p.index===gameState?.current_player;
    const liveMs=(_playerTimes[p.index]||0)+(_gameStartTime&&isCurrent&&_turnStartTime?Date.now()-_turnStartTime:0);
    const timeStr=_gameStartTime?`<span class="player-order-dot"> · </span><span class="player-order-time">${_formatPlayerTime(liveMs)}</span>`:'';
    const sortedPieces=[...p.pieces].sort((a,b)=>{const r=q=>q.finished?2:!q.in_yard?1:0;return r(b)-r(a);});
    return `<div class="player-order-row-min${isCurrent?' current':''}"><i class="fa-solid ${getPlayerType(p.index)!=='human'?'fa-robot':'fa-user'}" style="color:${col}"></i><div><span class="player-order-name">${getPlayerName(p.index)}</span><span class="player-order-dot"> · </span><span class="player-order-color">${p.color}</span>${ordinal}${timeStr}</div><div class="player-order-pawns">${sortedPieces.map(pc=>`<span class="player-order-pawn${pc.finished?' done':(!pc.in_yard?' active':'')}" style="--player-color:${col}"></span>`).join('')}</div></div>`;
  }).join('');
  // Round subtitle
  const sub=document.getElementById('players-subtitle');
  if(sub&&gameState&&gameState.phase!=='rolling'||gameState?.history?.length){
    const round=gameState?.round_count??null;
    if(sub&&round) sub.textContent=`· Round ${round}`;
  }
}
function renderPlayerSlots() {
  const wrap = document.getElementById('player-slots');
  if (!wrap) return;
  const np = parseInt(document.getElementById('set-num-players')?.value || settings.num_players || 4);
  const slots = Array.from({length: np}, (_, i) => i);
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
