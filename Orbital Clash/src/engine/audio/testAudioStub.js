// No-op Web Audio so engine code can run under node:test, which has no `window`.
export function installTestAudio() {
  const param = () => ({ value: 0, setValueAtTime() { }, setTargetAtTime() { }, cancelScheduledValues() { }, linearRampToValueAtTime() { }, exponentialRampToValueAtTime() { } });
  globalThis.window = {
    AudioContext: function () {
      return {
        createGain: () => ({ connect() { }, gain: param() }),
        createOscillator: () => ({ connect() { }, start() { }, stop() { }, frequency: param(), detune: param(), type: '' }),
        createBiquadFilter: () => ({ connect() { }, frequency: param(), Q: param(), type: '' }),
        createBufferSource: () => ({ connect() { }, start() { }, stop() { }, buffer: null, playbackRate: param() }),
        createBuffer: (channels, length) => ({ getChannelData: () => new Float32Array(length) }),
        destination: {}, currentTime: 0, state: 'running', sampleRate: 44100, resume() { }
      };
    }
  };
}
