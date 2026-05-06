import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectMongo } from "@/lib/db/mongo";
import { Agent } from "@/lib/db/models/Agent";
import { generateApiKey } from "@/lib/auth/agentAuth";
import { requireUser } from "@/lib/auth/session";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  let user;
  try {
    user = await requireUser();
  } catch (res) {
    if (res instanceof Response) return res;
    throw res;
  }
  const { id } = await ctx.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  await connectMongo();
  const agent = await Agent.findOne({ _id: id, ownerUserId: user._id });
  if (!agent) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { raw, hash } = generateApiKey();
  agent.apiKeyHash = hash;
  await agent.save();
  return NextResponse.json({ apiKey: raw });
}
