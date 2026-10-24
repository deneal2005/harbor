import { cx } from '../utils/cx.js';

/*
 Harbor brand mark — "Container Stack".
 Three heavy ribbed cargo blocks stacked on a flat quay: two navy below, one teal on top.
 Palette is fixed from the logo kit, so it never drifts with the app theme:
   navy #0F2D3F · teal #1F8A7D (reversed top block #7FD1C7) · off-white #EAF2F2.

 variant="tile" (default): the navy rounded tile, i.e. the app icon form. The drawing
 sits on a 90% scale with even margins (the kit's app-icon spacing), so the stack keeps
 real weight at every size from the sidebar down to a 16 px favicon.
 variant="flat": no tile, full-bleed — the light-theme drawing (navy blocks, teal top
 on white), for paper and documents. This is the drawing exactly as the kit defines it.
*/
const TOP = 'M34.0 17h32.0a2.5 2.5 0 0 1 2.5 2.5v23.0a2.5 2.5 0 0 1-2.5 2.5h-32.0a2.5 2.5 0 0 1-2.5-2.5v-23.0a2.5 2.5 0 0 1 2.5-2.5ZM37.7 23h2.4v16h-2.4ZM45.1 23h2.4v16h-2.4ZM52.5 23h2.4v16h-2.4ZM59.9 23h2.4v16h-2.4Z';
const BOTTOM = 'M14.0 48h32.0a2.5 2.5 0 0 1 2.5 2.5v23.0a2.5 2.5 0 0 1-2.5 2.5h-32.0a2.5 2.5 0 0 1-2.5-2.5v-23.0a2.5 2.5 0 0 1 2.5-2.5ZM17.7 54h2.4v16h-2.4ZM25.1 54h2.4v16h-2.4ZM32.5 54h2.4v16h-2.4ZM39.9 54h2.4v16h-2.4ZM54.0 48h32.0a2.5 2.5 0 0 1 2.5 2.5v23.0a2.5 2.5 0 0 1-2.5 2.5h-32.0a2.5 2.5 0 0 1-2.5-2.5v-23.0a2.5 2.5 0 0 1 2.5-2.5ZM57.7 54h2.4v16h-2.4ZM65.1 54h2.4v16h-2.4ZM72.5 54h2.4v16h-2.4ZM79.9 54h2.4v16h-2.4Z';

export function HarborMark({ className, variant = 'tile', decorative = false, label = 'Harbor' }) {
  // On the navy tile the kit's reversed palette is used; flat is the print palette.
  const onTile = variant === 'tile';
  const drawing = (
    <>
      <path d={TOP} fill={onTile ? '#7FD1C7' : '#1F8A7D'} />
      <path d={BOTTOM} fill={onTile ? '#EAF2F2' : '#0F2D3F'} />
      <rect x="8" y="80" width="84" height="6" rx="2" fill={onTile ? '#EAF2F2' : '#0F2D3F'} />
    </>
  );
  return (
    <svg viewBox="0 0 100 100" role={decorative ? undefined : 'img'} aria-label={decorative ? undefined : label}
      aria-hidden={decorative || undefined} className={cx('shrink-0', className)}>
      {onTile && <rect width="100" height="100" rx="22" fill="#0F2D3F" />}
      {onTile ? <g transform="translate(5 3.65) scale(0.9)">{drawing}</g> : drawing}
    </svg>
  );
}
