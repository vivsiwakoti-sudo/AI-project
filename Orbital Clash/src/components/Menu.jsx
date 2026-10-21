import { useEffect, useMemo, useState } from "react";
import { FIGHTER_CLASSES } from "../engine/fighterDefinitions";
import { audioManager } from "../engine/audio/AudioManager";
import { ARENA_SIZE_OPTIONS, DEFAULT_ARENA_SIZE, MAX_FIGHTERS, MIN_FIGHTERS } from "../engine/config";
import { loadHistory, clearHistory } from "../engine/battleHistory";
import { hasResumableTournament } from "../engine/tournament";
import ClassCard from "./MenuComponents/ClassCard";

const RECORDS_KEY = "arena-battles-records";

// Persistent win/loss records for every class (the +1 shown on the end screen).
function loadRecords() {
  if (typeof window === "undefined") return {};
  try {
    const stored = JSON.parse(window.localStorage.getItem(RECORDS_KEY) || "{}");
    return stored && typeof stored === "object" ? stored : {};
  } catch {
    return {};
  }
}

// Wipes every class's stored wins/losses.
function clearRecords() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(RECORDS_KEY);
  } catch {
    /* storage disabled - nothing to clear */
  }
}

// 1 -> "1st", 2 -> "2nd", ... Used by the battle-history log to rank the
// participants of each saved fight.
function ordinal(n) {
  const value = Math.floor(Number(n));
  if (!Number.isFinite(value)) return "—";
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${value}th`;
  switch (value % 10) {
    case 1: return `${value}st`;
    case 2: return `${value}nd`;
    case 3: return `${value}rd`;
    default: return `${value}th`;
  }
}

export default function Menu({ onStart, onStartTournament }) {
  const [selected, setSelected] = useState([]);
  const [info, setInfo] = useState(null);
  const [filter, setFilter] = useState("ALL");
  const [sortDescending, setSortDescending] = useState(false);
  const [records, setRecords] = useState(loadRecords);
  const [confirmReset, setConfirmReset] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState(loadHistory);
  const [confirmClearHistory, setConfirmClearHistory] = useState(false);
  const [arenaSize, setArenaSize] = useState(DEFAULT_ARENA_SIZE);
  // Read once on mount: the menu only needs to know whether a partial bracket is
  // waiting, and nothing on this screen can create or finish one.
  const [canResumeTournament, setCanResumeTournament] = useState(hasResumableTournament);

  useEffect(() => {
    audioManager.playMenuMusic();
  }, []);

  // Right-click opens the detail panel; Escape or any other click closes it.
  useEffect(() => {
    if (!info) return;
    // Clicks inside the panel belong to its own buttons, so they must not close it.
    const close = (event) => { if (!event.target.closest?.(".fighter-info-panel")) setInfo(null); };
    const onKey = (event) => { if (event.key === "Escape") setInfo(null); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", close);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", close);
    };
  }, [info]);

  // The history panel closes on Escape as well, so it behaves like the fighter
  // detail modal next to it rather than trapping the player in the overlay.
  useEffect(() => {
    if (!showHistory) return;
    const onKey = (event) => { if (event.key === "Escape") setShowHistory(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showHistory]);

  // Any count from 2 to 4 is a legal battle, so the roster is ready as soon as
  // the minimum is met. The arena derives everything else (spawn seats, HUD
  // columns, placements) from however many fighters it is handed.
  const canStart = selected.length >= MIN_FIGHTERS && selected.length <= MAX_FIGHTERS;

  const toggleSelect = (name) => {
    audioManager.playUiClick();
    if (selected.includes(name)) {
      setSelected(selected.filter((n) => n !== name));
    } else if (selected.length < MAX_FIGHTERS) {
      setSelected([...selected, name]);
    } else {
      // Keep the roster at the cap: drop the oldest pick and append the new one,
      // so clicking a fifth class swaps rather than silently doing nothing.
      setSelected([...selected.slice(1), name]);
    }
  };

  const handleRightClick = (e, name) => {
    e.preventDefault();
    e.stopPropagation();
    setInfo(name);
  };

  // Wiping progress is destructive, so it takes two clicks: the first arms the
  // confirmation, the second commits.
  const handleResetProgress = () => {
    audioManager.playUiClick();
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    clearRecords();
    setRecords({});
    setConfirmReset(false);
  };

  // The history panel is read-only apart from the destructive "clear" action,
  // which (like the progress reset) takes two clicks to commit.
  const handleOpenHistory = () => {
    audioManager.playUiClick();
    setHistory(loadHistory());
    setConfirmClearHistory(false);
    setShowHistory(true);
  };

  const handleClearHistory = () => {
    audioManager.playUiClick();
    if (!confirmClearHistory) {
      setConfirmClearHistory(true);
      return;
    }
    setHistory(clearHistory());
    setConfirmClearHistory(false);
  };

  const handleRandomSelection = () => {
    audioManager.playUiClick();
    const names = Object.keys(FIGHTER_CLASSES);
    const count = MIN_FIGHTERS + Math.floor(Math.random() * (MAX_FIGHTERS - MIN_FIGHTERS + 1));
    for (let i = 0; i < count; i++) {
      const swapIndex = i + Math.floor(Math.random() * (names.length - i));
      [names[i], names[swapIndex]] = [names[swapIndex], names[i]];
    }
    setSelected(names.slice(0, count));
  };

  const statFor = (name) => {
    const record = records[name] || {};
    const wins = record.wins || 0;
    const losses = record.losses || 0;
    const appearances = wins + losses;
    return {
      wins,
      losses,
      // Career eliminations, accumulated by the end screen after each battle.
      kills: record.kills || 0,
      appearances,
      orientation: wins / Math.max(1, losses),
      winRate: appearances ? wins / appearances : 0
    };
  };

  const filterOptions = ["ALL", "MELEE", "PROJECTILE", "BEAM", "AOE", "BODY", "TRAIL"];
  // Every attackType used in fighterDefinitions.js maps to one filter bucket.
  const getFilterCategory = (attackType) => {
    const categoryMap = {
      Melee: "MELEE",
      Sword: "MELEE",
      Hook: "MELEE",
      Projectile: "PROJECTILE",
      Bullet: "PROJECTILE",
      Spear: "PROJECTILE",
      "Rope-dart": "PROJECTILE",
      Potion: "PROJECTILE",
      Beam: "BEAM",
      Area: "AOE",
      Bombs: "AOE",
      Body: "BODY",
      Trail: "TRAIL"
    };
    return categoryMap[attackType] || attackType.toUpperCase();
  };

  const visibleFighters = useMemo(() => {
    return Object.entries(FIGHTER_CLASSES)
      .filter(([, fighter]) => filter === "ALL" || getFilterCategory(fighter.attackType) === filter)
      .sort(([nameA], [nameB]) => {
        const comparison = nameA.localeCompare(nameB);
        return sortDescending ? -comparison : comparison;
      });
  }, [filter, sortDescending]);

  const infoFighter = info ? FIGHTER_CLASSES[info] : null;
  const infoStats = info ? statFor(info) : null;

  return (
    <main className="roster-screen">
      <div className="roster-heading">
        <div className="roster-eyebrow">ROSTER <span>•</span> {Object.keys(FIGHTER_CLASSES).length} FIGHTERS</div>
        <h1 className="menu-header">PICK YOUR FIGHTERS</h1>
        <div className="roster-filters">
          {filterOptions.map(option => <button key={option} className={filter === option ? "filter-active" : ""} onClick={() => setFilter(option)}>{option}</button>)}
          <button className="sort-button" onClick={() => setSortDescending(value => !value)}>A-Z <span>{sortDescending ? "↓" : "↑"}</span></button>
          <button className="random-selection-button" onClick={handleRandomSelection} title="Select 2 to 4 random fighters">RANDOM</button>
          <button
            className="battle-history-button"
            onClick={handleOpenHistory}
            title="View the log of past battles"
          >
            BATTLE HISTORY{history.length > 0 ? ` (${history.length})` : ""}
          </button>
          <button
            className={`reset-progress-button ${confirmReset ? "reset-progress-confirm" : ""}`}
            onClick={handleResetProgress}
            onBlur={() => setConfirmReset(false)}
            title="Wipe every class's stored wins and losses"
          >
            {confirmReset ? "CONFIRM RESET" : "RESET PROGRESS"}
          </button>
          {/* Primary entry to the autonomous 25-class bracket. It sits with the
              roster actions because it starts a mode, not a single battle. */}
          <button
            className="tournament-mode-button"
            onClick={() => { audioManager.playUiClick(); setCanResumeTournament(false); onStartTournament?.(); }}
            title={canResumeTournament
              ? "Continue the tournament you left unfinished"
              : "Watch all 25 classes fight a single-elimination tournament"}
          >
            🏆 {canResumeTournament ? "RESUME TOURNAMENT" : "TOURNAMENT MODE"}
          </button>
        </div>
      </div>
      <div className="fighter-grid">
        {visibleFighters.map(([name, fighter]) => {
          const stats = statFor(name);
          return (
            <ClassCard
              key={name}
              fighter={fighter}
              stats={stats}
              isSelected={selected.includes(name)}
              onClick={() => toggleSelect(name)}
              onContextMenu={(e) => handleRightClick(e, name)}
            />
          );
        })}
      </div>

      {infoFighter && (
        <div className="fighter-info-overlay" role="dialog" aria-label={`${infoFighter.name} details`}>
          <div className="fighter-info-panel" style={{ "--class-accent": infoFighter.color }}>
            <header>
              <div>
                <div className="roster-eyebrow">{infoFighter.attackType}</div>
                <h2>{infoFighter.name}</h2>
              </div>
              <button className="fighter-info-close" onClick={() => setInfo(null)} aria-label="Close fighter details">×</button>
            </header>
            <p className="fighter-info-body">{infoFighter.description2 || infoFighter.description}</p>
            <div className="fighter-info-grid">
              <span>HP <b>{infoFighter.health}</b></span>
              <span>DMG <b>{infoFighter.damage}</b></span>
              <span>SPD <b>{infoFighter.speed} px/f</b></span>
              <span>SIZE <b>{infoFighter.bodySize}</b></span>
              <span>CD <b>{infoFighter.cooldown ? `${infoFighter.cooldown}s` : "N/A"}</b></span>
            </div>
            <div className="fighter-info-record">
              <div><span>WINS</span><b>{infoStats.wins}</b></div>
              <div><span>LOSSES</span><b>{infoStats.losses}</b></div>
              <div><span>KILLS</span><b>{infoStats.kills}</b></div>
              <div><span>APPEARANCES</span><b>{infoStats.appearances}</b></div>
              <div><span>WIN %</span><b>{infoStats.appearances ? `${(infoStats.winRate * 100).toFixed(1)}%` : "--"}</b></div>
            </div>
            {infoFighter.keywords?.length > 0 && (
              <div className="fighter-info-tags">
                {infoFighter.keywords.map(word => <span key={word}>{word.toUpperCase()}</span>)}
              </div>
            )}
            <button className="fighter-info-select" onClick={() => { toggleSelect(infoFighter.name); setInfo(null); }}>
              {selected.includes(infoFighter.name) ? "REMOVE FROM SELECTION" : "SELECT FIGHTER"}
            </button>
          </div>
        </div>
      )}

      {showHistory && (
        <div className="fighter-info-overlay" role="dialog" aria-label="Battle history">
          <div className="battle-history-panel">
            <header>
              <div>
                <div className="roster-eyebrow">SAVED LOCALLY</div>
                <h2>BATTLE HISTORY</h2>
              </div>
              <button className="fighter-info-close" onClick={() => setShowHistory(false)} aria-label="Close battle history">×</button>
            </header>

            {history.length === 0 ? (
              <p className="battle-history-empty">No battles have been fought yet. Finish a battle and it will be saved here.</p>
            ) : (
              <ol className="battle-history-list">
                {history.map((entry, i) => (
                  <li key={`${entry.timestamp ?? "entry"}-${i}`} className={`battle-history-row ${entry.aborted ? "battle-history-aborted" : ""}`}>
                    <div className="battle-history-row-head">
                      <span className="battle-history-outcome">
                        {entry.aborted ? "NO CONTEST" : entry.winner ? `${entry.winner} WIN` : "NO RESULT"}
                      </span>
                      <span className="battle-history-meta">
                        {entry.timestamp ? new Date(entry.timestamp).toLocaleString() : "Unknown time"}
                        {entry.durationSeconds > 0 ? ` • ${entry.durationSeconds}s` : ""}
                      </span>
                    </div>
                    <div className="battle-history-fighters">
                      {entry.participants
                        .slice()
                        .sort((a, b) => (a.placement ?? 99) - (b.placement ?? 99))
                        .map((p, j) => (
                          <span key={`${p.name}-${j}`} className="battle-history-fighter" style={{ "--fighter-color": p.color }}>
                            <b>{p.placement ? ordinal(p.placement) : "—"}</b> {p.name}
                            {p.kills > 0 ? <i>☠{p.kills}</i> : null}
                          </span>
                        ))}
                    </div>
                  </li>
                ))}
              </ol>
            )}

            <button
              className={`battle-history-clear ${confirmClearHistory ? "battle-history-clear-confirm" : ""}`}
              onClick={handleClearHistory}
              onBlur={() => setConfirmClearHistory(false)}
              disabled={history.length === 0}
            >
              {confirmClearHistory ? "CONFIRM CLEAR" : "CLEAR HISTORY"}
            </button>
          </div>
        </div>
      )}

      <footer className="selection-dock"><div className="selection-slots">{Array.from({ length: MAX_FIGHTERS }, (_, i) => (<span key={i} className={selected[i] ? "slot-filled" : ""}>{selected[i] || `— FIGHTER ${i + 1} —`}</span>))}<small>{canStart ? `${selected.length}-WAY FREE FOR ALL — READY` : `SELECT ${MIN_FIGHTERS} TO ${MAX_FIGHTERS} FIGHTERS`}</small></div><div className="map-size-picker" role="radiogroup" aria-label="Map size"><span>MAP</span>{ARENA_SIZE_OPTIONS.map((size) => (<button key={size} type="button" role="radio" aria-checked={arenaSize === size} className={arenaSize === size ? "map-size-active" : ""} onClick={() => { audioManager.playUiClick(); setArenaSize(size); }}>{size}x{size}</button>))}</div><button disabled={!canStart} className="start-battle-button" onClick={() => { audioManager.playUiClick(); onStart(selected.map((n) => ({ ...FIGHTER_CLASSES[n], ...statFor(n) })), arenaSize); }}>START BATTLE</button></footer>
    </main>
  );
}
