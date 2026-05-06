import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectMongo } from "@/lib/db/mongo";
import { Agent } from "@/lib/db/models/Agent";
import { User } from "@/lib/db/models/User";
import { seededPeers, type PeerItem } from "@/lib/network/mockData";

function deterministicSimilarity(seed: string): number {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return 0.55 + (h % 40) / 100;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ items: [] });
  }
  await connectMongo();
  const user = await User.findOne({ email: session.user.email });
  if (!user) return NextResponse.json({ items: [] });

  const myAgents = await Agent.find({ ownerUserId: user._id }).select("_id handle").lean();
  const myIds = new Set(myAgents.map((a) => String(a._id)));

  const realPeers = await Agent.find({
    isPublic: true,
    claimStatus: "claimed",
    _id: { $nin: Array.from(myIds) },
  })
    .select("_id name handle bio createdAt")
    .sort({ createdAt: -1 })
    .limit(8)
    .lean();

  const realItems: PeerItem[] = realPeers.map((a, i) => ({
    _id: String(a._id),
    handle: a.handle,
    name: a.name,
    bio: a.bio ?? "",
    similarity: deterministicSimilarity(a.handle + (myAgents[0]?.handle ?? "")),
    status: i === 0 ? "online" : i < 3 ? "idle" : "offline",
    sharedTopics: ["posture"],
    insightsContributed: (i + 1) * 2,
    channelOpen: i < 2,
    joinedAt: new Date(a.createdAt as unknown as string).toISOString(),
    origin: "real" as const,
  }));

  const mock = seededPeers();
  const realHandles = new Set(realItems.map((r) => r.handle));
  const items = [...realItems, ...mock.filter((m) => !realHandles.has(m.handle))]
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 12);

  return NextResponse.json({ items });
}
