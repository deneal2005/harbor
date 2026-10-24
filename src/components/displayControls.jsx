// Shared currency/language segmented controls for the sidebar, the mobile
// "More" sheet and Settings; extracted from Layout so that file exports
// components only (React fast refresh).
import { updateSettings } from '../services/actions.js';
import { useStore } from '../store-context.js';
import { CURRENCIES } from '../utils/money.js';
import { Segmented } from './ui.jsx';
import { motionEnabled } from '../utils/device.js';

export function useDisplayControls() {
  const { t, state, run } = useStore();
  return {
    currency: (props) => (
      <Segmented label={t('app.currency')} value={state.settings.currency || 'INR'} onChange={(v) => run(updateSettings, { currency: v })} size="sm" {...props}
        options={Object.entries(CURRENCIES).map(([code, c]) => ({ value: code, label: code, short: c.symbol }))} />
    ),
    // On/Off shortcut for Settings → Animations, shown only on low-end devices; reflects what is in effect.
    motion: (props) => (
      <Segmented label={t('set.motion')} value={motionEnabled(state.settings.motion) ? 'on' : 'off'} onChange={(v) => run(updateSettings, { motion: v })} size="sm" {...props}
        options={[{ value: 'on', label: t('set.motion.on') }, { value: 'off', label: t('set.motion.off') }]} />
    ),
    language: (props) => (
      <Segmented label={t('app.language')} value={state.settings.language} onChange={(v) => run(updateSettings, { language: v })} size="sm" {...props}
        options={[{ value: 'en', label: 'English', short: 'EN' }, { value: 'hi', label: 'हिंदी', short: 'हि' }]} />
    ),
  };
}
