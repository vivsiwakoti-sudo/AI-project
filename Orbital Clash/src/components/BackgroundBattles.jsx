import { useEffect, useRef } from "react";
import { createTournamentBout } from "../engine/tournament";
import { drawBattleFrame } from "../engine/systems/BattleSimulation";
import { FIGHTER_CLASSES } from "../engine/fighterDefinitions";
import { audioManager } from "../engine/audio/AudioManager";
import { getSettings } from "../engine/settings";

const BATTLE_COUNT = 3;
const ARENA_SIZE = 600;
const PLAYBACK_SPEED = 2;
const MAX_FRAME_SECONDS = 1 / 30;
const CLASS_NAMES = Object.keys(FIGHTER_CLASSES);

// Two random classes, neither of which is in `exclude` (the slot's previous pairing),
// so each battle keeps rotating through the roster.
function pickPair(exclude) {
  const pool = CLASS_NAMES.filter(name => !exclude.includes(name));
  const first = pool[Math.floor(Math.random() * pool.length)];
  const rest = pool.filter(name => name !== first);
  const second = rest[Math.floor(Math.random() * rest.length)];
  return [first, second];
}

export default function BackgroundBattles() {
  const canvasRefs = useRef([]);

  useEffect(() => {
    audioManager.setSfxSilenced(true);
    const performanceMode = getSettings().performanceMode;

    const slots = Array.from({ length: BATTLE_COUNT }, (_, index) => ({
      ctx: canvasRefs.current[index]?.getContext("2d") || null,
      bout: null,
      previous: []
    }));

    const startBout = slot => {
      const [first, second] = pickPair(slot.previous);
      slot.bout = createTournamentBout(first, second, { arenaSize: ARENA_SIZE, performanceMode });
      slot.previous = [first, second];
    };

    let frameId = 0;
    let lastTime = null;
    let stopped = false;

    const loop = time => {
      if (stopped) return;
      if (lastTime === null) lastTime = time;
      const dt = Math.min(Math.max((time - lastTime) / 1000, 0), MAX_FRAME_SECONDS);
      lastTime = time;

      slots.forEach(slot => {
        if (!slot.bout) startBout(slot);
        const bout = slot.bout;
        if (!bout) return;

        if (bout.finished) {
          // Let the final explosion play out, then hand the slot a new pairing.
          const stillPlaying = bout.stepAfterglow(dt);
          if (!stillPlaying) slot.bout = null;
        } else {
          bout.step(dt * PLAYBACK_SPEED);
        }

        if (slot.ctx) {
          drawBattleFrame(slot.ctx, {
            fighters: bout.fighters,
            particles: bout.particles,
            arenaSize: bout.arenaSize,
            time: bout.elapsedSeconds,
            suddenDeath: bout.suddenDeath
          });
        }
      });

      frameId = requestAnimationFrame(loop);
    };

    frameId = requestAnimationFrame(loop);
    return () => {
      stopped = true;
      cancelAnimationFrame(frameId);
      audioManager.setSfxSilenced(false);
    };
  }, []);

  return (
    <div className="title-battles" aria-hidden="true">
      {Array.from({ length: BATTLE_COUNT }, (_, index) => (
        <canvas
          key={index}
          ref={element => { canvasRefs.current[index] = element; }}
          className="title-battle"
          width={ARENA_SIZE}
          height={ARENA_SIZE}
        />
      ))}
    </div>
  );
}
