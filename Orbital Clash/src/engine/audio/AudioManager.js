// Procedurally synthesized music/SFX via Web Audio API (no external audio files needed).

import { getSettings } from "../settings.js";

const MUSIC_BUS_GAIN = 0.72;
const SFX_BUS_GAIN = 0.85;

const noiseBufferCache = new WeakMap();

function getSharedNoiseBuffer(ctx) {
  if (!noiseBufferCache.has(ctx)) {
    const bufferSize = Math.floor(ctx.sampleRate * 2);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    noiseBufferCache.set(ctx, buffer);
  }
  return noiseBufferCache.get(ctx);
}

function playTone(ctx, dest, freq, time, duration, opts = {}) {
  const { type = "sine", gain = 0.2, attack = 0.01, release = 0.1, detune = 0, lowpass = null } = opts;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, time);
  if (detune) osc.detune.setValueAtTime(detune, time);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, time);
  env.gain.exponentialRampToValueAtTime(Math.max(gain, 0.0001), time + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, time + duration + release);

  let outputNode = osc;
  if (lowpass) {
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(lowpass, time);
    osc.connect(filter);
    outputNode = filter;
  }
  outputNode.connect(env);
  env.connect(dest);

  osc.start(time);
  osc.stop(time + duration + release + 0.05);
}

function playThump(ctx, dest, time, freq, duration, opts = {}) {
  const { gain = 0.3, pitchDrop = 0.35 } = opts;
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, time);
  osc.frequency.exponentialRampToValueAtTime(Math.max(freq * pitchDrop, 20), time + duration);

  const env = ctx.createGain();
  env.gain.setValueAtTime(Math.max(gain, 0.0001), time);
  env.gain.exponentialRampToValueAtTime(0.0001, time + duration);

  osc.connect(env);
  env.connect(dest);
  osc.start(time);
  osc.stop(time + duration + 0.05);
}

function playNoiseBurst(ctx, dest, time, duration, opts = {}) {
  const { filterType = "lowpass", filterFreq = 2000, gain = 0.2, sweepTo = null, q = 1 } = opts;
  const source = ctx.createBufferSource();
  source.buffer = getSharedNoiseBuffer(ctx);

  const filter = ctx.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.setValueAtTime(filterFreq, time);
  filter.Q.value = q;
  if (sweepTo) filter.frequency.exponentialRampToValueAtTime(sweepTo, time + duration);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, time);
  env.gain.exponentialRampToValueAtTime(Math.max(gain, 0.0001), time + Math.min(0.01, duration / 4));
  env.gain.exponentialRampToValueAtTime(0.0001, time + duration);

  source.connect(filter);
  filter.connect(env);
  env.connect(dest);

  source.start(time);
  source.stop(time + duration + 0.05);
}

// A short metallic "shing": a bright noise sweep plus a detuned tone pair. This is
// the base of every edged-weapon sound (slices, swings, scrapes).
function playMetalSlice(ctx, dest, time, opts = {}) {
  const { baseFreq = 2600, sweepTo = 9000, gain = 0.3, duration = 0.16, ring = 3200 } = opts;
  playNoiseBurst(ctx, dest, time, duration, {
    filterType: "bandpass", filterFreq: baseFreq, sweepTo, gain, q: 2.4
  });
  playTone(ctx, dest, ring, time, duration * 0.7, { type: "triangle", gain: gain * 0.4, attack: 0.002, release: 0.12 });
  playTone(ctx, dest, ring * 1.52, time, duration * 0.5, { type: "triangle", gain: gain * 0.22, attack: 0.002, release: 0.1 });
}

// A wet, percussive stab: very short noise transient with a downward tone drop.
function playStab(ctx, dest, time, opts = {}) {
  const { gain = 0.34, freq = 240 } = opts;
  playNoiseBurst(ctx, dest, time, 0.06, { filterType: "highpass", filterFreq: 1400, gain: gain * 1.2 });
  playThump(ctx, dest, time, freq, 0.13, { gain, pitchDrop: 0.45 });
}

// A dull impact for blunt/bodily contact - heavy, no high end.
function playCrush(ctx, dest, time, opts = {}) {
  const { gain = 0.4, freq = 130 } = opts;
  playThump(ctx, dest, time, freq, 0.2, { gain, pitchDrop: 0.3 });
  playNoiseBurst(ctx, dest, time, 0.14, { filterType: "lowpass", filterFreq: 700, gain: gain * 0.6 });
}

// An electric crackle for shock/electric effects.
function playZap(ctx, dest, time, opts = {}) {
  const { gain = 0.26, freq = 1500 } = opts;
  playNoiseBurst(ctx, dest, time, 0.09, { filterType: "bandpass", filterFreq: freq, sweepTo: 320, gain, q: 6 });
  playTone(ctx, dest, freq * 0.7, time, 0.08, { type: "square", gain: gain * 0.5, attack: 0.001, release: 0.06 });
}

// A deep, round explosion with a bright crack on top.
function playExplosion(ctx, dest, time, opts = {}) {
  const { gain = 0.5, freq = 90 } = opts;
  playThump(ctx, dest, time, freq, 0.5, { gain, pitchDrop: 0.18 });
  playNoiseBurst(ctx, dest, time, 0.45, { filterType: "lowpass", filterFreq: 1600, sweepTo: 180, gain: gain * 0.7 });
  playNoiseBurst(ctx, dest, time, 0.08, { filterType: "highpass", filterFreq: 3000, gain: gain * 0.4 });
}

// A rising "charge" whoosh, used for beams and big wind-ups.
function playChargeUp(ctx, dest, time, opts = {}) {
  const { gain = 0.22, from = 180, to = 1400, duration = 0.5 } = opts;
  const osc = ctx.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(from, time);
  osc.frequency.exponentialRampToValueAtTime(to, time + duration);
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(600, time);
  filter.frequency.exponentialRampToValueAtTime(4000, time + duration);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, time);
  env.gain.exponentialRampToValueAtTime(gain, time + duration * 0.8);
  env.gain.exponentialRampToValueAtTime(0.0001, time + duration);
  osc.connect(filter); filter.connect(env); env.connect(dest);
  osc.start(time); osc.stop(time + duration + 0.05);
}

// A layered solar charge: a slow rising saw hum + a detuned second voice (beating)
// + a shimmering high sparkle, so the wind-up feels like charging sunlight.
function playSolarCharge(ctx, dest, time, opts = {}) {
  const { gain = 0.26, duration = 2 } = opts;

  // Main rising hum (root).
  const hum = ctx.createOscillator();
  hum.type = "sawtooth";
  hum.frequency.setValueAtTime(110, time);
  hum.frequency.exponentialRampToValueAtTime(880, time + duration);

  // Slightly detuned twin creates a tense beating throb that speeds up naturally.
  const twin = ctx.createOscillator();
  twin.type = "sawtooth";
  twin.frequency.setValueAtTime(115, time);
  twin.frequency.exponentialRampToValueAtTime(900, time + duration);

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(500, time);
  filter.frequency.exponentialRampToValueAtTime(5200, time + duration);
  filter.Q.value = 4;

  // Volume swells as the charge builds, peaking just before release.
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, time);
  env.gain.exponentialRampToValueAtTime(gain * 0.5, time + duration * 0.35);
  env.gain.exponentialRampToValueAtTime(gain, time + duration * 0.92);

  hum.connect(filter); twin.connect(filter); filter.connect(env); env.connect(dest);
  hum.start(time); twin.start(time);
  hum.stop(time + duration + 0.05); twin.stop(time + duration + 0.05);

  // Rising sparkle: a bright triangle arrow that climbs into a high whine.
  playTone(ctx, dest, 1320, time + duration * 0.25, duration * 0.75, {
    type: "triangle", gain: gain * 0.25, attack: duration * 0.3, release: duration * 0.2
  });

  // Airy noise that filters open as the charge intensifies.
  playNoiseBurst(ctx, dest, time, duration, {
    filterType: "bandpass", filterFreq: 1200, sweepTo: 6000, gain: gain * 0.2, q: 1.2
  });
}

// The beam release: a bright solar crack layered over a deep blast and a
// downward "sun wash" tone so the shot lands with weight.
function playSolarBeamFire(ctx, dest, time, opts = {}) {
  const { gain = 0.5 } = opts;
  playNoiseBurst(ctx, dest, time, 0.09, { filterType: "highpass", filterFreq: 3200, gain: gain * 0.5 });
  playThump(ctx, dest, time, 100, 0.45, { gain, pitchDrop: 0.4 });
  playNoiseBurst(ctx, dest, time, 0.4, { filterType: "lowpass", filterFreq: 2400, sweepTo: 200, gain: gain * 0.55 });
  const osc = ctx.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(1200, time);
  osc.frequency.exponentialRampToValueAtTime(180, time + 0.45);
  const env = ctx.createGain();
  env.gain.setValueAtTime(gain * 0.4, time);
  env.gain.exponentialRampToValueAtTime(0.0001, time + 0.5);
  osc.connect(env); env.connect(dest);
  osc.start(time); osc.stop(time + 0.55);
}

// The beam connecting: a sizzling solar burn - a bright crack, a searing
// high-pass sizzle and a mid "sun sting" that reads as instant, searing damage.
function playSolarBeamHit(ctx, dest, time, opts = {}) {
  const { gain = 0.42 } = opts;
  // Sharp spearhead crack.
  playNoiseBurst(ctx, dest, time, 0.07, { filterType: "highpass", filterFreq: 2600, gain: gain * 0.7 });
  // Searing sizzle tail that fades as the burn cools.
  playNoiseBurst(ctx, dest, time, 0.28, { filterType: "bandpass", filterFreq: 4200, sweepTo: 1800, gain: gain * 0.5, q: 1.6 });
  // Warm low body so the hit still thumps.
  playThump(ctx, dest, time, 150, 0.22, { gain: gain * 0.7, pitchDrop: 0.35 });
  // Descending stinger that marks the burn landing.
  const osc = ctx.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(1800, time);
  osc.frequency.exponentialRampToValueAtTime(600, time + 0.18);
  const env = ctx.createGain();
  env.gain.setValueAtTime(gain * 0.35, time);
  env.gain.exponentialRampToValueAtTime(0.0001, time + 0.22);
  osc.connect(env); env.connect(dest);
  osc.start(time); osc.stop(time + 0.26);
}

// --- Black Hole voice ------------------------------------------------------
// The Black Hole's gravity well is its identity, so it gets a three-part
// vocabulary: a launch whoosh, a collapse "portal opens" boom, and a deep
// rumbling pull that loops for as long as the event horizon is alive.

// The projectile leaves the fighter: a Doppler whoosh that rises then dips.
function playBlackHoleLaunch(ctx, dest, time, opts = {}) {
  const { gain = 0.3 } = opts;
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(90, time);
  osc.frequency.exponentialRampToValueAtTime(340, time + 0.22);
  osc.frequency.exponentialRampToValueAtTime(120, time + 0.5);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, time);
  env.gain.exponentialRampToValueAtTime(gain, time + 0.05);
  env.gain.exponentialRampToValueAtTime(0.0001, time + 0.55);
  osc.connect(env); env.connect(dest);
  osc.start(time); osc.stop(time + 0.6);

  // The suction air being displaced around it.
  playNoiseBurst(ctx, dest, time, 0.5, {
    filterType: "bandpass", filterFreq: 500, sweepTo: 2200, gain: gain * 0.5, q: 1.2
  });
}

// The projectile connects and the event horizon tears open: a sub-bass drop
// with a bright gravitational "shimmer" on top.
function playBlackHoleOpen(ctx, dest, time, opts = {}) {
  const { gain = 0.42 } = opts;
  playThump(ctx, dest, time, 140, 0.7, { gain, pitchDrop: 0.22 });
  playNoiseBurst(ctx, dest, time, 0.45, {
    filterType: "lowpass", filterFreq: 1400, sweepTo: 90, gain: gain * 0.6
  });
  // Inverted "schlorp" tone: it bends downward as space is devoured.
  const osc = ctx.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(1800, time);
  osc.frequency.exponentialRampToValueAtTime(80, time + 0.5);
  const env = ctx.createGain();
  env.gain.setValueAtTime(gain * 0.45, time);
  env.gain.exponentialRampToValueAtTime(0.0001, time + 0.55);
  osc.connect(env); env.connect(dest);
  osc.start(time); osc.stop(time + 0.6);
  // A glassy ring so opening the hole is unmistakable.
  playTone(ctx, dest, 1180, time, 0.4, { type: "sine", gain: gain * 0.22, attack: 0.004, release: 0.4 });
}

// A single damage tick inside the well: a short, muffled gravity crush.
function playBlackHoleTick(ctx, dest, time, opts = {}) {
  const { gain = 0.26 } = opts;
  playThump(ctx, dest, time, 150, 0.24, { gain, pitchDrop: 0.35 });
  playNoiseBurst(ctx, dest, time, 0.16, {
    filterType: "bandpass", filterFreq: 900, sweepTo: 260, gain: gain * 0.5, q: 2
  });
  playTone(ctx, dest, 340, time, 0.16, { type: "triangle", gain: gain * 0.2, attack: 0.003, release: 0.14 });
}

// The pull that holds the hole open: a looping, rumbling gravity hum. Returns
// a stop function, and uses the shared noise buffer for the rush of the well.
function playBlackHoleLoop(ctx, dest, opts = {}) {
  const { gain = 0.14 } = opts;
  const sources = [];
  const nodes = [];

  // Deep sub rumble, slightly detuned so it throbs.
  [42, 45].forEach(freq => {
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = freq;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 220;
    const env = ctx.createGain();
    env.gain.value = gain * 0.7;
    osc.connect(filter); filter.connect(env); env.connect(dest);
    osc.start();
    sources.push(osc); nodes.push(filter, env);
  });

  // Airy vacuum hiss swirling into the singularity.
  const noise = ctx.createBufferSource();
  noise.buffer = getSharedNoiseBuffer(ctx);
  noise.loop = true;
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = 700;
  band.Q.value = 1.1;
  const noiseEnv = ctx.createGain();
  noiseEnv.gain.value = gain * 0.35;
  noise.connect(band); band.connect(noiseEnv); noiseEnv.connect(dest);
  noise.start();
  sources.push(noise); nodes.push(band, noiseEnv);

  return () => {
    // Quick fade so a stopped hole doesn't click.
    nodes.forEach(node => {
      if (node.gain) {
        try {
          node.gain.cancelScheduledValues(ctx.currentTime);
          node.gain.setValueAtTime(node.gain.value, ctx.currentTime);
          node.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);
        } catch { /* ignore */ }
      }
    });
    sources.forEach(source => { try { source.stop(ctx.currentTime + 0.14); } catch { /* already stopped */ } });
  };
}

function playLoopingNoise(ctx, dest, opts = {}) {
  const { filterType = "lowpass", filterFreq = 2000, gain = 0.05 } = opts;
  const source = ctx.createBufferSource();
  source.buffer = getSharedNoiseBuffer(ctx);
  source.loop = true;

  const filter = ctx.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.value = filterFreq;

  const env = ctx.createGain();
  env.gain.value = gain;

  source.connect(filter);
  filter.connect(env);
  env.connect(dest);
  source.start();

  return () => { try { source.stop(); } catch { /* already stopped */ } };
}

function createLoopScheduler(ctx, scheduleBar, barDuration) {
  let stopped = false;
  let nextBarTime = ctx.currentTime + 0.05;
  let barIndex = 0;
  const lookaheadSeconds = 2.5;

  const tick = () => {
    if (stopped) return;
    while (nextBarTime < ctx.currentTime + lookaheadSeconds) {
      scheduleBar(nextBarTime, barIndex);
      nextBarTime += barDuration;
      barIndex += 1;
    }
  };

  const intervalId = setInterval(tick, 200);
  tick();
  return () => { stopped = true; clearInterval(intervalId); };
}

const LOFI_CHORDS = [
  [220.0, 261.63, 329.63], // Am
  [174.61, 220.0, 261.63], // F
  [130.81, 164.81, 196.0], // C
  [196.0, 246.94, 293.66]  // G
];

const BATTLE_BASSLINE = [82.41, 82.41, 98.0, 82.41, 110.0, 82.41, 98.0, 82.41];

// A minor-key lead line (bar-indexed) that the battle music arpeggiates for drive.
const BATTLE_LEAD = [329.63, 392.0, 440.0, 392.0, 523.25, 440.0, 392.0, 329.63];

class AudioManager {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.currentMusicType = null;
    this.activeStoppers = [];
    this.muted = false;
    this.lastHitTime = -Infinity;
    this.battleIntensity = 0;
    this.pausedMusicType = null;
  }

  ensureContext() {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContextClass();

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : 1.0;
      this.masterGain.connect(this.ctx.destination);

      // The player's music volume sits on its own node, so fades and pauses on musicGain never touch it.
      this.musicLevel = this.ctx.createGain();
      this.musicLevel.connect(this.masterGain);

      // Music sits clearly on top of the SFX bus so the battle track actually drives.
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = MUSIC_BUS_GAIN;
      this.musicGain.connect(this.musicLevel);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = SFX_BUS_GAIN;
      this.sfxGain.connect(this.masterGain);
      this.applyVolumes();
    }
    if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  unlock() {
    this.ensureContext();
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.masterGain) this.masterGain.gain.value = muted ? 0 : 1.0;
  }

  toggleMuted() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  // Pushes the saved music and sound-effect volumes onto their buses.
  applyVolumes() {
    if (!this.ctx) return;
    const { musicVolume, sfxVolume } = getSettings();
    const now = this.ctx.currentTime;
    this.musicLevel.gain.setTargetAtTime(musicVolume, now, 0.02);
    this.sfxGain.gain.setTargetAtTime(SFX_BUS_GAIN * sfxVolume, now, 0.02);
  }

  // Hard-cuts the music: stops the scheduler AND mutes the music bus at once, so
  // notes that were already queued ahead (the scheduler looks 2.5s forward) cannot
  // ring on past the end of a round. The bus is restored on the next bar so the
  // next track still starts at full level.
  stopMusic({ immediate = true } = {}) {
    this.activeStoppers.forEach(stop => stop());
    this.activeStoppers = [];
    this.currentMusicType = null;
    this.pausedMusicType = null;
    this.silenceMusicBus(immediate);
  }

  // Drops the music bus to zero (fading over `fadeSeconds`, or instantly when 0)
  // and restores it on the next scheduled bar.
  silenceMusicBus(fadeSeconds = 0) {
    if (!this.ctx || !this.musicGain) return;
    const now = this.ctx.currentTime;
    const param = this.musicGain.gain;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    if (fadeSeconds > 0) param.linearRampToValueAtTime(0, now + fadeSeconds);
    else param.setValueAtTime(0, now);
  }

  // Restores the music bus to its normal level. Called at the top of every track so
  // a previous hard-cut cannot leave the new music silent.
  restoreMusicBus() {
    if (!this.ctx || !this.musicGain || this.pausedMusicType) return;
    const now = this.ctx.currentTime;
    const param = this.musicGain.gain;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.setValueAtTime(MUSIC_BUS_GAIN, now + 0.06);
  }

  // Silences the audio output without tearing down the running scheduler, so
  // resumeMusic() can pick the same track straight back up. Used by the Pause
  // button: the music must stop dead when the fight is frozen.
  pauseMusic() {
    if (!this.ctx || this.musicGain.gain.value === 0) return;
    this.pausedMusicType = this.currentMusicType;
    // Cut dead (no fade) so the track is gone the frame Pause is pressed.
    this.silenceMusicBus(0);
  }

  // Restores the music bus to its normal level (and, on the very first resume,
  // lets any scheduled bars become audible again).
  resumeMusic() {
    if (!this.ctx) return;
    this.pausedMusicType = null;
    this.restoreMusicBus();
  }

  // True while the music bus is silenced by pauseMusic() (or a hard cut).
  isMusicPaused() {
    return this.pausedMusicType !== null;
  }

  playMenuMusic() {
    if (this.currentMusicType === "menu") return;
    this.stopMusic();
    const ctx = this.ensureContext();
    this.restoreMusicBus();

    const tempo = 78;
    const beat = 60 / tempo;
    const barDuration = beat * 4;

    const scheduleBar = (time, barIndex) => {
      const chord = LOFI_CHORDS[barIndex % LOFI_CHORDS.length];
      chord.forEach((freq, i) => {
        playTone(ctx, this.musicGain, freq, time, barDuration * 0.95, {
          type: "sine", gain: 0.09 - i * 0.01, attack: 0.6, release: barDuration * 0.5, lowpass: 900
        });
      });
      playTone(ctx, this.musicGain, chord[0] / 2, time, barDuration * 0.9, {
        type: "sine", gain: 0.1, attack: 0.4, release: barDuration * 0.4
      });
      for (let b = 0; b < 4; b++) {
        playThump(ctx, this.musicGain, time + b * beat, 90, 0.18, { gain: 0.26 });
      }
      for (let e = 1; e < 8; e += 2) {
        playNoiseBurst(ctx, this.musicGain, time + e * (beat / 2), 0.05, {
          filterType: "highpass", filterFreq: 6000, gain: 0.045
        });
      }
    };

    const stopHiss = playLoopingNoise(ctx, this.musicGain, { filterType: "bandpass", filterFreq: 3200, gain: 0.02 });
    const stopLoop = createLoopScheduler(ctx, scheduleBar, barDuration);

    this.activeStoppers = [stopLoop, stopHiss];
    this.currentMusicType = "menu";
  }

  // `intensity` (0..1) ramps the battle track up: more bass drive, a busier lead
  // and a tighter drum pattern as the fight heats up (sudden death pushes it to 1).
  playBattleMusic(intensity = 0) {
    if (this.currentMusicType === "battle") {
      this.battleIntensity = intensity;
      return;
    }
    this.stopMusic();
    const ctx = this.ensureContext();
    this.restoreMusicBus();
    this.battleIntensity = intensity;

    const tempo = 168;
    const beat = 60 / tempo;
    const sixteenth = beat / 4;
    const eighth = beat / 2;
    const barDuration = beat * 4;

    const scheduleBar = (time, barIndex) => {
      const heat = this.battleIntensity ?? 0;

      // Driving bass: every eighth, pushed harder as intensity climbs.
      for (let e = 0; e < 8; e++) {
        playTone(ctx, this.musicGain, BATTLE_BASSLINE[e], time + e * eighth, eighth * 0.85, {
          type: "sawtooth", gain: 0.22 + heat * 0.06, attack: 0.002, release: 0.03, lowpass: 1100 + heat * 700
        });
      }

      // Kick on every beat once things get intense, otherwise on the strong beats.
      for (let b = 0; b < 4; b++) {
        const beatTime = time + b * beat;
        if (heat > 0.4 || b === 0 || b === 2) {
          playThump(ctx, this.musicGain, beatTime, 90, 0.22, { gain: 0.5, pitchDrop: 0.25 });
        }
        // Snare hits the backbeat, and doubles up at high intensity.
        if (b === 1 || b === 3) {
          playNoiseBurst(ctx, this.musicGain, beatTime, 0.16, { filterType: "bandpass", filterFreq: 1800, gain: 0.34, q: 1.6 });
          if (heat > 0.6) {
            playNoiseBurst(ctx, this.musicGain, beatTime + eighth, 0.12, { filterType: "bandpass", filterFreq: 2200, gain: 0.24, q: 1.6 });
          }
        }
      }

      // Hats on every eighth, with ghost sixteenths when intense.
      for (let e = 0; e < 8; e++) {
        playNoiseBurst(ctx, this.musicGain, time + e * eighth, 0.05, { filterType: "highpass", filterFreq: 8000, gain: 0.075 });
        if (heat > 0.5) {
          playNoiseBurst(ctx, this.musicGain, time + e * eighth + sixteenth * 2, 0.03, { filterType: "highpass", filterFreq: 9000, gain: 0.04 });
        }
      }

      // Arpeggiated lead that grows from a stab into a running line.
      const leadNotes = heat > 0.35 ? 8 : 4;
      for (let n = 0; n < leadNotes; n++) {
        const freq = BATTLE_LEAD[(barIndex * 2 + n) % BATTLE_LEAD.length];
        playTone(ctx, this.musicGain, freq, time + n * (8 / leadNotes) * eighth, eighth * 0.6, {
          type: "square", gain: 0.1 + heat * 0.05, attack: 0.002, release: 0.06, lowpass: 2600
        });
      }

      // Every other bar lands a low power chord under the lead.
      if (barIndex % 2 === 1) {
        const stabTime = time + 7 * eighth;
        playTone(ctx, this.musicGain, 164.81, stabTime, eighth, { type: "square", gain: 0.16, attack: 0.002, release: 0.08 });
        playTone(ctx, this.musicGain, 246.94, stabTime, eighth, { type: "square", gain: 0.11, attack: 0.002, release: 0.08 });
      }

      // A rising tension sweep right before each downbeat when the fight is hot.
      if (heat > 0.7 && barIndex % 2 === 0) {
        playChargeUp(ctx, this.musicGain, time + 3 * beat, { gain: 0.14, from: 200, to: 1200, duration: beat });
      }
    };

    const stopLoop = createLoopScheduler(ctx, scheduleBar, barDuration);
    this.activeStoppers = [stopLoop];
    this.currentMusicType = "battle";
  }

  // Raises/lowers battle music intensity live (e.g. during sudden death).
  setBattleIntensity(intensity) {
    this.battleIntensity = intensity;
  }

  playVictorySound() {
    const ctx = this.ensureContext();
    const now = ctx.currentTime;
    const arpeggio = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
    arpeggio.forEach((freq, i) => {
      playTone(ctx, this.sfxGain, freq, now + i * 0.12, 0.5, { type: "triangle", gain: 0.22, attack: 0.01, release: 0.45 });
    });
    [1046.5, 1318.51, 1567.98].forEach(freq => {
      playTone(ctx, this.sfxGain, freq, now + 0.55, 1.1, { type: "triangle", gain: 0.14, attack: 0.02, release: 1.0 });
    });
  }

  playCountdownBeep(step) {
    const ctx = this.ensureContext();
    const now = ctx.currentTime;
    if (step === "go") {
      playTone(ctx, this.sfxGain, 784, now, 0.35, { type: "square", gain: 0.22, attack: 0.005, release: 0.28 });
      playTone(ctx, this.sfxGain, 987.77, now, 0.35, { type: "square", gain: 0.14, attack: 0.005, release: 0.28 });
      return;
    }
    const freqByStep = { 3: 392.0, 2: 440.0, 1: 523.25 };
    playTone(ctx, this.sfxGain, freqByStep[step] ?? 440, now, 0.16, { type: "square", gain: 0.2, attack: 0.004, release: 0.12 });
  }

  // Distinct, weapon-flavoured impact sounds. `weapon` is the attacker's identity
  // (its class name / attack type); `category` is the damage channel. Falls back to
  // a generic impact per category so every hit still makes a sound.
  playHitSfx(category = "Body", weapon = null) {
    const ctx = this.ensureContext();
    const now = ctx.currentTime;
    if (now - this.lastHitTime < 0.04) return; // avoid overlapping spam from simultaneous hits
    this.lastHitTime = now;

    const jitter = 0.94 + Math.random() * 0.12;

    // --- Weapon-specific layer -------------------------------------------------
    switch (weapon) {
      case "IceSword":
        // Cold, glassy chime on top of the slice.
        playMetalSlice(ctx, this.sfxGain, now, { baseFreq: 1800 * jitter, sweepTo: 7000, gain: 0.26, ring: 4200, duration: 0.2 });
        playTone(ctx, this.sfxGain, 1760 * jitter, now, 0.28, { type: "sine", gain: 0.12, attack: 0.002, release: 0.26 });
        return;
      case "Samurai":
      case "Knight":
      case "Reaper":
      case "Berserker":
        // Edged blades: a bright metallic slice.
        playMetalSlice(ctx, this.sfxGain, now, { baseFreq: 2400 * jitter, sweepTo: 8500, gain: 0.3, ring: 3400, duration: 0.16 });
        return;
      case "Assassin":
        // Small and quick: a light, short slice plus a soft stab.
        playMetalSlice(ctx, this.sfxGain, now, { baseFreq: 3000 * jitter, sweepTo: 9500, gain: 0.2, ring: 5200, duration: 0.1 });
        playStab(ctx, this.sfxGain, now, { gain: 0.16, freq: 300 });
        return;
      case "Spearman":
        // A puncturing stab with a wood-and-metal thump.
        playStab(ctx, this.sfxGain, now, { gain: 0.34, freq: 220 * jitter });
        playMetalSlice(ctx, this.sfxGain, now, { baseFreq: 1600 * jitter, sweepTo: 4200, gain: 0.16, duration: 0.09 });
        return;
      case "Ninja":
        // Rope dart: a metal tick followed by a sharp yank.
        playMetalSlice(ctx, this.sfxGain, now, { baseFreq: 3600 * jitter, sweepTo: 8000, gain: 0.18, duration: 0.07 });
        playNoiseBurst(ctx, this.sfxGain, now + 0.02, 0.12, { filterType: "bandpass", filterFreq: 1200, sweepTo: 500, gain: 0.2 });
        return;
      case "Gunner":
        // Gunshot: a tight crack with a low body.
        playNoiseBurst(ctx, this.sfxGain, now, 0.09, { filterType: "highpass", filterFreq: 2200, gain: 0.34 });
        playThump(ctx, this.sfxGain, now, 180 * jitter, 0.12, { gain: 0.3, pitchDrop: 0.4 });
        return;
      case "Fireball":
        // Fiery whoosh-plus-crackle.
        playNoiseBurst(ctx, this.sfxGain, now, 0.22, { filterType: "lowpass", filterFreq: 2400, sweepTo: 700, gain: 0.28 });
        playThump(ctx, this.sfxGain, now, 150 * jitter, 0.16, { gain: 0.22 });
        return;
      case "Alchemist":
      case "MineLayer":
      case "Meteor":
        // Explosive / thrown ordnance.
        playExplosion(ctx, this.sfxGain, now, { gain: 0.44, freq: 95 * jitter });
        return;
      case "SolarBeam":
      case "BlackHole":
        // Energy weapons: a deep, humming zap.
        playZap(ctx, this.sfxGain, now, { gain: 0.28, freq: 1400 * jitter });
        playThump(ctx, this.sfxGain, now, 80, 0.3, { gain: 0.24, pitchDrop: 0.5 });
        return;
      case "Tornado":
        // Wind burst: filtered noise sweeping down.
        playNoiseBurst(ctx, this.sfxGain, now, 0.3, { filterType: "bandpass", filterFreq: 900 * jitter, sweepTo: 300, gain: 0.3, q: 1.4 });
        return;
      case "Spider":
      case "Snake":
        // Sticky / corrosive tick.
        playNoiseBurst(ctx, this.sfxGain, now, 0.14, { filterType: "bandpass", filterFreq: 700 * jitter, gain: 0.2, q: 3 });
        playThump(ctx, this.sfxGain, now, 200, 0.1, { gain: 0.16 });
        return;
      case "Mutant":
      case "Grappler":
      case "Duplicator":
      case "Mahoraga":
        // Heavy, fleshy contact.
        playCrush(ctx, this.sfxGain, now, { gain: 0.4, freq: 120 });
        return;
      case "Vampire":
        // A claw slash with a raking scrape.
        playMetalSlice(ctx, this.sfxGain, now, { baseFreq: 2000 * jitter, sweepTo: 6000, gain: 0.24, ring: 2600, duration: 0.14 });
        playNoiseBurst(ctx, this.sfxGain, now, 0.1, { filterType: "bandpass", filterFreq: 600, gain: 0.16 });
        return;
      case "Tunneler":
      case "Ghost":
        // Ethereal / subterranean hits.
        playNoiseBurst(ctx, this.sfxGain, now, 0.2, { filterType: "lowpass", filterFreq: 1200, sweepTo: 300, gain: 0.24 });
        playTone(ctx, this.sfxGain, 220 * jitter, now, 0.2, { type: "sine", gain: 0.14, attack: 0.01, release: 0.18 });
        return;
      default:
        break;
    }

    // --- Generic fallback by damage category -----------------------------------
    const presets = {
      Body: { freq: 160, noiseFilter: 900, duration: 0.14 },
      Melee: { freq: 420, noiseFilter: 2600, duration: 0.1 },
      Projectile: { freq: 300, noiseFilter: 1800, duration: 0.08 },
      Beam: { freq: 90, noiseFilter: 500, duration: 0.22 },
      AOE: { freq: 110, noiseFilter: 650, duration: 0.2 }
    };
    const preset = presets[category] || presets.Body;
    playThump(ctx, this.sfxGain, now, preset.freq * jitter, preset.duration, { gain: 0.34 });
    playNoiseBurst(ctx, this.sfxGain, now, preset.duration * 0.8, { filterFreq: preset.noiseFilter, gain: 0.22 });
  }

  playDeathSfx() {
    const ctx = this.ensureContext();
    const now = ctx.currentTime;
    // Big low boom plus a descending "power-down" tone, so a kill lands hard.
    playExplosion(ctx, this.sfxGain, now, { gain: 0.5, freq: 120 });
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(70, now + 0.8);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(2400, now);
    filter.frequency.exponentialRampToValueAtTime(300, now + 0.8);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.28, now);
    env.gain.exponentialRampToValueAtTime(0.0001, now + 0.85);
    osc.connect(filter); filter.connect(env); env.connect(this.sfxGain);
    osc.start(now); osc.stop(now + 0.9);
  }

  // Fired when a fighter starts an ability: a short, rising wind-up tick.
  playAbilityCast(weapon = null) {
    const ctx = this.ensureContext();
    const now = ctx.currentTime;
    if (weapon === "SolarBeam" || weapon === "BlackHole" || weapon === "Meteor") {
      playChargeUp(ctx, this.sfxGain, now, { gain: 0.16, from: 220, to: 1100, duration: 0.35 });
      return;
    }
    playTone(ctx, this.sfxGain, 520, now, 0.08, { type: "triangle", gain: 0.1, attack: 0.002, release: 0.07 });
  }

  // The Solar Beam's long wind-up: a layered charging hum that swells for the
  // full charge duration (default 2s) so the audio matches the animation.
  playSolarCharge(duration = 2) {
    const ctx = this.ensureContext();
    playSolarCharge(ctx, this.sfxGain, ctx.currentTime, { gain: 0.26, duration });
  }

  // The Solar Beam's actual discharge when the shot fires.
  playSolarBeamFire() {
    const ctx = this.ensureContext();
    playSolarBeamFire(ctx, this.sfxGain, ctx.currentTime, { gain: 0.5 });
  }

  // --- Black Hole voice ----------------------------------------------------
  // A launched singularity: the whoosh as the projectile leaves the fighter.
  playBlackHoleLaunch() {
    const ctx = this.ensureContext();
    playBlackHoleLaunch(ctx, this.sfxGain, ctx.currentTime, { gain: 0.3 });
  }

  // The projectile connects: the boom of the event horizon tearing open.
  playBlackHoleOpen() {
    const ctx = this.ensureContext();
    playBlackHoleOpen(ctx, this.sfxGain, ctx.currentTime, { gain: 0.42 });
  }

  // One 5-damage tick inside the well.
  playBlackHoleTick() {
    const ctx = this.ensureContext();
    playBlackHoleTick(ctx, this.sfxGain, ctx.currentTime, { gain: 0.26 });
  }

  // Starts the looped gravity rumble while a hole is open. Returns a stop
  // function so the class can silence it the moment the hole collapses.
  startBlackHoleLoop() {
    const ctx = this.ensureContext();
    return playBlackHoleLoop(ctx, this.sfxGain, { gain: 0.14 });
  }

  // The Solar Beam connecting with an opponent: a searing solar burn.
  playSolarBeamHit() {
    const ctx = this.ensureContext();
    playSolarBeamHit(ctx, this.sfxGain, ctx.currentTime, { gain: 0.42 });
  }

  playUiClick() {
    const ctx = this.ensureContext();
    const now = ctx.currentTime;
    playTone(ctx, this.sfxGain, 720, now, 0.06, { type: "square", gain: 0.16, attack: 0.002, release: 0.05 });
  }
}

export const audioManager = new AudioManager();
