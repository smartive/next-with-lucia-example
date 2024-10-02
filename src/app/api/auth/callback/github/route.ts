import {
  createSessionFromCode,
  lucia
} from "@/utils/auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextRequest } from "next/server";
import { OAuth2RequestError } from "oslo/oauth2";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const storedState = cookies().get("oauth_state")?.value;
  const codeVerifier = cookies().get("oauth_code_verifier")?.value;
  const referrer = cookies().get("oauth_referer")?.value;

  if (!code || !state || !storedState || state !== storedState) {
    return redirect("/api/auth/error");
  }

  try {
    const session = await createSessionFromCode(code, codeVerifier);
    const sessionCookie = lucia.createSessionCookie(session.id);
    cookies().set(
      sessionCookie.name,
      sessionCookie.value,
      sessionCookie.attributes
    );
    cookies().delete("oauth_state");
    cookies().delete("oauth_code_verifier");
    cookies().delete("oauth_referer");
    return Response.redirect(
      referrer && referrer.startsWith(process.env.NEXT_PUBLIC_FULL_APP_URL!)
        ? referrer
        : process.env.NEXT_PUBLIC_FULL_APP_URL!,
      302
    );
  } catch (e) {
    if (e instanceof OAuth2RequestError) {
      // see https://www.rfc-editor.org/rfc/rfc6749#section-5.2
      const { request, message, description } = e;
      console.info(request, message, description);
    }
    console.error(e);
    // unknown error
  }
  redirect("/api/auth/error");
}
