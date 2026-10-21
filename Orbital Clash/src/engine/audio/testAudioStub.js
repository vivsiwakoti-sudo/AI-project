// No-op Web Audio so engine code can run under node:test, which has no `window`.
export function installTestAudio() {
  const param = () => ({ value: 0, setValueAtTime() { }, setTargetAtTime() { }, cancelScheduledValues() { }, linearRampToValueAtTime() { }, exponentialRampToValueAtTime() { } });
  // `new AudioContextClass()` needs a real constructor: a plain function that
  // returns an object throws "is not a constructor", and every damage hit would
  // then surface as a failed frame.
  class FakeAudioContext {
    constructor() {
      this.destination = {};
      this.currentTime = 0;
      this.state = 'running';
      this.sampleRate = 44100;
    }
    createGain() { return { connect() { }, gain: param() }; }
    createOscillator() { return { connect() { }, start() { }, stop() { }, frequency: param(), detune: param(), type: '' }; }
    createBiquadFilter() { return { connect() { }, frequency: param(), Q: param(), type: '' }; }
    createBufferSource() { return { connect() { }, start() { }, stop() { }, buffer: null, playbackRate: param() }; }
    createBuffer(channels, length) { return { getChannelData: () => new Float32Array(length) }; }
    createChannelMerger() { return { connect() { } }; }
    resume() { return Promise.resolve(); }
    suspend() { return Promise.resolve(); }
  }
  globalThis.window = { AudioContext: FakeAudioContext };
}
