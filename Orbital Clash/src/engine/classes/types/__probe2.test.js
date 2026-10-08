import test from 'node:test';

const param = () => ({ value: 0, setValueAtTime() { }, linearRampToValueAtTime() { }, exponentialRampToValueAtTime() { } });
globalThis.window = {
  AudioContext: function () {
    return {
      createGain: () => ({ connect() { }, gain: param() }),
      createOscillator: () => ({ connect() { }, start() { }, stop() { }, frequency: param(), detune: param(), type: '' }),
      createBiquadFilter: () => ({ connect() { }, frequency: param(), Q: param(), type: '' }),
      createBufferSource: () => ({ connect() { }, start() { }, stop() { }, buffer: null, playbackRate: param() }),
      createBuffer: (c, l) => ({ getChannelData: () => new Float32Array(l) }),
      destination: {}, currentTime: 0, state: 'running', sampleRate: 44100, resume() { }
    };
  }
};

const { Mahoraga } = await import('./Mahoraga.js');

test('probe', () => {
  const m = new Mahoraga({
    name: 'M', color: '#fff', health: 130, damage: 8, speed: 4,
    bodySize: 46, attackType: 'Body', cooldown: 0, description: 'x'
  }, 100, 100);
  const o = {
    x: 170, y: 100, radius: 18, health: 1e9, maxHealth: 1e9, isDead: false,
    isInvulnerable: false, isUntargetable: false, damageCooldown: 0,
    vx: 0, vy: 0, speed: 1, particleSystem: null,
    onHitTaken: () => 1, onDamageMultiplier: null, onDamaged() { }, die() { }
  };

  // Mahoraga is now a pure Body fighter: there is no swing state machine left,
  // so a long update run must simply tick its wheel and feedback timers without
  // throwing, and no slash state may ever appear.
  for (let i = 0; i < 120; i++) m.update(1 / 60, o);
  console.log(`after warmup: wheelAngle=${m.wheelAngle.toFixed(3)} wheelSpinRate=${m.wheelSpinRate.toFixed(3)} parryFlash=${m.parryFlash.toFixed(3)}`);

  // An adaptation kicks the wheel burst, which then decays back to the idle rate.
  m.onHitTaken('Melee', 8); m.onHitTaken('Melee', 8); m.onHitTaken('Melee', 8);
  const burstAfterAdapt = m.wheelBurst;
  for (let i = 0; i < 240; i++) m.update(1 / 60, o);
  console.log(`after adapt: burst=${burstAfterAdapt.toFixed(3)} burstNow=${m.wheelBurst.toFixed(3)} spinRate=${m.wheelSpinRate.toFixed(3)}`);

  // The slash state must never exist again.
  console.log(`slashSweep=${m.slashSweep} attackWindup=${m.attackWindup} attackActive=${m.attackActive}`);
});
