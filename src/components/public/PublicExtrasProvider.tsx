'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { PublicExtras } from './SponsorStrip';

/** undefined = no provider (the hook then fetches by itself); null = loaded, nothing to show. */
const Extras = createContext<PublicExtras | null | undefined>(undefined);

/** Hands the server-fetched stream link and sponsors to the pages below it, so they are not fetched again in the browser. */
export function PublicExtrasProvider({ value, children }: { value: PublicExtras | null; children: ReactNode }) {
  return <Extras.Provider value={value}>{children}</Extras.Provider>;
}

export const usePublicExtrasContext = () => useContext(Extras);
