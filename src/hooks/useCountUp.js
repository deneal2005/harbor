import { useEffect, useRef, useState } from 'react';
import { isLowEndDevice } from '../utils/device.js';

// The store writes the effective setting to <html data-motion> (on, unless off or a low-end device).
export function motionOff() {
  if (typeof document === 'undefined') return true;
  const m = document.documentElement.dataset.motion;
  return m ? m === 'off' : isLowEndDevice();
}
const reduced = motionOff;

// Animates an integer (paise) from the number currently shown to the new value, so a recorded
// payment visibly rolls the figure. Display only: always settles on the exact value. Skipped when
// animations are off (low-end device or Settings). fromZero: also count up from 0 when first shown (headlines only).
export function useCountUp(value, { ms = 650, fromZero = false } = {}) {
  const [shown, setShown] = useState(() => (fromZero && !reduced() ? 0 : value));
  // Start from what is on screen, not from the last target, so an interrupted or re-run effect
  // (e.g. React StrictMode) still animates.
  const shownRef = useRef(shown);
  useEffect(() => {
    const start = shownRef.current;
    const set = (v) => { shownRef.current = v; setShown(v); };
    if (start === value || reduced()) { set(value); return undefined; }
    const t0 = performance.now();
    let raf;
    const tick = (now) => {
      // rAF timestamps are the frame's start and can precede t0, so clamp at 0 (else a negative frame).
      const p = Math.max(0, Math.min(1, (now - t0) / ms));
      // Whole rupees while moving (no flickering paise); the exact value on the last frame.
      set(p === 1 ? value : Math.round((start + (value - start) * (1 - (1 - p) ** 3)) / 100) * 100);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return shown;
}
