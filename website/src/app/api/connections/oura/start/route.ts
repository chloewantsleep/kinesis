import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { ouraOAuth } from "@/lib/integrations/oauthConfig";
import { requireUser } from "@/lib/auth/session";

export async function GET() {
  try {
    await requireUser();
  } catch (res) {
    if (res instanceof Response) return res;
    throw res;
  }
  const clientId = ouraOAuth.clientId();
  if (!clientId) {
    return NextResponse.json(
      { error: "OURA_CLIENT_ID not configured" },
      { status: 500 }
    );
  }
  const state = randomBytes(16).toString("base64url");
  const cookieStore = await cookies();
  cookieStore.set("oura_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: ouraOAuth.redirectUri(),
    scope: ouraOAuth.scopes,
    state,
  });
  return NextResponse.redirect(`${ouraOAuth.authorizeUrl}?${params.toString()}`);
}
