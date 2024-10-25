import {
  RedisSessionAdapter,
  insertUserSession,
} from "@/services/server/redis-adapter";
import type { Session, User } from "lucia";
import { Lucia, TimeSpan } from "lucia";
import { cookies } from "next/headers";
import {
  OAuth2Client,
  OAuth2RequestError,
  TokenResponseBody,
} from "oslo/oauth2";
import { cache } from "react";

const AUTHORIZE_ENDPOINT = `${process.env.OIDC_LOGIN_URL}/o/oauth2/v2/auth`;
const TOKEN_ENDPOINT = `https://oauth2.googleapis.com/token`;
const USERINFO_ENDPOINT = `https://openidconnect.googleapis.com/v1/userinfo`;
const USE_REFRESH_MINUTES_BEFORE_EXPIRATION = 2;

export const redisAdapter = new RedisSessionAdapter();

export const lucia = new Lucia(redisAdapter, {
  sessionCookie: {
    // this sets cookies with super long expiration
    // since Next.js doesn't allow Lucia to extend cookie expiration when rendering pages
    expires: false,
    attributes: {
      // set to `true` when using HTTPS
      secure: true,
    },
  },
  sessionExpiresIn: new TimeSpan(1, "d"),
  getUserAttributes: (attributes) => {
    return {
      identifier: attributes.identifier,
      trackingId: attributes.trackingId,
      name: attributes.name,
      nickname: attributes.nickname,
      fullName: attributes.fullName,
      email: attributes.email,
    };
  },
  getSessionAttributes: (attributes) => {
    return {
      accessToken: attributes.accessToken,
      refreshToken: attributes.refreshToken,
      idToken: attributes.idToken,
      accessTokenExpiresAt: attributes.accessTokenExpiresAt,
      error: attributes.error,
    };
  },
});

const client = new OAuth2Client(
  process.env.OIDC_CLIENT_ID || "",
  AUTHORIZE_ENDPOINT,
  TOKEN_ENDPOINT,
  {
    redirectURI: `${process.env.NEXT_PUBLIC_FULL_APP_URL}${
      process.env.OIDC_REDIRECT_PATH || ""
    }`,
  }
);

declare module "lucia" {
  interface Register {
    Lucia: typeof lucia;
    DatabaseSessionAttributes: DatabaseSessionAttributes;
    DatabaseUserAttributes: DatabaseUserAttributes;
  }
}

interface DatabaseUserAttributes {
  identifier: string;
  trackingId: string;
  name: string;
  nickname: string;
  fullName?: string;
  email?: string;
}

interface DatabaseSessionAttributes {
  accessToken: string | undefined;
  refreshToken: string | undefined;
  idToken: string;
  accessTokenExpiresAt: number;
  error?: string;
}

export interface SessionState {
  userId?: string;
  accessTokenExpiresAt?: number;
  error?: string;
}

type SessionResponse =
  | { user: User; session: Session }
  | { user: null; session: null };

export const getServerSession = cache(
  async (): Promise<
    { user: User; session: Session } | { user: null; session: null }
  > => {
    const sessionId = cookies().get(lucia.sessionCookieName)?.value ?? null;
    if (sessionId === null) {
      return {
        user: null,
        session: null,
      };
    }

    const result = await lucia.validateSession(sessionId);

    try {
      if (result.session && result.session.fresh) {
        const sessionCookie = lucia.createSessionCookie(result.session.id);
        cookies().set(
          sessionCookie.name,
          sessionCookie.value,
          sessionCookie.attributes
        );
      }
      if (!result.session) {
        const sessionCookie = lucia.createBlankSessionCookie();
        cookies().set(
          sessionCookie.name,
          sessionCookie.value,
          sessionCookie.attributes
        );
      }
    } catch (error) {
      // next.js throws when you attempt to set cookie when rendering page
    }

    if (result.session) {
      if (
        (!result.session.accessToken ||
          Date.now() >
            result.session.accessTokenExpiresAt -
              60000 * USE_REFRESH_MINUTES_BEFORE_EXPIRATION) &&
        result.session.refreshToken
      ) {
        const refreshdSession = await refreshAccessToken(result.session);
        if (refreshdSession) {
          return ensureOnlyValidAccessToken({
            user: result.user,
            session: refreshdSession,
          });
        }
        return { user: null, session: null };
      }
    }

    return ensureOnlyValidAccessToken(result);
  }
);

const ensureOnlyValidAccessToken = async (
  sessionResponse: SessionResponse
): Promise<SessionResponse> => {
  if (
    sessionResponse.session?.accessToken &&
    Date.now() > sessionResponse.session.accessTokenExpiresAt
  ) {
    const updatedSession = await lucia.createSession(
      sessionResponse.session.userId,
      {
        ...sessionResponse.session,
        accessToken: undefined,
      },
      { sessionId: sessionResponse.session.id }
    );
    return {
      user: sessionResponse.user,
      session: updatedSession,
    };
  }

  return sessionResponse;
};

// 1: create authorization URL for your openid connect provider to redirect client side
export const createAuthorizationURL = async (
  state: string,
  codeVerifier: string
) =>
  await client.createAuthorizationURL({
    state,
    scopes: ["openid", "profile", "email", "address"],
    codeVerifier,
  });

// 2: get access token form reutrned code by calling provider's token endpoint server side
export const createSessionFromCode = async (
  code: string,
  codeVerifier?: string
) => {
  const { id_token, access_token, refresh_token, expires_in } =
    await client.validateAuthorizationCode<
      TokenResponseBody & { id_token: string }
    >(code, {
      credentials: process.env.OIDC_CLIENT_SECRET || "",
      codeVerifier,
      authenticateWith: "request_body",
    });
  const userId = await fetchAndUpdateUser(access_token);
  return await lucia.createSession(userId, {
    accessToken: access_token,
    refreshToken: refresh_token,
    idToken: id_token,
    accessTokenExpiresAt: Date.now() + (expires_in || 0) * 1000,
  });
};

// 3: refresh access token when it expires with refresh token
const refreshAccessToken = async (session: Session) => {
  try {
    const response = await client.refreshAccessToken(
      session.refreshToken || "",
      {
        credentials: process.env.OIDC_CLIENT_SECRET,
        authenticateWith: "request_body",
      }
    );

    if (!response) {
      throw response;
    }

    const updatedSession = await lucia.createSession(
      session.userId,
      {
        accessToken: response.access_token,
        refreshToken: response.refresh_token ?? session.refreshToken, // Fall back to old refresh token,
        idToken: session.idToken, // Fall back to old id token,
        accessTokenExpiresAt: Date.now() + (response.expires_in || 0) * 1000,
      },
      { sessionId: session.id }
    );

    return updatedSession;
  } catch (e) {
    if (e instanceof OAuth2RequestError) {
      const { request, message, description } = e;
      console.error(request, message, description);
      return await lucia.createSession(
        session.userId,
        {
          ...session,
          refreshToken: undefined,
          error: "RefreshAccessTokenError",
        },
        { sessionId: session.id }
      );
    }
    console.error(e, "RefreshAccessTokenError");
    return null;
  }
};

export const fetchAndUpdateUser = async (accessToken: string) => {
  try {
    const userInfoResponse = await fetch(USERINFO_ENDPOINT, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    const user = await userInfoResponse.json();

    await insertUserSession({
      id: user.sub,
      attributes: {
        identifier: user.sub,
        trackingId: user.tracking_id,
        name: user.name,
        nickname: user.nickname,
        email: user.email,
        fullName:
          user.family_name && user.given_name
            ? `${user.given_name} ${user.family_name}`
            : undefined,
      },
    });
    return user.sub;
  } catch (error) {
    console.info({ error }, `Error fetching user info`);
    return null;
  }
};
