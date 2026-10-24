// Translates an action error code into a user-facing message in the current language.
import { useStore } from '../store-context.js';

export function useErrorText() {
  const { t } = useStore();
  return (r) => {
    if (!r?.error) return null;
    const key = `err.${r.error}`;
    const msg = t(key, { line: (r.line ?? 0) + 1 });
    return msg === key ? t('err.generic', { code: r.error }) : msg;
  };
}
