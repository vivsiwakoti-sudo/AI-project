// Neon mesh and vortex behind a screen. Styles live in App.css (`.roster-backdrop*`).
// Render it as a sibling of the screen's content, not a child, so content transforms
// do not become its containing block.
export default function NeonBackdrop() {
  return (
    <div className="roster-backdrop" aria-hidden="true">
      <div className="roster-backdrop-mesh" />
      <div className="roster-backdrop-nodes" />
      <div className="roster-backdrop-vortex" />
      <div className="roster-backdrop-vortex roster-backdrop-vortex-inner" />
      <div className="roster-backdrop-core" />
    </div>
  );
}
