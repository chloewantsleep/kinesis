import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectMongo } from "@/lib/db/mongo";
import { Agent } from "@/lib/db/models/Agent";
import { Insight } from "@/lib/db/models/Insight";
import { User } from "@/lib/db/models/User";
import { seededInsights, type InsightItem } from "@/lib/network/mockData";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  await connectMongo();
  const user = await User.findOne({ email: session.user.email });
  if (!user) return NextResponse.json({ items: [] });

  const url = new URL(req.url);
  const agentId = url.searchParams.get("agentId");
  const myAgent = agentId
    ? await Agent.findOne({ _id: agentId, ownerUserId: user._id }).lean()
    : await Agent.findOne({ ownerUserId: user._id }).sort({ createdAt: -1 }).lean();

  const myHandle = myAgent?.handle ?? "your-agent";

  const real = await Insight.find({})
    .sort({ createdAt: -1 })
    .limit(20)
    .lean()
    .catch(() => []);

  const realItems: InsightItem[] = real.map((r) => ({
    _id: String(r._id),
    title: r.title,
    body: r.body ?? "",
    topic: r.topic ?? "",
    metric: r.metric ?? "",
    delta: r.delta ?? "",
    kind: (r.kind ?? "pattern") as InsightItem["kind"],
    color: (r.color ?? "orange") as InsightItem["color"],
    sampleSize: r.sampleSize ?? 1,
    similarity: r.similarity ?? 0.7,
    confidence: r.confidence ?? 0.7,
    source: { handle: r.sourceHandle, name: r.sourceName },
    verifiers: (r.verifiers ?? []).map((v) => ({ handle: v.handle, name: v.name })),
    createdAt: r.createdAt ? new Date(r.createdAt as unknown as string).toISOString() : new Date().toISOString(),
    applied: myAgent ? (r.appliedBy ?? []).some((a) => String(a) === String(myAgent._id)) : false,
    dismissed: myAgent
      ? (r.dismissedBy ?? []).some((a) => String(a) === String(myAgent._id))
      : false,
    origin: "real" as const,
  }));

  const mock = seededInsights(myHandle);
  // De-dupe: real wins on title collision
  const realTitles = new Set(realItems.map((r) => r.title));
  const items = [
    ...realItems,
    ...mock.filter((m) => !realTitles.has(m.title)),
  ].slice(0, 20);

  return NextResponse.json({ items, myAgent: myAgent ? { handle: myAgent.handle, name: myAgent.name } : null });
}
