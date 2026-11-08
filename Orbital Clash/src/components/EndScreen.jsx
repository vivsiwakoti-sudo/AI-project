import { useEffect, useRef, useState } from "react";
import { audioManager } from "../engine/audio/AudioManager";
import { recordBattle } from "../engine/battleHistory";

const RECORDS_KEY = "arena-battles-records";

function readRecords() {
  if (typeof window === "undefined") return {};
  try {
    const stored = JSON.parse(window.localStorage.getItem(RECORDS_KEY) || "{}");
    return stored && typeof stored === "object" ? stored : {};
  } catch {
    return {};
  }
}

function writeRecords(records) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
  } catch {
    /* storage disabled - records just will not persist */
  }
}

// The winner jumps up and down on a line above the report.
function WinnerMark({ color }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    let raf;
    const loop = (time) => {
      const hop = Math.abs(Math.sin(time / 260)) * 26;
      ctx.clearRect(0, 0, 160, 110);
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.shadowBlur = 18;
      ctx.shadowColor = color;
      ctx.beginPath();
      ctx.moveTo(20, 88);
      ctx.lineTo(140, 88);
      ctx.stroke();

      const y = 74 - hop;
      const squash = 1 + Math.sin(time / 260) * 0.06;
      ctx.beginPath();
      ctx.ellipse(80, y, 20 * squash, 20 / squash, 0, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.restore();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [color]);

  return <canvas ref={canvasRef} width={160} height={110} aria-hidden="true" />;
}

export default function EndScreen({ results: rawResults, aborted = false, onReturn }) {
  // Guard *inside* the body, not via a destructuring default: StrictMode remounts
  // a mount that exactly filled the root, and that rebuild passes the props the
  // error handler saw (undefined) straight through. A parameter default is not
  // re-applied when a render is replayed with those saved props; this is.
  const results = Array.isArray(rawResults) ? rawResults : [];
  const [records, setRecords] = useState(null);
  const committed = useRef(false);

  // Ranked by survival time, longest first: the fighter who stayed alive last is
  // 1st, the one knocked out first is last. The arena stamps `placement` from the
  // same ordering, so it agrees with this sort; survival time itself is the
  // primary key here because it is the number shown in the SURVIVED column, and
  // ranking by anything else would print a table that contradicts its own order.
  // Ties keep the incoming (spawn) order, compared explicitly so the result is
  // identical in every engine rather than relying on sort stability.
  const ordered = results
    .map((fighter, index) => ({ fighter, index }))
    .sort((a, b) => {
      const bySurvival = (b.fighter.survivalTime ?? 0) - (a.fighter.survivalTime ?? 0);
      if (bySurvival !== 0) return bySurvival;
      const byPlacement = (a.fighter.placement ?? Number.MAX_SAFE_INTEGER) - (b.fighter.placement ?? Number.MAX_SAFE_INTEGER);
      if (byPlacement !== 0) return byPlacement;
      return a.index - b.index;
    })
    .map(entry => entry.fighter);

  const winner = aborted ? null : ordered[0] ?? null;
  // Everyone who is not the winner lost this battle. With four fighters that is
  // three losers, not one, so the record is applied per fighter rather than to a
  // single "loser" slot.
  const losers = aborted || !winner ? [] : ordered.slice(1);
  // The battle length is the same for every fighter (it is the whole match, not a
  // per-fighter survival time), so take the longest reported value rather than
  // trusting the first element - the array order is spawn order, not ranking.
  const battleSeconds = Math.max(1, Math.round(
    results.reduce((longest, f) => Math.max(longest, f.battleDuration ?? 0), 0)
  ));

  // Apply the +1 win / +1 loss exactly once per battle, then show the new totals.
  // An aborted battle (Exit Game) is a no-contest: nobody wins or loses.
  useEffect(() => {
    if (committed.current) return;
    committed.current = true;

    // Append this battle to the persistent history log. This runs from the same
    // once-only commit effect as the records below, so a battle is logged exactly
    // once even though the end screen can re-render (mute, etc.). It is
    // recorded for aborted battles too - a no-contest is part of the history -
    // which is why it sits above the early return.
    recordBattle(results, { aborted });

    if (aborted || !winner || losers.length === 0) {
      setRecords({});
      return;
    }

    const stored = readRecords();
    const apply = (fighter, didWin) => {
      const current = stored[fighter.name] || { wins: fighter.wins || 0, losses: fighter.losses || 0 };
      const next = {
        wins: current.wins + (didWin ? 1 : 0),
        losses: current.losses + (didWin ? 0 : 1),
        // Kills accumulate across every battle this class has fought, the same way
        // wins do. The current count is clamped to 0 because a corrupted or
        // hand-edited localStorage entry must not poison the running total with NaN.
        kills: (current.kills || 0) + Math.max(0, Math.floor(fighter.totalKills || 0))
      };
      stored[fighter.name] = next;
      return next;
    };

    const updated = { [winner.name]: apply(winner, true) };
    losers.forEach(fighter => { updated[fighter.name] = apply(fighter, false); });
    setRecords(updated);
    writeRecords(stored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [winner, aborted, results]);

  useEffect(() => {
    audioManager.stopMusic();
    if (!aborted) audioManager.playVictorySound();
  }, [aborted]);

  const statBlock = (fighter) => {
    const record = records?.[fighter.name] || { wins: fighter.wins || 0, losses: fighter.losses || 0 };
    const appearances = record.wins + record.losses;
    const winPercentage = appearances ? (record.wins / appearances) * 100 : 0;
    // Kills are per battle, so this fight's total is added to the stored career
    // figure rather than read from it - a battle that was just played has not been
    // written back yet on the first render.
    const kills = records?.[fighter.name]
      ? record.kills || 0
      : (record.kills || 0) + Math.max(0, Math.floor(fighter.totalKills || 0));
    return { ...record, kills, appearances, winPercentage };
  };

  const totalDamage = results.reduce((sum, f) => sum + (f.totalDamageDealt || 0), 0);

  return (
    <main className="results-screen">
      {aborted || !winner ? (
        <>
          <div className="roster-eyebrow">NO CONTEST</div>
          <h1>BATTLE ABANDONED</h1>
          <div className="results-rule" />

          <div className="results-summary">
            <div><span>FIGHT LENGTH</span><b>{battleSeconds}s</b></div>
            <div><span>TOTAL DAMAGE</span><b>{Math.floor(totalDamage)}</b></div>
            <div><span>WINNER</span><b>NONE</b></div>
          </div>
        </>
      ) : (
        <>
          <WinnerMark color={winner.color} />
          <div className="roster-eyebrow">WINNER</div>
          <h1>{winner.name}</h1>
          <div className="results-rule" />

          <div className="results-summary">
            <div><span>FIGHT LENGTH</span><b>{battleSeconds}s</b></div>
            <div><span>TOTAL DAMAGE</span><b>{Math.floor(totalDamage)}</b></div>
            <div><span>WINNER HP</span><b>{Math.max(0, Math.ceil(winner.health))}</b></div>
          </div>
        </>
      )}

      <div className="results-table">
        {ordered.map((f, i) => {
          const stats = statBlock(f);
          const isWinner = !aborted && f === winner;
          // Placement is stamped by the arena; fall back to the sorted position so
          // the table is still meaningful if a battle handed over partial results.
          const placement = f.placement ?? i + 1;
          const ordinal = placement === 1 ? "1st" : placement === 2 ? "2nd" : placement === 3 ? "3rd" : `${placement}th`;
          return (
            <div key={i} className={`result-row ${isWinner ? "result-row-winner" : ""}`} style={{ "--result-color": f.color }}>
              <header>
                <span className="result-name"><b className="result-placement">{ordinal}</b> {f.name}</span>
                <span className="result-outcome">{aborted ? "NO RESULT" : isWinner ? "VICTORY" : "DEFEAT"}</span>
              </header>

              <div className="result-group">
                <span className="result-group-label">THIS FIGHT</span>
                <div className="result-metrics">
                  <div><span>DAMAGE</span><b>{Math.floor(f.totalDamageDealt || 0)}</b></div>
                  <div><span>TAKEN</span><b>{Math.floor(f.totalDamageTaken || 0)}</b></div>
                  <div><span>KILLS</span><b>{Math.max(0, Math.floor(f.totalKills || 0))}</b></div>
                  <div><span>HITS</span><b>{f.totalHits || 0}</b></div>
                  <div><span>SURVIVED</span><b>{Math.round(f.survivalTime ?? f.battleDuration ?? 0)}s</b></div>
                  <div><span>HP LEFT</span><b>{Math.max(0, Math.ceil(f.health))}</b></div>
                </div>
              </div>

              <div className="result-group">
                <span className="result-group-label">ALL-TIME RECORD</span>
                <div className="result-metrics">
                  <div><span>WINS</span><b>{stats.wins}</b></div>
                  <div><span>LOSSES</span><b>{stats.losses}</b></div>
                  <div><span>KILLS</span><b>{stats.kills}</b></div>
                  <div><span>APPEARANCES</span><b>{stats.appearances}</b></div>
                  <div><span>WIN %</span><b>{stats.winPercentage.toFixed(0)}%</b></div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <button className="return-roster-button" onClick={() => { audioManager.playUiClick(); onReturn(); }}>RETURN TO ROSTER</button>
    </main>
  );
}
