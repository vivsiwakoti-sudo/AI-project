// Test-only safety net for the headless engine tests.
//
// The fighter classes answer damage with sound effects, and the music engine
// schedules look-ahead notes with setTimeout. In a test both are useless: at a
// simulated 60 frames per second they schedule millions of no-op timers, which
// keeps node alive long after the last test and can hang the run. This harness
// stops the audio subsystem from scheduling anything and makes its clock jump
// forward on every read, so no stale note ever "comes due".
//
// Import it AFTER the Web Audio stub and BEFORE the engine modules.

import { audioManager } from './engine/audio/AudioManager.js';

for (const name of Object.getOwnPropertyNames(audioManager)) {
  if (typeof audioManager[name] === 'function') audioManager[name] = () => { };
}

let jumps = 0;
try {
  Object.defineProperty(audioManager, 'currentTime', {
    get: () => { jumps += 1; return jumps * 1000; },
    configurable: true
  });
} catch {
  // A non-configurable clock is fine: the no-op methods above already stop the work.
}
