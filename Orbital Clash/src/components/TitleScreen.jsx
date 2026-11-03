import { useCallback, useEffect, useRef, useState } from "react";
import { audioManager } from "../engine/audio/AudioManager";

// Length of the zoom into the logo. Must match --title-zoom in App.css.
const ZOOM_MS = 700;

export default function TitleScreen({ onStart }) {
  const [zooming, setZooming] = useState(false);
  const startedRef = useRef(false);

  useEffect(() => {
    audioManager.playMenuMusic();
  }, []);

  // Guarded by a ref so a double click or Enter during the zoom starts only once.
  const start = useCallback(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    audioManager.playUiClick();
    setZooming(true);
    window.setTimeout(onStart, ZOOM_MS);
  }, [onStart]);

  useEffect(() => {
    const onKey = (event) => { if (event.key === "Enter") start(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [start]);

  return (
    <main className={`title-screen${zooming ? " is-zooming" : ""}`}>
      <div className="title-stars" aria-hidden="true" />
      <div className="title-frame" aria-hidden="true" />

      <div className="title-content">
        <div className="title-logo">
          <svg className="title-orbit" viewBox="0 0 400 200" aria-hidden="true">
            <defs>
              <linearGradient id="title-orbit-grad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#00f2ff" stopOpacity="0" />
                <stop offset="0.45" stopColor="#00f2ff" />
                <stop offset="1" stopColor="#a6fbff" />
              </linearGradient>
            </defs>
            <ellipse cx="200" cy="100" rx="186" ry="66" transform="rotate(-16 200 100)" fill="none" stroke="url(#title-orbit-grad)" strokeWidth="5" />
          </svg>
          <h1 className="title-word title-word-top">ORBITAL</h1>
          <h1 className="title-word title-word-bottom">CLASH</h1>
        </div>

        <button className="title-start" onClick={start} disabled={zooming}>
          <span>
            <span className="title-start-icon" aria-hidden="true" />
            START SIMULATING
          </span>
        </button>
      </div>
    </main>
  );
}
