"use client";

import { SessionState } from "@/utils/auth";
import { updateSession } from "@/utils/session-actions";
import { SessionContext } from "@/utils/use-session";
import { ValidateSessionProvider } from "@/utils/validate-session-provider";
import { all } from "deepmerge";
import { User } from "lucia";
import { PropsWithChildren, useOptimistic, useTransition } from "react";

type Props = {
  user: User | null;
  sessionState?: SessionState;
};

const RootLayoutProvider = ({
  user,
  sessionState,
  children,
}: PropsWithChildren<Props>) => {
  const [sessionUser, setSessioUser] = useOptimistic<User | null>(user);
  const [, startTransition] = useTransition();

  return (
    <html lang="en">
      <body>
        <SessionContext.Provider
          value={
            sessionUser
              ? {
                  user: sessionUser,
                  updateUserSession: (user: DeepPartial<User> | null) => {
                    if (user === null) {
                      startTransition(() => {
                        setSessioUser(null);
                      });
                    } else {
                      startTransition(() => {
                        setSessioUser(all<User>([sessionUser as any, user]));
                      });
                      updateSession();
                    }
                  },
                }
              : { user: null, updateUserSession: () => {} }
          }
        >
          <ValidateSessionProvider sessionState={sessionState}>
            {children}
          </ValidateSessionProvider>
        </SessionContext.Provider>
      </body>
    </html>
  );
};

export default RootLayoutProvider;
