import { cx } from '../utils/cx.js';
import { initialsOf } from '../utils/initials.js';

// The business's uploaded logo, or its initials when none is set.
export function BusinessMark({ business, className }) {
  return business.logo
    ? <img src={business.logo} alt={business.name} className={cx('shrink-0 rounded object-contain', className)} />
    : <div aria-hidden="true" className={cx('flex shrink-0 items-center justify-center rounded bg-brand font-bold text-white', className)}>{initialsOf(business.name)}</div>;
}
