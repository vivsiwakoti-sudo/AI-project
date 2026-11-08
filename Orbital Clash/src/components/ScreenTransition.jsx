import { useEffect, useRef, useState } from "react";

// ============================================================================
// Screen transitions
// ----------------------------------------------------------------------------
// Every screen change (picking fighters -> arena -> battle report, the whole
// tournament flow, champion, back to the roster) is animated with the same
// beat, so the game reads as one continuous broadcast instead of a slideshow:
//
//   1. OUT    the leaving screen sinks, blurs and dissolves     (--xf-out)
//   2. FLASH  a glitch bar sweeps across the viewport           (--xf-flash)
//   3. IN     the arriving screen rises out of the flash and settles (--xf-in)
//
// The leaving screen stays mounted on its own until its exit has played;
// swapping instantly would leave nothing to animate out. Timings live in
// App.css so JS only has to wait for the CSS to finish.
//
// `prefers-reduced-motion` collapses all of it into a quick crossfade.
// Screens are compared by `screenKey`, so new data (a new battle report, a new
// tournament) does not replay the animation.
// ============================================================================

const OUT_MS = 340; // must match --xf-out
const IN_MS = 520;  // must match --xf-in
// Reduced motion: a short crossfade, not the full cinematic timing. index.css
// pins the stage animations to the same lengths, because the global reduced-motion
// rule would otherwise strip the exit and leave the swap invisible.
const REDUCED_OUT_MS = 120;
const REDUCED_IN_MS = 150;

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const reducedMotion = () => Boolean(globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);

// Two animation frames: the point at which the leaving stage is guaranteed to
// have been committed and painted, so its exit animation has really started.
const nextFrames = () => new Promise(resolve => {
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    resolve();
  };
  requestAnimationFrame(() => requestAnimationFrame(finish));
  // A hidden tab stops serving animation frames entirely; never strand the
  // transition on one.
  setTimeout(finish, 400);
});

export default function ScreenTransition({ screenKey, render }) {
  // `screen` is what is on stage; `leaving` is the screen still dissolving on
  // top of it (null when nothing is in flight).
  const [screen, setScreen] = useState(screenKey);
  const [leaving, setLeaving] = useState(null);
  // A counter, not a boolean: each value mounts a fresh flash node, so its
  // animation plays exactly once per screen change. Null while nothing is in
  // flight. A plain `0/false` toggle would stop a new transition's flash being
  // mounted if the reset had not been rendered yet.
  const [flash, setFlash] = useState(null);

  // The screen the player is heading to while an animation is in flight. It is
  // never dropped: it becomes the next transition the moment this one settles,
  // so mashing buttons can never strand the player on an old screen.
  const wantedRef = useRef(screenKey);
  const busyRef = useRef(false);
  // `render` is kept in a ref, not an effect dependency: App passes a new inline
  // render on every render, and depending on it would abort (and restart) the
  // in-flight transition on every app re-render. Written during render on
  // purpose - an effect only syncs after paint, and the freshly mounted leaving
  // stage is painted (crashed, if it saw a stale screen's data) before that.
  const renderRef = useRef(render);
  renderRef.current = render;

  useEffect(() => {
    wantedRef.current = screenKey;
    if (screenKey === screen || busyRef.current) return undefined;

    busyRef.current = true;
    let cancelled = false;

    (async () => {
      const outMs = reducedMotion() ? REDUCED_OUT_MS : OUT_MS;
      const inMs = reducedMotion() ? REDUCED_IN_MS : IN_MS;

      // Screen A dissolves while still mounted.
      setLeaving(screen);
      setFlash(f => (f ?? 0) + 1);
      // Hand the browser a frame to mount the leaving stage and start its
      // animation before the countdown to the swap begins.
      await nextFrames();
      if (cancelled) return;
      await wait(outMs);
      if (cancelled) return;

      // Screen B takes its place and plays the entrance.
      const target = wantedRef.current ?? screenKey;
      setScreen(target);
      setLeaving(null);

      await wait(inMs);
      if (cancelled) return;

      busyRef.current = false;

      // A screen requested while this beat was playing is already known by the
      // ref but was never applied (the effect that would apply it bailed on the
      // busy flag). Apply it now instead of stranding the player on the old one.
      const pendingKey = wantedRef.current ?? target;
      if (pendingKey !== target) setScreen(pendingKey);
    })();

    return () => {
      cancelled = true;
      // A cancelled run must not leave the wrapper locked, and it must not leave
      // a leaving stage (or a running flash) behind: the new `screenKey` is
      // starting its own transition. Every run is cleaned up when it swaps
      // `screen`, which re-runs this effect, so this is the normal exit path.
      // Covered: React re-renders the effect body once on a re-run before
      // running the returned cleanup, so the replacement run has already
      // queued the next still-frame and cannot be unmounted by this.
      busyRef.current = false;
      setLeaving(null);
      setFlash(null);
    };
  }, [screenKey, screen]);

  return (
    <div className="screen-transition">
      {/* No `key` on the stage on purpose. A key makes React replace the whole
          node on swap; when the swap lands before the browser's next paint there
          is nothing to animate out, and the leaving stage is lost. The entrance
          animation replays instead because the arriving screen's content is
          keyed on the screen (see App.jsx), which remounts inside a stage whose
          identity never changes. */}
      <div className="screen-transition-stage" data-screen={screen}>
        {renderRef.current(screen)}
      </div>
      {leaving !== null && leaving !== screen && (
        <div className="screen-transition-stage screen-transition-leaving" aria-hidden="true">
          {renderRef.current(leaving)}
        </div>
      )}
      {flash !== null && <div className="screen-transition-flash" key={flash} aria-hidden="true" />}
    </div>
  );
}
