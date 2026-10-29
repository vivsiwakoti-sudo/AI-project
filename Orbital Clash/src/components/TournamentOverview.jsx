import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ARENA_SIZE_OPTIONS } from "../engine/config";
import { ROUND_LABELS, TOTAL_MATCHES, TOURNAMENT_SIZE, BYE_COUNT } from "../engine/tournament";
import { audioManager } from "../engine/audio/AudioManager";
import TournamentBracket from "./TournamentBracket";

// The bracket is laid out at a fixed width in CSS and then scaled to fit the
// stage, so the whole thing is always on screen at once whatever the window size.
// This only caps how far a small bracket may be scaled UP on a very large window.
const MAX_FIT_SCALE = 1.3;
// Timeline of the zoom (ms): the camera dives into the first match for the whole
// ZOOM_MS; the overview starts fading, and the tournament starts, at FADE_AT_MS so
// the arena's intro card is already waiting underneath when the card fills the screen.
const FADE_AT_MS = 950;
const ZOOM_MS = 1500;
const REDUCED_MOTION_MS = 300;

// Shown once, before a tournament's first match: the full bracket, the arena size
// picker, and a BEGIN button that zooms into the first match.
//
// `onBegin` fires when the tournament should start running (underneath the fading
// overview); `onFinished` fires when the overview has fully gone and can unmount.
export default function TournamentOverview({ tournament, arenaSize, focusMatch, onArenaSize, onBegin, onFinished, onExit }) {
  const stageRef = useRef(null);
  const bracketRef = useRef(null);
  const timersRef = useRef([]);
  const [fit, setFit] = useState({ scale: 1, x: 0, y: 0 });
  const [zoomTransform, setZoomTransform] = useState(null);
  const [leaving, setLeaving] = useState(false);
  const [fading, setFading] = useState(false);

  // Scale and centre the bracket so all of it fits inside the stage.
  useLayoutEffect(() => {
    const stage = stageRef.current;
    const bracket = bracketRef.current;
    if (!stage || !bracket) return undefined;
    const measure = () => {
      const stageW = stage.clientWidth;
      const stageH = stage.clientHeight;
      const bracketW = bracket.offsetWidth;
      const bracketH = bracket.offsetHeight;
      if (!stageW || !stageH || !bracketW || !bracketH) return;
      const scale = Math.min(stageW / bracketW, stageH / bracketH, MAX_FIT_SCALE);
      setFit({ scale, x: (stageW - bracketW * scale) / 2, y: (stageH - bracketH * scale) / 2 });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    observer.observe(bracket);
    return () => observer.disconnect();
  }, []);

  useEffect(() => () => timersRef.current.forEach(clearTimeout), []);
  const later = (ms, fn) => { timersRef.current.push(setTimeout(fn, ms)); };

  const begin = () => {
    if (leaving) return;
    audioManager.playUiClick();
    setLeaving(true);

    const stage = stageRef.current;
    const card = focusMatch ? bracketRef.current?.querySelector(`[data-match-id="${focusMatch.id}"]`) : null;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    if (!stage || !card || reduceMotion) {
      setFading(true);
      onBegin?.();
      later(REDUCED_MOTION_MS, () => onFinished?.());
      return;
    }

    // The card's box in the bracket's own (unscaled) coordinates, recovered from
    // where it is on screen right now and the fit transform currently applied.
    const stageBox = stage.getBoundingClientRect();
    const cardBox = card.getBoundingClientRect();
    const cardX = (cardBox.left - stageBox.left - fit.x) / fit.scale;
    const cardY = (cardBox.top - stageBox.top - fit.y) / fit.scale;
    const cardW = cardBox.width / fit.scale;
    const cardH = cardBox.height / fit.scale;

    // Scale until the card covers the whole stage, with its centre on the stage's.
    const zoom = Math.max(stageBox.width / cardW, stageBox.height / cardH) * 1.15;
    const tx = stageBox.width / 2 - (cardX + cardW / 2) * zoom;
    const ty = stageBox.height / 2 - (cardY + cardH / 2) * zoom;
    setZoomTransform(`translate(${tx}px, ${ty}px) scale(${zoom})`);

    later(FADE_AT_MS, () => { setFading(true); onBegin?.(); });
    later(ZOOM_MS, () => onFinished?.());
  };

  const transform = zoomTransform ?? `translate(${fit.x}px, ${fit.y}px) scale(${fit.scale})`;
  const className = [
    "tournament-overview",
    leaving ? "tournament-overview-leaving" : "",
    fading ? "tournament-overview-fading" : ""
  ].filter(Boolean).join(" ");

  return (
    <div className={className} role="dialog" aria-label="Tournament bracket overview">
      <div className="tournament-overview-head">
        <div className="tournament-overview-title">
          <span className="tournament-badge">TOURNAMENT</span>
          <h2>THE FULL BRACKET</h2>
          <p>{TOURNAMENT_SIZE} classes · {BYE_COUNT} byes · {TOTAL_MATCHES} single-elimination matches</p>
        </div>
        <button type="button" className="tournament-control tournament-control-exit" onClick={onExit} disabled={leaving}>
          ← BACK
        </button>
      </div>

      <div className="tournament-overview-stage" ref={stageRef}>
        <div className="overview-bracket" ref={bracketRef} style={{ transform }}>
          <TournamentBracket tournament={tournament} currentMatchId={focusMatch?.id ?? null} onSelectFighter={() => { }} />
        </div>
      </div>

      <div className="tournament-overview-foot">
        <div className="tournament-overview-next">
          {focusMatch ? (
            <>
              <span>FIRST MATCH · {(ROUND_LABELS[focusMatch.round] ?? focusMatch.round).toUpperCase()}</span>
              <b>{focusMatch.first} <em>VS</em> {focusMatch.second}</b>
            </>
          ) : null}
        </div>
        <div className="map-size-picker tournament-overview-sizes" role="radiogroup" aria-label="Arena size">
          <span>ARENA SIZE</span>
          {ARENA_SIZE_OPTIONS.map(size => (
            <button
              key={size}
              type="button"
              role="radio"
              aria-checked={arenaSize === size}
              className={arenaSize === size ? "map-size-active" : ""}
              disabled={leaving}
              onClick={() => { audioManager.playUiClick(); onArenaSize?.(size); }}
            >
              {size}x{size}
            </button>
          ))}
        </div>
        <button type="button" className="start-battle-button tournament-overview-begin" onClick={begin} disabled={leaving} autoFocus>
          BEGIN TOURNAMENT
        </button>
      </div>
    </div>
  );
}
