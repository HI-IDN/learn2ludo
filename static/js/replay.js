// Learn2Ludo replay loader.
// Loads saved JSON and rebuilds board state by stepping through recorded events.

let replayData = null;
let replayIndex = -1;
let replaySnapshots = [];
let replayModeActive = false;
let replayFastForwardTimer = null;
let replayAutoMode = null;

async function loadReplayJsonFile(file) {
  if (!file) return;
  try {
    updateReplayStatus('Loading...');
    const text = await readReplayFile(file);
    loadReplayJson(JSON.parse(text));
  } catch (err) {
    console.error('[Learn2Ludo] Replay load failed:', err);
    updateReplayStatus('Could not load replay');
  } finally {
    const input = document.getElementById('replay-json-input');
    if (input) input.value = '';
  }
}

function readReplayFile(file) {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('File read failed'));
    reader.readAsText(file);
  });
}

function loadReplayJson(data) {
  stopReplayFastForward();
  if (typeof clearPregameMode === 'function') clearPregameMode();
  replayData = normalizeReplayData(data);
  applyReplaySettings(replayData);
  replaySnapshots = buildReplaySnapshots(replayData);
  replayModeActive = true;
  replayIndex = 0;
  applyReplaySnapshot(replayIndex);
}

function applyReplaySettings(data) {
  settings = {
    ...settings,
    auto_play_speed: 'off',
    num_players: data.num_players,
    board_yard_count: data.config.board.yard_count,
    board_track_size: data.config.board.track_size,
    board_home_length: data.config.board.home_length,
    board_safe_offset: data.config.board.safe_offset,
    pawns_per_player: data.config.board.pawns_per_player,
    player_names: {...(settings.player_names || {})},
    player_types: {...(settings.player_types || {})},
  };
  (data.players || []).forEach(p => {
    settings.player_names[p.index] = p.name || settings.player_names[p.index] || `Player ${p.index + 1}`;
    if (p.type) settings.player_types[p.index] = p.type;
  });
}

function replayStep(delta) {
  stopReplayFastForward();
  replayStepBy(delta);
}

function replayStepBy(delta) {
  if (!replaySnapshots.length) return;
  replayIndex = Math.max(0, Math.min(replaySnapshots.length - 1, replayIndex + delta));
  applyReplaySnapshot(replayIndex);
}

function toggleReplayFastForward(mode = 'fast') {
  if (!replayModeActive || !replaySnapshots.length) return;
  if (replayFastForwardTimer && replayAutoMode === mode) {
    stopReplayFastForward();
    updateReplayControls();
    return;
  }
  stopReplayFastForward();
  replayAutoMode = mode;
  replayFastForwardTimer = setInterval(() => {
    if (!replayModeActive || replayIndex >= replaySnapshots.length - 1) {
      stopReplayFastForward();
      updateReplayControls();
      return;
    }
    if (replayAutoMode === 'normal' && typeof playSound === 'function') playSound('move');
    replayStepBy(1);
  }, mode === 'fast' ? 90 : 650);
  updateReplayControls();
}

function stopReplayFastForward() {
  if (!replayFastForwardTimer) return;
  clearInterval(replayFastForwardTimer);
  replayFastForwardTimer = null;
  replayAutoMode = null;
}

function transportPauseOrBack() {
  if (isReplayActive()) {
    replayStep(-1);
    return;
  }
  if (typeof setLiveAutoSpeed === 'function') setLiveAutoSpeed('off');
}

function transportPlay() {
  if (isReplayActive()) {
    toggleReplayFastForward('normal');
    return;
  }
  if (typeof setLiveAutoSpeed === 'function') setLiveAutoSpeed('normal');
}

function transportFastForward() {
  if (isReplayActive()) {
    toggleReplayFastForward('fast');
    return;
  }
  if (typeof setLiveAutoSpeed === 'function') setLiveAutoSpeed('fast');
}

function isReplayActive() {
  return replayModeActive;
}

function clearReplayMode() {
  stopReplayFastForward();
  replayModeActive = false;
  replayData = null;
  replayIndex = -1;
  replaySnapshots = [];
  updateReplayControls();
}

function normalizeReplayData(data) {
  const cfg = data.config || {};
  const boardCfg = cfg.board || {};
  const players = data.players || [];
  const playerCount = cfg.player_count || players.length || data.num_players || 4;
  const pawnsPerPlayer = boardCfg.pawns_per_player || players[0]?.pawns?.length || 4;
  const homeLength = boardCfg.home_length || 6;
  const yardCount = boardCfg.yard_count || data.board?.yard_count || playerCount;
  const trackSize = boardCfg.track_size || data.board?.track_size || yardCount * (2 * homeLength + 1);
  const slots = data.slots?.length ? data.slots : players.map(p => p.slot ?? p.index);
  const history = replayableHistory(data.history || []);
  return {
    ...data,
    config: {
      ...cfg,
      player_count: playerCount,
      board: {
        track_size: trackSize,
        yard_count: yardCount,
        home_length: homeLength,
        pawns_per_player: pawnsPerPlayer,
        safe_offset: boardCfg.safe_offset || 7,
      },
    },
    board: normalizeReplayBoard(data.board, trackSize, yardCount, homeLength, boardCfg.safe_offset || 7),
    slots,
    players,
    history,
    num_players: playerCount,
  };
}

function replayableHistory(history) {
  const starts = history.map((e, i) => e.type === 'game_start' ? i : -1).filter(i => i >= 0);
  if (!starts.length) return history;
  return history.slice(starts[starts.length - 1]);
}

function normalizeReplayBoard(board, trackSize, yardCount, homeLength, safeOffset) {
  const layout = board || boardLayout(trackSize, yardCount);
  const step = Math.floor(trackSize / yardCount);
  const startOff = Math.floor((step - 1) / 2) + 2;
  const starts = layout.starts || Array.from({length: yardCount}, (_, i) => (i * step + startOff) % trackSize);
  return {
    track_size: trackSize,
    yard_count: yardCount,
    home_length: homeLength,
    starts,
    finishes: layout.finishes || starts.map(x => (x - 2 + trackSize) % trackSize),
    safe_havens: layout.safe_havens || [...new Set([...starts, ...starts.map(start => (start - safeOffset + trackSize) % trackSize)])],
  };
}

function buildReplaySnapshots(data) {
  const snapshots = [];
  const state = initialReplayState(data);
  data.history.forEach((event, i) => {
    applyReplayEvent(state, event);
    pushReplaySnapshot(snapshots, state, data.history.slice(0, i + 1));
  });
  if (!snapshots.length) pushReplaySnapshot(snapshots, state, []);
  return snapshots;
}

function initialReplayState(data) {
  const playerCount = data.config.player_count;
  const pawnsPerPlayer = data.config.board.pawns_per_player;
  const slots = data.slots?.length ? data.slots : Array.from({length: playerCount}, (_, i) => i);
  const players = Array.from({length: playerCount}, (_, pi) => {
    const saved = data.players?.find(p => Number(p.index) === pi) || {};
    const color = saved.color || PLAYER_COLORS[slots[pi]] || playerColorName(pi, playerCount);
    return {
      index: pi,
      name: saved.name || `Player ${pi + 1}`,
      type: saved.type || 'human',
      color,
      pieces: Array.from({length: pawnsPerPlayer}, (_, i) => ({
        index: i,
        pawn_id: saved.pawns?.[i]?.id || pawnId(color, i),
        position: -1,
        in_yard: true,
        finished: false,
        absolute_position: null,
      })),
    };
  });
  return normalizeEngineState({
    config: data.config,
    board: data.board,
    slots,
    players,
    history: [],
    phase: 'rolling',
    player: data.starting_player ?? 0,
    current_player: data.starting_player ?? 0,
    dice: 0,
    winner: null,
    winners: [],
    starting_player: data.starting_player ?? null,
    starting_player_color: data.starting_player_color ?? null,
  });
}

function applyReplayEvent(state, event) {
  if (event.type === 'game_start') {
    state.starting_player = event.player;
    state.starting_player_color = event.color || state.players[event.player]?.color || null;
    state.current_player = event.player;
    state.phase = 'rolling';
    return;
  }
  if (event.type === 'roll' || event.type === 'yard_roll') {
    state.current_player = event.player;
    state.dice = event.dice || 0;
    state.last_roll = state.dice;
    state.phase = event.valid_moves?.length ? 'moving' : 'rolling';
    state.valid_moves = event.valid_moves || [];
    return;
  }
  if (event.type === 'move') {
    const piece = replayPieceForEvent(state, event.player, event);
    if (piece) {
      piece.position = event.to;
      piece.in_yard = event.to === -1;
      const entry = (state.config?.board?.track_size || 52) - 1;
      const finish = entry + (state.config?.board?.home_length || 6) - 1;
      piece.finished = event.to >= finish;
      const slot = state.slots?.[event.player] ?? event.player;
      piece.absolute_position = event.to >= 0 && event.to < entry
        ? (event.to + state.board.starts[slot]) % state.board.track_size
        : null;
    }
    state.current_player = event.player;
    state.phase = 'rolling';
    state.valid_moves = [];
    return;
  }
  if (event.type === 'capture') {
    const piece = replayPieceForEvent(state, event.captured_player, {
      pawn_id: event.captured_pawn_id,
      piece: event.captured_piece,
    });
    if (piece) {
      piece.position = -1;
      piece.in_yard = true;
      piece.finished = false;
      piece.absolute_position = null;
    }
    return;
  }
  if (event.type === 'game_winner') {
    state.winner = event.player;
    state.winners = event.winners || [event.player];
    state.winner_color = event.color || state.players[event.player]?.color || null;
    state.winner_colors = event.winner_colors || state.winners.map(w => state.players[w]?.color);
    state.current_player = event.player;
    state.phase = 'finished';
  }
}

function replayPieceForEvent(state, playerIdx, event) {
  const pieces = state.players?.find(p => Number(p.index) === Number(playerIdx))?.pieces || [];
  if (event.pawn_id) {
    const byId = pieces.find(p => String(p.pawn_id).toUpperCase() === String(event.pawn_id).toUpperCase());
    if (byId) return byId;
  }
  const pawnsPerPlayer = state.config?.board?.pawns_per_player || 4;
  const localIdx = typeof event.piece === 'number' ? event.piece % pawnsPerPlayer : 0;
  return pieces[localIdx] || null;
}

function pushReplaySnapshot(snapshots, state, history) {
  snapshots.push(JSON.parse(JSON.stringify({...state, history})));
}

function applyReplaySnapshot(index) {
  const snapshot = replaySnapshots[index];
  if (!snapshot) return;
  gameState = normalizeEngineState(snapshot);
  gameStartingPlayer = gameState.starting_player;
  if (typeof resetBotState === 'function') resetBotState();
  if (typeof stopElapsedTimer === 'function') stopElapsedTimer();
  if (typeof setSessionHistory === 'function') setSessionHistory(gameState.history || []);
  renderGame();
  updateReplayControls();
}

function updateReplayControls() {
  const prev = document.getElementById('replay-prev-btn');
  const play = document.getElementById('replay-play-btn');
  const next = document.getElementById('replay-next-btn');
  const status = document.getElementById('replay-status');
  if (!replayModeActive) {
    if (typeof updateLiveTransportControls === 'function') updateLiveTransportControls();
    return;
  }
  if (prev) {
    prev.disabled = !replaySnapshots.length || replayIndex <= 0;
    prev.classList.remove('active');
    prev.innerHTML = '<i class="fa-solid fa-step-backward"></i>';
    prev.title = 'Previous replay step';
  }
  if (play) {
    play.disabled = !replaySnapshots.length || replayIndex >= replaySnapshots.length - 1;
    play.classList.toggle('active', replayAutoMode === 'normal');
    play.innerHTML = replayAutoMode === 'normal' ? '<i class="fa-solid fa-pause"></i>' : '<i class="fa-solid fa-play"></i>';
    play.title = replayAutoMode === 'normal' ? 'Pause replay' : 'Play replay';
  }
  if (next) {
    next.disabled = !replaySnapshots.length || replayIndex >= replaySnapshots.length - 1;
    next.classList.toggle('active', replayAutoMode === 'fast');
    next.innerHTML = replayAutoMode === 'fast' ? '<i class="fa-solid fa-pause"></i>' : '<i class="fa-solid fa-forward"></i>';
    next.title = replayAutoMode === 'fast' ? 'Pause fast replay' : 'Fast replay';
  }
  if (status) status.textContent = replaySnapshots.length ? `${replayIndex + 1}/${replaySnapshots.length}` : '';
  updateSaveGameButton();
}

function updateReplayStatus(text) {
  const status = document.getElementById('replay-status');
  if (status) status.textContent = text || '';
}
