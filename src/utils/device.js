// Low-powered device or data-saver: animations default off there (Settings → Animations can override).
// deviceMemory and connection are Chromium-only; when a browser does not report them they are ignored.
export function isLowEndDevice() {
  if (typeof navigator === 'undefined') return false;
  const cores = navigator.hardwareConcurrency;
  const memory = navigator.deviceMemory;
  const conn = navigator.connection;
  return !!(conn?.saveData || ['slow-2g', '2g'].includes(conn?.effectiveType) || (memory && memory <= 2) || (cores && cores <= 2));
}

// What is in effect for a stored setting ('auto' | 'on' | 'off').
export const motionEnabled = (setting = 'auto') => setting === 'on' || (setting === 'auto' && !isLowEndDevice());
