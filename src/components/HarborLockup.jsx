import { cx } from '../utils/cx.js';
import { HarborMark } from './HarborMark.jsx';

/*
 The Harbor lockup: mark on the left, Sora wordmark on the right, in the kit's
 proportions. One component so every pairing in the app shares the same gaps and
 optical sizes instead of ad-hoc classes drifting apart.

 tone="light" — on paper or light chrome; the word reads in brand navy.
 tone="dark"  — on the navy sidebar; the word reads in white.
 flat         — uses the print (no-tile) palette for paper documents.
*/
export function HarborLockup({ className, markClass = 'h-9 w-9', wordClass = 'text-base', gapClass = 'gap-2.5', tone = 'light', flat = false }) {
  return (
    <span className={cx('inline-flex items-center', tone === 'dark' ? 'text-white' : 'text-[#0F2D3F]', gapClass, className)}>
      <HarborMark decorative variant={flat ? 'flat' : 'tile'} className={markClass} />
      <span className={cx('brand-word', wordClass)}>HARBOR</span>
    </span>
  );
}
