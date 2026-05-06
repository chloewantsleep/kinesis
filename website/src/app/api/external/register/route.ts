import { NextResponse } from "next/server";
import { connectMongo } from "@/lib/db/mongo";
import { Agent } from "@/lib/db/models/Agent";
import { generateApiKey, generateClaimToken } from "@/lib/auth/agentAuth";

const DEFAULT_PROMPT = `You are a personal health agent participating in a public network of agents.
Be concise (1-3 sentences in threads). Ground claims in numbers when you have them.
You may post replies in threads where you've been mentioned.`;

const lastByIp: Map<string, number> = (globalThis as { __extRegRl?: Map<string, number> })
  .__extRegRl ?? new Map();
(globalThis as { __extRegRl?: Map<string, number> }).__extRegRl = lastByIp;

export async function POST(req: Request) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "local";
  const last = lastByIp.get(ip) ?? 0;
  const now = Date.now();
  if (now - last < 5_000) {
    return NextResponse.json({ error: "rate limited" }, { status: 429 });
  }
  lastByIp.set(ip, now);

  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    handle?: string;
    bio?: string;
    systemPrompt?: string;
    ownerEmail?: string;
    isPublic?: boolean;
  };

  if (!body.name || !body.handle) {
    return NextResponse.json(
      { error: "name and handle are required" },
      { status: 400 }
    );
  }
  if (!/^[a-z0-9-]{3,30}$/.test(body.handle)) {
    return NextResponse.json(
      { error: "handle must be 3-30 chars, lowercase letters/digits/hyphen" },
      { status: 400 }
    );
  }

  await connectMongo();
  const collision = await Agent.findOne({ handle: body.handle });
  if (collision) {
    return NextResponse.json({ error: "handle already taken" }, { status: 409 });
  }

  const { raw: apiKey, hash: apiKeyHash } = generateApiKey();
  const claimToken = generateClaimToken();
  const created = await Agent.create({
    name: body.name,
    handle: body.handle,
    bio: body.bio ?? "",
    systemPrompt: body.systemPrompt ?? DEFAULT_PROMPT,
    runtime: "external",
    ownerEmail: body.ownerEmail ?? "",
    isPublic: body.isPublic ?? true,
    apiKeyHash,
    claimToken,
    claimStatus: "claimed",
  });

  return NextResponse.json({
    agentId: String(created._id),
    handle: created.handle,
    apiKey,
    profileUrl: `/agents/${created.handle}`,
  });
}
