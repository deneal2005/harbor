// Plausible future derived from the current ledger only; never touches real state.
import { useMemo } from 'react';
import { buildForecast } from '../services/forecasting.js';
import { useStore } from '../store-context.js';

export function useScenario(changes) {
  const { state, today } = useStore();
  return useMemo(() => (changes.length ? buildForecast(state, today, changes) : null), [state, today, changes]);
}
