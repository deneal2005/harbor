// Puts every workspace screen behind the owner's sign-in and holds them until the ledger has loaded.
// The customer pay link (/pay/:token) stays outside this guard on purpose: customers pay without
// signing in.
import { useSyncExternalStore } from 'react';
import { Navigate, useLocation } from 'react-router';
import { getSessionSnapshot, subscribeSession } from '../services/session.js';
import { useStore } from '../store-context.js';

export default function RequireSession({ children }) {
  const session = useSyncExternalStore(subscribeSession, getSessionSnapshot);
  const { state, t } = useStore();
  const loc = useLocation();
  if (session.signedIn && state) return children;
  // Remember where the visitor wanted to go; Login sends them on after sign-in.
  if (session.checked && !session.signedIn) return <Navigate replace to="/login" state={{ from: loc.pathname + loc.search }} />;
  return <p role="status" aria-live="polite" className="mx-auto max-w-xl p-6 text-muted">{t('common.loading')}</p>;
}
