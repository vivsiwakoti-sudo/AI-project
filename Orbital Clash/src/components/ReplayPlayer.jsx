import { useEffect, useRef, useState } from "react";
import { audioManager } from "../engine/audio/AudioManager";
import { loadFavoriteReplayFrames, loadLastReplayFrames } from "../engine/replayStore";

// Frames are decoded just in time into a small sliding window of ImageBitmaps.
// A 25 second replay holds hundreds of frames, and decoding all of them up front
// would cost hundreds of megabytes.
const LOOKAHEAD = 20;

function BattleReplay({ frames, playing, onEnded }) {
  const canvasRef = useRef(null);
  const onEndedRef = useRef(onEnded);

  useEffect(() => {
    onEndedRef.current = onEnded;
  }, [onEnded]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !frames.length) return undefined;

    let frameRequest;
    let cancelled = false;
    const ready = new Map();
    const requested = new Set();
    const last = frames.length - 1;

    const request = index => {
      if (index > last || requested.has(index)) return;
      requested.add(index);
      createImageBitmap(frames[index].image).then(bitmap => {
        if (cancelled) bitmap.close();
        else ready.set(index, bitmap);
      }).catch(() => {});
    };
    // Draws the newest decoded frame at or before `index`, so a frame that is
    // still decoding holds the previous picture instead of flashing blank.
    const drawAt = index => {
      for (let i = index; i >= 0; i--) {
        const bitmap = ready.get(i);
        if (bitmap) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
          return;
        }
      }
    };
    const release = index => {
      for (const [i, bitmap] of ready) {
        if (i < index - 1) {
          bitmap.close();
          ready.delete(i);
        }
      }
    };

    if (!playing) {
      request(last);
      const showLast = () => {
        if (cancelled) return;
        if (ready.has(last)) drawAt(last);
        else frameRequest = requestAnimationFrame(showLast);
      };
      showLast();
    } else {
      const startTime = frames[0].time;
      const duration = Math.max(0, frames[last].time - startTime);
      let playbackStart = null;
      let index = 0;
      for (let i = 0; i <= LOOKAHEAD; i++) request(i);

      const tick = now => {
        if (cancelled) return;
        // The clock starts once the first frame is decoded, so the opening
        // seconds are not skipped while it loads.
        if (playbackStart === null) {
          if (!ready.has(0)) {
            frameRequest = requestAnimationFrame(tick);
            return;
          }
          playbackStart = now;
        }
        const elapsed = Math.min(duration, (now - playbackStart) / 1000);
        const target = startTime + elapsed;
        while (index + 1 < frames.length && frames[index + 1].time <= target) index++;
        for (let i = index; i <= index + LOOKAHEAD; i++) request(i);
        drawAt(index);
        release(index);
        if (elapsed >= duration) {
          request(last);
          drawAt(last);
          onEndedRef.current();
          return;
        }
        frameRequest = requestAnimationFrame(tick);
      };
      frameRequest = requestAnimationFrame(tick);
    }

    return () => {
      cancelled = true;
      if (frameRequest) cancelAnimationFrame(frameRequest);
      ready.forEach(bitmap => bitmap.close());
      ready.clear();
    };
  }, [frames, playing]);

  return <canvas ref={canvasRef} className="battle-replay-canvas" width={800} height={800} aria-label="Replay of the last battle" />;
}

// Loads a stored replay and plays it once on open; the button replays it. With no
// `favoriteId` it plays the last battle; otherwise that saved favorite clip.
export default function ReplayPlayer({ favoriteId = null }) {
  const [frames, setFrames] = useState(null);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = favoriteId ? loadFavoriteReplayFrames(favoriteId) : loadLastReplayFrames();
    load.then(loaded => {
      if (!cancelled) setFrames(loaded);
    });
    return () => { cancelled = true; };
  }, [favoriteId]);

  if (frames === null) return <p className="battle-history-empty">Loading replay...</p>;
  if (frames.length === 0) return <p className="battle-history-empty">{favoriteId ? "This clip could not be loaded." : "No replay saved yet. Finish a battle and its last 25 seconds will be kept here."}</p>;

  return (
    <div className="replay-section">
      <BattleReplay frames={frames} playing={playing} onEnded={() => setPlaying(false)} />
      <button
        className="replay-button"
        disabled={playing}
        onClick={() => { audioManager.playUiClick(); setPlaying(true); }}
      >
        {playing ? "PLAYING..." : "PLAY AGAIN"}
      </button>
    </div>
  );
}
