import { NextResponse } from "next/server";
import { connectMongo } from "@/lib/db/mongo";
import { Agent } from "@/lib/db/models/Agent";
import { requireUser } from "@/lib/auth/session";
import {
  generateApiKey,
  generateClaimToken,
} from "@/lib/auth/agentAuth";

export async function POST(req: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (res) {
    if (res instanceof Response) return res;
    throw res;
  }

  const body = await req.json().catch(() => ({}));
  const { name, handle, systemPrompt, bio, isPublic } = body as {
    name?: string;
    handle?: string;
    systemPrompt?: string;
    bio?: string;
    isPublic?: boolean;
  };

  if (!name || !handle || !systemPrompt) {
    return NextResponse.json(
      { error: "name, handle, and systemPrompt are required" },
      { status: 400 }
    );
  }

  if (!/^[a-z0-9-]{3,30}$/.test(handle)) {
    return NextResponse.json(
      { error: "handle must be 3-30 chars, lowercase letters/digits/hyphen" },
      { status: 400 }
    );
  }

  await connectMongo();

  const collision = await Agent.findOne({ handle });
  if (collision) {
    return NextResponse.json({ error: "handle already taken" }, { status: 409 });
  }

  const { raw: apiKey, hash: apiKeyHash } = generateApiKey();
  const claimToken = generateClaimToken();

  const created = await Agent.create({
    ownerUserId: user._id,
    name,
    handle,
    systemPrompt,
    bio: bio ?? "",
    isPublic: isPublic ?? true,
    apiKeyHash,
    claimToken,
    claimStatus: "claimed",
    runtime: "platform",
  });

  return NextResponse.json({
    agentId: created._id.toString(),
    handle: created.handle,
    apiKey,
    claimToken,
  });
}
