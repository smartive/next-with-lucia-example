"use client";

import { useAsyncEffect } from "@/hooks/use-async-effect";
import { usePathname, useRouter } from "next/navigation";
import { PropsWithChildren, useEffect, useState } from "react";
import { SessionState } from "./auth";
import { login, logout, refetchSessionFromServer } from "./session-actions";
import { useSession } from "./use-session";
// import { useAuthFlowState } from '@/hooks/use-auth-flow-state';

type Props = {
  sessionState?: SessionState;
};

const IGNORE_PATHS = ["/api", "/_next", "/backend"];
export const LOCALSTORAGE_TOKEN_REFRESH_KEY = "token-refresh-in-progress";
export const LOCALSTORAGE_LOGOUT_KEY = "logout-in-progress";

export const isInvalidSessionState = (sessionState?: SessionState) =>
  sessionState?.error ||
  (sessionState?.accessTokenExpiresAt &&
    sessionState.accessTokenExpiresAt - Date.now() < 0);

export const performClientTokenRefreshInBackground = async () => {
  if (!localStorage.getItem(LOCALSTORAGE_TOKEN_REFRESH_KEY)) {
    let success;
    try {
      localStorage.setItem(LOCALSTORAGE_TOKEN_REFRESH_KEY, "true");
      if (!document.getElementById("auto-login-iframe")) {
        const autoLoginIframe = document.createElement("iframe");
        autoLoginIframe.id = "auto-login-iframe";
        autoLoginIframe.style.display = "none";
        document.body.insertBefore(autoLoginIframe, document.body.firstChild);
        const url = (await login(true, true)) || "/api/auth/error";
        autoLoginIframe.src = url; // initiates background auto-login in iframe
      }
      let tempHandler: any;
      success = await Promise.race([
        new Promise((resolve) => {
          // wait for sso-check message from iframe
          const handler = (event: MessageEvent) => {
            if (event.origin !== process.env.NEXT_PUBLIC_FULL_APP_URL) {
              // skip other messages from(for example.) extensions
              return;
            }
            const message = event.data;
            if (message.type === "sso-check") {
              resolve(message.sso);
            }
          };
          tempHandler = handler;

          window.addEventListener("message", handler);
        }),
        new Promise((resolve) => setTimeout(() => resolve(false), 5000)), // timeout after 5 seconds
      ]);
      window.removeEventListener("message", tempHandler);
      document.getElementById("auto-login-iframe")?.remove();
    } finally {
      localStorage.removeItem(LOCALSTORAGE_TOKEN_REFRESH_KEY);
    }
    return success;
  }
  return true;
};

export const performLogout = async () => {
  if (!localStorage.getItem(LOCALSTORAGE_LOGOUT_KEY)) {
    localStorage.setItem(LOCALSTORAGE_LOGOUT_KEY, "true");
    await logout(false);
    localStorage.removeItem(LOCALSTORAGE_LOGOUT_KEY);
  } else {
    (window as any).session = {};
  }
};

export const ValidateSessionProvider = ({
  children,
  sessionState: currentSessionState,
}: PropsWithChildren<Props>) => {
  const path = usePathname();
  const router = useRouter();
  const [tokenExpiresAt, setTokenExpiresAt] = useState<
    number | null | undefined
  >();
  const { user: session, updateUserSession } = useSession();
  const [sessionState, setSessionState] = useState<SessionState | undefined>(
    currentSessionState
  );
  // const { authStateSettled } = useAuthFlowState();

  useEffect(() => {
    if (IGNORE_PATHS.some((pathToSkip: string) => path.startsWith(pathToSkip)))
      return;
    // Listen for when the page is visible, if the user switches tabs
    // and makes our tab visible again, re-fetch the session
    const visibilityHandler = async () => {
      if (document.visibilityState === "visible") {
        setSessionState(await refetchSessionFromServer());
      }
    };
    document.addEventListener("visibilitychange", visibilityHandler, false);
    return () =>
      document.removeEventListener(
        "visibilitychange",
        visibilityHandler,
        false
      );
  }, []);

  useAsyncEffect(async () => {
    if (IGNORE_PATHS.some((pathToSkip: string) => path.startsWith(pathToSkip)))
      return;
    if (
      (sessionState?.userId && sessionState.userId !== session?.identifier)
    ) {
      console.error("Session state mismatch, logging out user");
      window.location.reload();
      return;
    }

    // refresh access token before it expires with refresh token
    if (isInvalidSessionState(sessionState)) {
      // Session is invalid, try to refresh token
      const freshSession = await refetchSessionFromServer();
      if (isInvalidSessionState(freshSession)) {
        if (await performClientTokenRefreshInBackground()) {
          router.refresh();
          return;
        }
        // // Refresh token failed, logout user
        await performLogout();
        setTokenExpiresAt(undefined);
        updateUserSession(null);
      } else {
        setSessionState(freshSession);
      }
    } else if (sessionState?.accessTokenExpiresAt || 0 > (tokenExpiresAt || 0)) {
      setTokenExpiresAt(sessionState?.accessTokenExpiresAt);
    }
  }, [sessionState, session?.identifier]);

  useAsyncEffect(async () => {
    if (
      IGNORE_PATHS.some((pathToSkip: string) => path.startsWith(pathToSkip)) ||
      !tokenExpiresAt
    )
      return;

    const milisecondsToExpiry = tokenExpiresAt - Date.now() - 60000 * 1;
    if (milisecondsToExpiry > 0) {
      const refreshTokenTimeout = setTimeout(async () => {
        setSessionState(await refetchSessionFromServer());
      }, milisecondsToExpiry);
      return () => clearTimeout(refreshTokenTimeout);
    }
  }, [tokenExpiresAt]);

  return <>{children}</>;
};
