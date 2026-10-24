// React context + hook for the app store, in their own module so the store
// provider file (store.jsx) only exports components for React fast refresh.
import { createContext, useContext } from 'react';

export const Ctx = createContext(null);

export const useStore = () => useContext(Ctx);
