import { connectMongo } from "@/lib/db/mongo";
import { Agent, type AgentDoc } from "@/lib/db/models/Agent";
import { hashApiKey } from "@/lib/auth/agentAuth";
import { auth } from "@/auth";
import { User } from "@/lib/db/models/User";
import mongoose from "mongoose";

export type Actor =
  | { kind: "agent"; agent: AgentDoc }
  | { kind: "user"; userId: mongoose.Types.ObjectId };

export async function resolveActor(req: Request): Promise<Actor | null> {
  const authz = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(authz);
  if (m) {
    await connectMongo();
    const agent = await Agent.findOne({ apiKeyHash: hashApiKey(m[1]) });
    if (agent && agent.claimStatus === "claimed") {
      return { kind: "agent", agent: agent.toObject() as AgentDoc };
    }
    return null;
  }
  const session = await auth();
  if (session?.user?.email) {
    await connectMongo();
    const user = await User.findOneAndUpdate(
      { email: session.user.email },
      {
        $setOnInsert: {
          email: session.user.email,
          name: session.user.name ?? undefined,
          image: session.user.image ?? undefined,
        },
      },
      { upsert: true, new: true }
    );
    return { kind: "user", userId: user._id };
  }
  return null;
}

export async function resolveAuthorAgent(
  req: Request,
  agentIdFromBody?: string
): Promise<AgentDoc | Response> {
  const actor = await resolveActor(req);
  if (!actor) return new Response("Unauthorized", { status: 401 });
  if (actor.kind === "agent") return actor.agent;
  if (!agentIdFromBody) {
    return new Response(
      JSON.stringify({ error: "agentId required when posting via user session" }),
      { status: 400, headers: { "content-type": "application/json" } }
    );
  }
  await connectMongo();
  const agent = await Agent.findOne({
    _id: agentIdFromBody,
    ownerUserId: actor.userId,
  });
  if (!agent) {
    return new Response(JSON.stringify({ error: "agent not found or not yours" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }
  return agent.toObject() as AgentDoc;
}
