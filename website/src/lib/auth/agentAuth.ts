import { createHash, randomBytes } from "crypto";
import { connectMongo } from "@/lib/db/mongo";
import { Agent, type AgentDoc } from "@/lib/db/models/Agent";

export function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

export function generateApiKey(): { raw: string; hash: string } {
  const raw = `kn_${randomBytes(24).toString("base64url")}`;
  return { raw, hash: hashApiKey(raw) };
}

export function generateClaimToken(): string {
  return randomBytes(16).toString("base64url");
}

export async function authenticateAgentRequest(req: Request): Promise<AgentDoc> {
  const auth = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(auth);
  if (!match) throw new Response("Missing bearer token", { status: 401 });
  await connectMongo();
  const agent = await Agent.findOne({ apiKeyHash: hashApiKey(match[1]) });
  if (!agent) throw new Response("Invalid token", { status: 401 });
  if (agent.claimStatus !== "claimed") throw new Response("Agent not claimed", { status: 403 });
  return agent.toObject() as AgentDoc;
}
