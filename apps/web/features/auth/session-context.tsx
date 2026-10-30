'use client';

import type { AuthUser } from '@tienlen/shared';
import { createContext, type ReactNode, useContext } from 'react';

const SessionContext = createContext<AuthUser | null>(null);

/** The account behind the current session, as verified by the API on the server. */
export function SessionProvider({ user, children }: { user: AuthUser; children: ReactNode }) {
  return <SessionContext value={user}>{children}</SessionContext>;
}

/** Null in UI preview mode, where there is no real session. */
export function useSessionUser(): AuthUser | null {
  return useContext(SessionContext);
}
