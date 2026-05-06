import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectMongo } from "@/lib/db/mongo";
import { Agent } from "@/lib/db/models/Agent";
import { AgentRun } from "@/lib/db/models/AgentRun";
import { Conversation } from "@/lib/db/models/Conversation";
import { Message } from "@/lib/db/models/Message";
import { Reminder } from "@/lib/db/models/Reminder";
import { Thread } from "@/lib/db/models/Thread";
import { requireUser } from "@/lib/auth/session";

async function loadOwnedAgent(id: string, userId: mongoose.Types.ObjectId) {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  const agent = await Agent.findOne({ _id: id, ownerUserId: userId });
  return agent;
}

export async function GET(
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
  await connectMongo();
  const agent = await loadOwnedAgent(id, user._id);
  if (!agent) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({
    _id: String(agent._id),
    name: agent.name,
    handle: agent.handle,
    bio: agent.bio,
    isPublic: agent.isPublic,
    runtime: agent.runtime,
    createdAt: (agent as unknown as { createdAt?: Date }).createdAt,
  });
}

type PatchBody = {
  name?: string;
  bio?: string;
  systemPrompt?: string;
  isPublic?: boolean;
  promptVisibility?: "public" | "owner_only";
};

export async function PATCH(
  req: Request,
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
  const body = (await req.json().catch(() => ({}))) as PatchBody;

  await connectMongo();
  const agent = await loadOwnedAgent(id, user._id);
  if (!agent) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (typeof body.name === "string" && body.name.trim().length >= 2) {
    agent.name = body.name.trim();
  }
  if (typeof body.bio === "string") agent.bio = body.bio;
  if (typeof body.systemPrompt === "string" && body.systemPrompt.trim()) {
    agent.systemPrompt = body.systemPrompt;
  }
  if (typeof body.isPublic === "boolean") agent.isPublic = body.isPublic;
  if (
    body.promptVisibility === "public" ||
    body.promptVisibility === "owner_only"
  ) {
    (agent as unknown as { promptVisibility: string }).promptVisibility =
      body.promptVisibility;
  }
  await agent.save();
  return NextResponse.json({ ok: true });
}

export async function DELETE(
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
  await connectMongo();
  const agent = await loadOwnedAgent(id, user._id);
  if (!agent) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Cascade: remove runs, reminders, the agent's messages, drop from conversations / threads.
  await Promise.all([
    AgentRun.deleteMany({ agentId: agent._id }),
    Reminder.deleteMany({ agentId: agent._id }),
    Message.deleteMany({ authorAgentId: agent._id }),
    Conversation.deleteMany({ participants: agent._id }),
    Thread.updateMany(
      { participantAgentIds: agent._id },
      { $pull: { participantAgentIds: agent._id } }
    ),
    // Threads created by this agent: leave them, but blank the creator ref by deleting
    // the thread when there are no remaining participants. Cheap heuristic: just delete
    // threads that this agent created and that have <= 0 messages remaining.
    Thread.deleteMany({ creatorAgentId: agent._id, messageCount: { $lte: 0 } }),
  ]);
  await agent.deleteOne();

  return NextResponse.json({ ok: true });
}
