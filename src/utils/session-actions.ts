"use server";

import { revalidateTag } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { generateCodeVerifier, generateState } from "oslo/oauth2";
import {
  createAuthorizationURL,
  fetchAndUpdateUser,
  getServerSession,
  lucia
} from "./auth";

export async function login(promptNone?: boolean, sso?: boolean) {
  const { session } = await getServerSession();
  if (!session || !session.accessToken || sso) {
    const state = generateState();
    const codeVerifier = generateCodeVerifier();

    let referer = headers().get("referer");

    const url = await createAuthorizationURL(state, codeVerifier);
    url.searchParams.append("access_type", "offline");
    if (promptNone) {
      url.searchParams.append("prompt", "none");
    }
    if (sso) {
      referer = process.env.NEXT_PUBLIC_FULL_APP_URL! + "/api/auth/sso/checked";
    }

    cookies().set("oauth_state", state, {
      path: "/",
      secure: true,
      httpOnly: true,
      maxAge: 60 * 10,
      sameSite: "lax",
    });
    cookies().set("oauth_code_verifier", codeVerifier, {
      path: "/",
      secure: true,
      httpOnly: true,
      maxAge: 60 * 10,
      sameSite: "lax",
    });

    if (referer) {
      cookies().set("oauth_referer", referer, {
        path: "/",
        secure: true,
        httpOnly: true,
        maxAge: 60 * 10,
        sameSite: "lax",
      });
    }

    if (sso) {
      return url.toString();
    }
    redirect(url.toString());
  }
}

export async function logout(deepLogout: boolean, redirectUri?: string) {
  const { session } = await getServerSession();
  if (!session) {
    return {
      error: "Unauthorized",
    };
  }

  await lucia.invalidateSession(session.id);

  const sessionCookie = lucia.createBlankSessionCookie();
  cookies().set(
    sessionCookie.name,
    sessionCookie.value,
    sessionCookie.attributes
  );

  if (deepLogout) {
    const redirectUrl = session?.idToken
      ? `${
          process.env.NEXT_PUBLIC_MIGROS_LOGIN_URL
        }/oauth2/logout?id_token_hint=${
          session.idToken
        }&post_logout_redirect_uri=${
          redirectUri || process.env.NEXT_PUBLIC_FULL_APP_URL!
        }`
      : process.env.NEXT_PUBLIC_FULL_APP_URL!;
    redirect(redirectUrl);
  }
  revalidateTag("user-session");
}

export async function updateSession() {
  const { session } = await getServerSession();
  if (!session?.accessToken) {
    return {
      error: "Unauthorized",
    };
  }
  await fetchAndUpdateUser(session.accessToken);
  revalidateTag("user-session");
}

export async function refetchSessionFromServer() {
  const { user, session } = await getServerSession();
  if (!session) {
    return {
      error: "Unauthorized",
    };
  }
  return {
    userId: user?.id,
    accessTokenExpiresAt: session.accessTokenExpiresAt,
    error: session.error,
  };
}
