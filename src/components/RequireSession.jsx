// Puts every workspace screen behind the device key. The customer-facing routes
// (/pay/:token, /print/*) stay outside this guard on purpose: customers follow
// invitations and pay without signing in.
import { useSyncExternalStore } from 'react';
import { Navigate, useLocation } from 'react-router';
import { getSessionSnapshot, subscribeSession } from '../services/session.js';

export default function RequireSession({ children }) {
  const signedIn = useSyncExternalStore(subscribeSession, getSessionSnapshot).signedIn;
  const loc = useLocation();
  if (signedIn) return children;
  // Remember where the visitor wanted to go; Login sends them on after sign-in.
  return <Navigate replace to="/login" state={{ from: loc.pathname + loc.search }} />;
}
