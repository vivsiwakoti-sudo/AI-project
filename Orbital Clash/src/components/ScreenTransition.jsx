import { useEffect, useRef, useState } from "react";

// ============================================================================
// Screen transitions
// ----------------------------------------------------------------------------
// Every screen change (pick fighters -> arena -> battle report, the whole
// tournament flow -> champion, back to the roster) gets the same beat, so the
// game reads as one continuous broadcast instead of a slideshow:
//
//   1. OUT    the leaving screen sinks, blurs and dissolves  (--xf-out)
//   2. FLASH  a glitch bar sweeps across the viewport        (--xf-flash)
//   3. IN     the arriving screen rises out of the flash and settles (--xf-in)
//
// Timings live in App.css so JS only has to wait for the CSS to finish.
// `prefers-reduced-motion` collapses all of it into a quick crossfade.
// Screens are compared by `screenKey`; changing only the data (a new battle
// report, a new tournament) does not replay the animation.
// ============================================================================

const OUT_MS = 190; // must match --xf-out
const IN_MS = 520;  // must match --xf-in

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

export default function ScreenTransition({ screenKey, render }) {
  const [current, setCurrent] = useState(screenKey);
  const [exiting, setExiting] = useState(false);
  // The screen the player is heading to while an animation is in flight. It is
  // never dropped: the moment the running transition settles, it becomes the
  // next one, so mashing buttons can never strand the player on an old screen.
  const wantedRef = useRef(null);
  const busyRef = useRef(false);

  useEffect(() => {
    if (wantedRef.current === null) wantedRef.current = current;
    wantedRef.current = screenKey;
    if (screenKey === current) return undefined;

    if (busyRef.current) return undefined;
    busyRef.current = true;
    let cancelled = false;

    (async () => {
      // The leaving screen fades out.
      setExiting(true);
      await wait(OUT_MS);
      if (cancelled) return;

      const next = wantedRef.current ?? screenKey;
      wantedRef.current = next;
      setCurrent(next);
      setExiting(false);

      // The arriving screen animates in.
      await wait(IN_MS);
      if (cancelled) return;

      busyRef.current = false;
      // Something was clicked mid-animation: run again for that screen.
      if (wantedRef.current !== null && wantedRef.current !== next) {
        setCurrent(screenKey === next ? wantedRef.current : screenKey);
        setExiting(false);
      }
    })();

    return () => { cancelled = true; };
  }, [screenKey, current]);

  return (
    <div className={`screen-transition${exiting ? " screen-transition-exiting" : ""}`}>
      <div className="screen-transition-inner" key={current}>
        {render(current)}
      </div>
      <div className="screen-transition-flash" aria-hidden="true" />
    </div>
  );
}
