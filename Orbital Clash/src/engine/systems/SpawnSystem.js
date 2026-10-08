// Spawn placement for 2-4 fighters.
//
// The arena is a square with a 20px inner border. Every fighter starts the same
// distance in from its edge so no seat is closer to the middle than another.
//
//   2 fighters: left-middle and right-middle (the original layout)
//   3 fighters: left, right, and BOTTOM-MIDDLE
//   4 fighters: left, right, bottom-middle, and TOP-MIDDLE
//
// Each fighter also gets an inward-facing launch direction. The random angle is
// applied PER FIGHTER around that inward heading, so every fighter sets off on
// its own trajectory rather than all sharing one mirrored value.
const INNER_BORDER = 20;
const EDGE_INSET = 180; // centre distance from the border for the side seats

// Where each seat sits, as a fraction of the arena, plus the heading it faces.
// Angles are in radians; 0 points right, PI/2 points down (canvas convention).
const SEATS = [
  { key: "left", x: 0.25, y: 0.5, heading: 0 },              // faces right
  { key: "right", x: 0.75, y: 0.5, heading: Math.PI },        // faces left
  { key: "bottom", x: 0.5, y: 0.75, heading: -Math.PI / 2 },   // faces up
  { key: "top", x: 0.5, y: 0.25, heading: Math.PI / 2 }     // faces down
];

// The random spread applied around a fighter's inward heading, in radians.
const SPREAD = Math.PI / 7;

// Returns a launch direction for one fighter: an inward heading fanned open by a
// random amount unique to that fighter.
export function launchDirectionFor(index) {
  const seat = SEATS[index % SEATS.length];
  const jitter = (Math.random() - 0.5) * 2 * SPREAD;
  const angle = seat.heading + jitter;
  return { vx: Math.cos(angle), vy: Math.sin(angle), angle };
}

// Returns { x, y } for a seat, scaled to the arena. Seats are positioned by a
// fraction of the playable area so all of them are inset the same distance from
// the border regardless of arena size.
export function spawnPositionFor(index, arenaSize = 800) {
  const seat = SEATS[index % SEATS.length];
  const playable = arenaSize - INNER_BORDER * 2;
  const x = INNER_BORDER + playable * seat.x;
  const y = INNER_BORDER + playable * seat.y;
  return { x, y, key: seat.key };
}

export const SEAT_COUNT = SEATS.length;
export { INNER_BORDER, EDGE_INSET };