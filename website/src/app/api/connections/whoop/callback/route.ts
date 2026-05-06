import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { whoopOAuth } from "@/lib/integrations/oauthConfig";
import { connectMongo } from "@/lib/db/mongo";
import { MCPConnection } from "@/lib/db/models/MCPConnection";
import { requireUser } from "@/lib/auth/session";
import { encryptJSON } from "@/lib/crypto";

export async function GET(req: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (res) {
    if (res instanceof Response) return res;
    throw res;
  }
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieStore = await cookies();
  const expected = cookieStore.get("whoop_oauth_state")?.value;
  cookieStore.delete("whoop_oauth_state");
  if (!code || !state || !expected || state !== expected) {
    return NextResponse.redirect(`${process.env.APP_URL ?? ""}/connections?error=whoop_state`);
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: whoopOAuth.redirectUri(),
    client_id: whoopOAuth.clientId(),
    client_secret: whoopOAuth.clientSecret(),
  });
  const tokenRes = await fetch(whoopOAuth.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    return NextResponse.redirect(
      `${process.env.APP_URL ?? ""}/connections?error=whoop_token&msg=${encodeURIComponent(text.slice(0, 80))}`
    );
  }
  const tokens = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };

  await connectMongo();
  await MCPConnection.findOneAndUpdate(
    { userId: user._id, kind: "whoop" },
    {
      userId: user._id,
      kind: "whoop",
      label: "whoop",
      mode: "real",
      status: "connected",
      secretsCiphertext: encryptJSON({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : null,
      }),
      config: {},
      lastError: "",
    },
    { upsert: true, new: true }
  );

  return NextResponse.redirect(`${process.env.APP_URL ?? ""}/connections?connected=whoop`);
}
