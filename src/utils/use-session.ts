'use client';

import { User } from 'lucia';
import { createContext, useContext } from 'react';

type SessionContextType = { user: User };
export type SessionType = SessionContextType | { user: null };
export type ContextType = SessionType & {
  updateUserSession: (user: DeepPartial<User> | null) => void;
};

export const SessionContext = createContext<ContextType>({ user: null, updateUserSession: () => {} });
export const useSession = () => useContext(SessionContext);
