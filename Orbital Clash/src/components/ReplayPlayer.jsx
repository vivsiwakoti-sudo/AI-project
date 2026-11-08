import { useEffect, useRef, useState } from "react";
import { audioManager } from "../engine/audio/AudioManager";
import { loadLastReplayFrames } from "../engine/replayStore";

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
    const objectUrls = [];
    const images = frames.map(frame => {
      const image = new Image();
      const source = frame.image instanceof Blob ? URL.createObjectURL(frame.image) : frame.image;
      if (frame.image instanceof Blob) objectUrls.push(source);
      image.src = source;
      return image;
    });
    const drawAt = index => {
      const image = images[index];
      if (image?.complete && image.naturalWidth > 0) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      }
    };

    Promise.all(images.map(image => new Promise(resolve => {
      if (image.complete) resolve();
      else {
        image.onload = resolve;
        image.onerror = resolve;
      }
    }))).then(() => {
      if (cancelled) return;
      if (!playing) {
        drawAt(images.length - 1);
        return;
      }
      drawAt(0);

      const startTime = frames[0].time;
      const duration = Math.max(0, frames[frames.length - 1].time - startTime);
      if (duration === 0) {
        drawAt(images.length - 1);
        onEndedRef.current();
        return;
      }

      let playbackStart = null;
      let index = 0;
      const tick = now => {
        if (cancelled) return;
        if (playbackStart === null) playbackStart = now;
        const elapsed = Math.min(duration, (now - playbackStart) / 1000);
        const target = startTime + elapsed;
        while (index + 1 < frames.length && frames[index + 1].time <= target) index++;
        drawAt(index);
        if (elapsed >= duration) {
          drawAt(images.length - 1);
          onEndedRef.current();
          return;
        }
        frameRequest = requestAnimationFrame(tick);
      };
      frameRequest = requestAnimationFrame(tick);
    });

    return () => {
      cancelled = true;
      if (frameRequest) cancelAnimationFrame(frameRequest);
      objectUrls.forEach(url => URL.revokeObjectURL(url));
    };
  }, [frames, playing]);

  return <canvas ref={canvasRef} className="battle-replay-canvas" width={800} height={800} aria-label="Replay of the last battle" />;
}

// Loads the stored replay and plays it once on open; the button replays it.
export default function ReplayPlayer() {
  const [frames, setFrames] = useState(null);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    let cancelled = false;
    loadLastReplayFrames().then(loaded => {
      if (!cancelled) setFrames(loaded);
    });
    return () => { cancelled = true; };
  }, []);

  if (frames === null) return <p className="battle-history-empty">Loading replay...</p>;
  if (frames.length === 0) return <p className="battle-history-empty">No replay saved yet. Finish a battle and its last 25 seconds will be kept here.</p>;

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
