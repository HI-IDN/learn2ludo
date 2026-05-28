(function () {
  const DEFAULT_VOLUME = 0.8;
  let audioCtx = null;

  function settingsObj() {
    window.settings = window.settings || {};
    if (window.settings.sound_volume === undefined) window.settings.sound_volume = DEFAULT_VOLUME;
    return window.settings;
  }

  function getSoundVolume() {
    const v = Number(settingsObj().sound_volume);
    return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : DEFAULT_VOLUME;
  }

  function saveSoundSettings() {
    localStorage.setItem('ludo_settings', JSON.stringify(settingsObj()));
  }

  function setSoundVolume(value, preview = false) {
    settingsObj().sound_volume = Math.max(0, Math.min(1, Number(value) || 0));
    saveSoundSettings();
    updateSoundToggleUi();
    if (preview && getSoundVolume() > 0) playSound('move');
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
    if (getSoundVolume() <= 0) return;
    const ctx = getAudioCtx();
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  function updateSoundToggleUi() {
    const volume = getSoundVolume();
    const slider = document.getElementById('sound-volume-slider');
    const icon = document.getElementById('sound-volume-icon');
    if (slider) slider.value = volume;
    if (icon) icon.className = volume <= 0 ? 'fa-solid fa-volume-xmark' : 'fa-solid fa-volume-high';
  }

  function initSoundControls() {
    settingsObj();
    updateSoundToggleUi();
  }

  function gain(base) {
    return Math.max(0.0001, base * (0.2 + 1.8 * getSoundVolume()));
  }

  function tone(freq, duration, opts = {}) {
    const ctx = getAudioCtx();
    if (!ctx || getSoundVolume() <= 0) return;
    const t = ctx.currentTime + 0.005;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = opts.type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (opts.endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.endFreq), t + duration);
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(gain(opts.gain || 0.16), t + 0.006);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + duration + 0.035);
    osc.connect(amp);
    amp.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + duration + 0.06);
  }

  function playSound(kind) {
    if (kind === 'dice') {
      tone(340, 0.04, {type:'square', gain:0.18, endFreq:520});
      setTimeout(() => tone(430, 0.035, {type:'square', gain:0.14, endFreq:260}), 45);
    } else if (kind === 'move') {
      tone(420, 0.045, {gain:0.20, endFreq:470});
    } else if (kind === 'safe') {
      tone(520, 0.06, {type:'triangle', gain:0.22});
      setTimeout(() => tone(780, 0.07, {type:'triangle', gain:0.18}), 50);
    } else if (kind === 'complete' || kind === 'win') {
      tone(520, 0.08, {type:'triangle', gain:0.26});
      setTimeout(() => tone(660, 0.08, {type:'triangle', gain:0.26}), 80);
      setTimeout(() => tone(880, 0.14, {type:'triangle', gain:0.28}), 160);
    }
  }

  function playDiceRollSound() {
    playSound('dice');
  }

  Object.assign(window, {
    getSoundVolume,
    setSoundVolume,
    getAudioCtx,
    primeAudioForUserGesture,
    updateSoundToggleUi,
    initSoundControls,
    playSound,
    playDiceRollSound
  });
})();
