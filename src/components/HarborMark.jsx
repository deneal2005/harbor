import { cx } from '../utils/cx.js';

/*
 Harbor brand mark — "Container Stack", full composition from the finalized login screen.
 A navy tile; on its quay two off-white cargo blocks below, one teal on top, and a line of
 teal water shimmering beneath the quay. Fixed palette from the logo kit, never the app theme:
   navy #0F2D3F · teal #1F8A7D (reversed top block #7FD1C7) · off-white #EAF2F2.

 variant="tile" (default): the navy rounded tile, i.e. the app icon form — for dark and
 light chrome alike, from the sidebar down to a 16 px favicon.
 variant="flat": no tile, full-bleed — the light-theme drawing (navy blocks, teal top and
 water on white), for paper and documents.

 Effects (all CSS, see the Harbor brand section in index.css):
   dock  — plays the "dock-in" once: the quay is born as a horizon line that sweeps the
           whole tile and tightens into place, the cargo drops in block by block, the
           water settles; then the whole tile rides the water on a slow bob while the
           shimmer sways. Set `dock` on first paint only; later renders use bare marks.
   busy  — the cargo lifts off one block at a time, endlessly, while something is running
           (the sign-in state from the login kit). Overlays on top of dock.

 Every animation is skipped wholesale for reduced motion and for data-motion="off".
*/
const TOP = 'M34.0 17h32.0a2.5 2.5 0 0 1 2.5 2.5v23.0a2.5 2.5 0 0 1-2.5 2.5h-32.0a2.5 2.5 0 0 1-2.5-2.5v-23.0a2.5 2.5 0 0 1 2.5-2.5ZM37.7 23h2.4v16h-2.4ZM45.1 23h2.4v16h-2.4ZM52.5 23h2.4v16h-2.4ZM59.9 23h2.4v16h-2.4Z';
const LEFT = 'M14.0 48h32.0a2.5 2.5 0 0 1 2.5 2.5v23.0a2.5 2.5 0 0 1-2.5 2.5h-32.0a2.5 2.5 0 0 1-2.5-2.5v-23.0a2.5 2.5 0 0 1 2.5-2.5ZM17.7 54h2.4v16h-2.4ZM25.1 54h2.4v16h-2.4ZM32.5 54h2.4v16h-2.4ZM39.9 54h2.4v16h-2.4Z';
const RIGHT = 'M54.0 48h32.0a2.5 2.5 0 0 1 2.5 2.5v23.0a2.5 2.5 0 0 1-2.5 2.5h-32.0a2.5 2.5 0 0 1-2.5-2.5v-23.0a2.5 2.5 0 0 1 2.5-2.5ZM57.7 54h2.4v16h-2.4ZM65.1 54h2.4v16h-2.4ZM72.5 54h2.4v16h-2.4ZM79.9 54h2.4v16h-2.4Z';

export function HarborMark({ className, variant = 'tile', decorative = false, label = 'Harbor', dock = false, busy = false }) {
  const onTile = variant === 'tile';
  // The separated blocks, wrapped per block so the CSS can drop them in sequence
  // on dock-in and lift them off in turn when busy.
  const cargo = (
    <>
      <g className="bk b1"><g className="lf"><path fill={onTile ? '#EAF2F2' : '#0F2D3F'} fillRule="evenodd" d={LEFT} /></g></g>
      <g className="bk b2"><g className="lf"><path fill={onTile ? '#EAF2F2' : '#0F2D3F'} fillRule="evenodd" d={RIGHT} /></g></g>
      <g className="bk b3"><g className="lf"><path fill="#7FD1C7" fillRule="evenodd" d={TOP} /></g></g>
    </>
  );
  return (
    <svg viewBox="0 0 100 100" role={decorative ? undefined : 'img'} aria-label={decorative ? undefined : label}
      aria-hidden={decorative || undefined}
      className={cx('harbor-mark', onTile && 'harbor-mark--tile', dock && 'hmark-dock', busy && 'hmark-busy', className)}>
      {onTile && <rect width="100" height="100" rx="22" fill="#0F2D3F" />}
      {onTile
        ? <g transform="translate(5 3.65) scale(0.9)">
            <g className="water" aria-hidden="true">
              <rect x="22" y="91" width="56" height="2" rx="1" fill="#7FD1C7" />
              <rect x="34" y="96" width="32" height="2" rx="1" fill="#7FD1C7" />
            </g>
            <rect className="q" x="8" y="80" width="84" height="6" rx="2" fill="#EAF2F2" />
            {cargo}
          </g>
        : <>
            <g className="water" aria-hidden="true">
              <rect x="22" y="91" width="56" height="2" rx="1" fill="#1F8A7D" />
              <rect x="34" y="96" width="32" height="2" rx="1" fill="#1F8A7D" />
            </g>
            <rect className="q" x="8" y="80" width="84" height="6" rx="2" fill="#0F2D3F" />
            {cargo}
          </>}
    </svg>
  );
}
