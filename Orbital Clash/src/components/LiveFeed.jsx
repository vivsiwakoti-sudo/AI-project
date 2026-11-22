import { useEffect, useRef } from "react";

// How long a line stays in the feed before it is removed.
export const LIVE_FEED_LINGER_MS = 4000;
// The most lines shown at once; older lines are dropped as new ones arrive.
export const LIVE_FEED_MAX_LINES = 4;

function FeedLine({ id, text, color, onExpire }) {
  // Kept in a ref so a new onExpire identity does not restart the timer.
  const expireRef = useRef(onExpire);
  useEffect(() => { expireRef.current = onExpire; }, [onExpire]);

  useEffect(() => {
    const timer = setTimeout(() => expireRef.current(id), LIVE_FEED_LINGER_MS);
    return () => clearTimeout(timer);
  }, [id]);

  return <div className="live-feed-line" style={{ "--feed-color": color }}>{text}</div>;
}

// A non-interactive overlay in the top-left of the arena listing recent events.
export default function LiveFeed({ entries, onExpire }) {
  if (entries.length === 0) return null;
  return (
    <div className="live-feed" aria-live="polite">
      {entries.map(entry => (
        <FeedLine key={entry.id} id={entry.id} text={entry.text} color={entry.color} onExpire={onExpire} />
      ))}
    </div>
  );
}
