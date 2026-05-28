// Learn2Ludo sound effects.
// Uses browser Web Audio; no external sound files are required.
// Volume 0 = muted. Any value above 0 enables sound.

(function () {
  const DEFAULT_SOUND_CONFIG = {
    sound_volume: 0.8,
    gains: {
      dice: 0.18,
      move: 0.22,
      safe: 0.28,
      capture_noise: 0.32,
      capture_tone: 0.26,
      complete: 0.32,
      win: 0.34
    }
  };

  let audioCtx = null;

  function settingsObj() {
    window.settings = window.settings || {};
    if (window.settings.sound_volume === undefined) window.settings.sound_volume = DEFAULT_SOUND_CONFIG.sound_volume;
    // Backward compatibility: if old sound_enabled was false, translate to volume 0 once.
    if (window.settings.sound_enabled === false && !window.settings._sound_enabled_migrated) {
      window.settings.sound_volume = 0;
      window.settings._sound_enabled_migrated = true;
      saveSoundSettings();
    }
    return window.settings;
  }

  function getSoundVolume() {
    const v = Number(settingsObj().sound_volume);
    return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : DEFAULT_SOUND_CONFIG.sound_volume;
  }

  function isSoundEnabled() {
    return getSoundVolume() > 0;
  }

  function saveSoundSettings() {
    const s = settingsObj();
    s.sound_enabled = getSoundVolume() > 0;
    localStorage.setItem('ludo_settings', JSON.stringify(s));
  }

  function setSoundEnabled(value) {
    settingsObj().sound_volume = value ? Math.max(getSoundVolume(), DEFAULT_SOUND_CONFIG.sound_volume) : 0;
    saveSoundSettings();
    updateSoundToggleUi();
  }

  function setSoundVolume(value, preview = false) {
    settingsObj().sound_volume = Math.max(0, Math.min(1, Number(value) || 0));
    saveSoundSettings();
    updateSoundToggleUi();
    if (preview && isSoundEnabled()) playSound('move');
  }

  function getAudioCtx() {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      audioCtx = new Ctx();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  function primeAudioForUserGesture() {
    if (!isSoundEnabled()) return;
    const ctx = getAudioCtx();
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  function updateSoundToggleUi() {
    const volume = getSoundVolume();
    const slider = document.getElementById('sound-volume-slider');
    const icon = document.getElementById('sound-volume-icon');

    if (slider) slider.value = volume;
    if (icon) {
      icon.className = volume <= 0
        ? 'fa-solid fa-volume-xmark'
        : 'fa-solid fa-volume-high';
    }
  }

  function initSoundControls() {
    settingsObj();
    updateSoundToggleUi();
  }

  // Kept for compatibility if older inline handlers still call it.
  function toggleSound() {
    setSoundEnabled(!isSoundEnabled());
  }

  function scaledGain(base) {
    // Nonlinear scaling makes low slider values useful and max clearly audible.
    const v = getSoundVolume();
    return Math.max(0.0001, base * (0.18 + 1.82 * v));
  }

  function tone(freq, start, duration, opts = {}) {
    const ctx = getAudioCtx();
    if (!ctx || !isSoundEnabled()) return;
    const type = opts.type || 'sine';
    const gain = scaledGain(opts.gain ?? 0.12);
    const attack = opts.attack ?? 0.006;
    const release = opts.release ?? 0.035;
    const endFreq = opts.endFreq ?? null;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (endFreq !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), start + duration);
    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.exponentialRampToValueAtTime(gain, start + attack);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + duration + release);
    osc.connect(amp);
    amp.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + duration + release + 0.02);
  }

  function noiseBurst(start, duration, opts = {}) {
    const ctx = getAudioCtx();
    if (!ctx || !isSoundEnabled()) return;
    const gain = scaledGain(opts.gain ?? 0.20);
    const filterFreq = opts.filterFreq ?? 900;
    const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    const src = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const amp = ctx.createGain();
    filter.type = 'bandpass';
    filter.frequency.value = filterFreq;
    amp.gain.setValueAtTime(gain, start);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    src.buffer = buffer;
    src.connect(filter);
    filter.connect(amp);
    amp.connect(ctx.destination);
    src.start(start);
  }

  function playSound(kind) {
    const ctx = getAudioCtx();
    if (!ctx || !isSoundEnabled()) return;
    const t = ctx.currentTime + 0.005;
    const g = DEFAULT_SOUND_CONFIG.gains;

    if (kind === 'dice') {
      noiseBurst(t, 0.055, { gain: g.dice * 0.55, filterFreq: 1500 });
      tone(300, t, 0.035, { type: 'square', gain: g.dice * 0.35, endFreq: 520 });
      tone(430, t + 0.045, 0.030, { type: 'square', gain: g.dice * 0.25, endFreq: 260 });
    } else if (kind === 'move') {
      tone(420, t, 0.045, { type: 'sine', gain: g.move, endFreq: 470 });
    } else if (kind === 'safe') {
      tone(520, t, 0.055, { type: 'triangle', gain: g.safe });
      tone(780, t + 0.045, 0.070, { type: 'triangle', gain: g.safe * 0.85 });
    } else if (kind === 'capture') {
      noiseBurst(t, 0.070, { gain: g.capture_noise, filterFreq: 620 });
      tone(220, t + 0.015, 0.090, { type: 'sawtooth', gain: g.capture_tone, endFreq: 120 });
    } else if (kind === 'complete') {
      tone(520, t, 0.070, { type: 'triangle', gain: g.complete });
      tone(660, t + 0.070, 0.070, { type: 'triangle', gain: g.complete });
      tone(880, t + 0.140, 0.120, { type: 'triangle', gain: g.complete * 1.1 });
    } else if (kind === 'win') {
      tone(392, t, 0.110, { type: 'triangle', gain: g.win });
      tone(523.25, t + 0.100, 0.110, { type: 'triangle', gain: g.win });
      tone(659.25, t + 0.200, 0.160, { type: 'triangle', gain: g.win * 1.1 });
      tone(783.99, t + 0.360, 0.260, { type: 'triangle', gain: g.win });
    }
  }

  function playDiceRollSound() {
    playSound('dice');
  }

  function testSound() {
    if (getSoundVolume() <= 0) setSoundVolume(DEFAULT_SOUND_CONFIG.sound_volume, false);
    const ctx = getAudioCtx();
    console.log('[Learn2Ludo sound test]', {
      sound_volume: getSoundVolume(),
      audio_context: !!ctx,
      state: ctx ? ctx.state : 'unavailable'
    });
    playSound('safe');
  }

  Object.assign(window, {
    isSoundEnabled,
    getSoundVolume,
    setSoundEnabled,
    setSoundVolume,
    getAudioCtx,
    primeAudioForUserGesture,
    updateSoundToggleUi,
    initSoundControls,
    toggleSound,
    playSound,
    playDiceRollSound,
    testSound
  });
})();
