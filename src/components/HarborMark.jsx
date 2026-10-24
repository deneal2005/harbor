import { useId } from 'react';
import { cx } from '../utils/cx.js';

/*
 Harbor brand mark — "Awning & Invoice" from the alt-one kit of the finalized
 opening screen. A canvas awning stands on the tile; a torn-foot invoice receipt
 with three teal line rows hangs beneath its open top hooks. Colors are fixed
 from the logo kit, never the app theme:
   navy #0F2D3F (tile gradient #143A52 -> #0F2D3F) · pale #EAF2F2 strokes ·
   teal #1F8A7D (reversed on-tile rows #7FD1C7).

 variant="tile" (default): the app-icon form — gradient navy tile, hairline
   inner edge, pale strokes, the quiet sheen clipped to the tile. Used on the
   sidebar, mobile header and favicons.
 variant="flat": no tile, full-bleed on paper — navy strokes and teal rows on
   white, for documents.

 Effects (CSS; see the Harbor brand section in index.css):
   dock  — plays the opening once: the awning paints itself on, the receipt is
           cut from the paper roll, the line rows print one by one, a light
           passes across the glass; the receipt then settles into its hanging
           spot and sways in a sea breeze forever. Set `dock` on first paint
           only; later renders use bare marks.
   busy  — the clerk keeps "printing": the rows pulse one after another while
           something is running.

 Every animation is skipped wholesale for reduced motion and data-motion="off".
*/
const AWNING = 'M19.2 35.4 V25.7 Q19.2 22.5 22.4 22.5 H77.6 Q80.8 22.5 80.8 25.7 V35.4';
const RECEIPT = 'M39.2 31 H31.7 Q29.2 31 29.2 33.5 V71.5 L34.4 79.5 L39.5 71.5 L44.7 79.5 L49.8 71.5 L55 79.5 L60.1 71.5 L65.2 79.5 L70.4 71.5 V33.5 Q70.4 31 67.9 31 H60.2';

export function HarborMark({ className, variant = 'tile', decorative = false, label = 'Harbor', dock = false, busy = false }) {
  const onTile = variant === 'tile';
  // useId keeps the defs unique when several marks share a page.
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const gradId = `hm${uid}grad`;
  const sheenId = `hm${uid}sheen`;
  const clipId = `hm${uid}clip`;
  const ink = onTile ? '#EAF2F2' : '#0F2D3F';
  const rowInk = onTile ? '#7FD1C7' : '#1F8A7D';
  return (
    <svg viewBox="0 0 100 100" role={decorative ? undefined : 'img'} aria-label={decorative ? undefined : label}
      aria-hidden={decorative || undefined}
      className={cx('harbor-mark', onTile && 'harbor-mark--tile', !onTile && 'harbor-mark--flat', dock && 'hmark-dock', busy && 'hmark-busy', className)}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#143A52" />
          <stop offset="1" stopColor="#0F2D3F" />
        </linearGradient>
        <linearGradient id={sheenId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#EAF2F2" stopOpacity="0" />
          <stop offset="0.5" stopColor="#EAF2F2" stopOpacity="0.18" />
          <stop offset="1" stopColor="#EAF2F2" stopOpacity="0" />
        </linearGradient>
        <clipPath id={clipId}><rect width="100" height="100" rx="22" /></clipPath>
      </defs>
      {onTile && <rect width="100" height="100" rx="22" fill={`url(#${gradId})`} />}
      {onTile && <rect x="1.5" y="1.5" width="97" height="97" rx="20.8" fill="none" stroke="#EAF2F2" strokeOpacity="0.08" strokeWidth="1" />}
      {/* The awning paints on; the receipt hangs from it, unhurried, forever. */}
      <path className="aw" pathLength="1" d={AWNING} stroke={ink} />
      <g className="rctg">
        <path className="rct" pathLength="1" d={RECEIPT} stroke={ink} />
        <rect className="tl tl1" x="37.3" y="39" width="25" height="5.5" rx="2.75" fill={rowInk} />
        <rect className="tl tl2" x="37.3" y="50.2" width="25" height="5.5" rx="2.75" fill={rowInk} />
        <rect className="tl tl3" x="37.3" y="61.4" width="25" height="5.5" rx="2.75" fill={rowInk} />
      </g>
      {onTile && (
        <g clipPath={`url(#${clipId})`}>
          <rect className="sheen" width="22" height="100" fill={`url(#${sheenId})`} />
        </g>
      )}
    </svg>
  );
}
