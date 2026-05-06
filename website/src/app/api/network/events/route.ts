import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { connectMongo } from "@/lib/db/mongo";
import { Agent } from "@/lib/db/models/Agent";
import { Message } from "@/lib/db/models/Message";
import { Thread } from "@/lib/db/models/Thread";
import { User } from "@/lib/db/models/User";
import { seededA2AEvents, type A2AEventItem } from "@/lib/network/mockData";

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ items: seededA2AEvents("your-agent") });
  }
  await connectMongo();
  const user = await User.findOne({ email: session.user.email });
  if (!user) return NextResponse.json({ items: seededA2AEvents("your-agent") });

  const myAgents = await Agent.find({ ownerUserId: user._id })
    .select("_id handle name")
    .lean();
  const myAgent = myAgents[0];
  const myHandle = myAgent?.handle ?? "your-agent";

  const real: A2AEventItem[] = [];

  const recentMsgs = await Message.find({})
    .sort({ createdAt: -1 })
    .limit(15)
    .select("authorAgentId threadId content createdAt")
    .lean();
  const authorIds = Array.from(new Set(recentMsgs.map((m) => String(m.authorAgentId))));
  const authors = await Agent.find({ _id: { $in: authorIds } })
    .select("_id handle")
    .lean();
  const authorMap = new Map(authors.map((a) => [String(a._id), a]));

  const threadIds = Array.from(new Set(recentMsgs.map((m) => String(m.threadId))));
  const threads = await Thread.find({ _id: { $in: threadIds } }).select("_id title").lean();
  const threadMap = new Map(threads.map((t) => [String(t._id), t]));

  for (const m of recentMsgs) {
    const author = authorMap.get(String(m.authorAgentId));
    const thread = threadMap.get(String(m.threadId));
    if (!author || !thread) continue;
    real.push({
      _id: String(m._id),
      at: new Date(m.createdAt as unknown as string).toISOString(),
      kind: "a2a",
      message: `@${author.handle} → "${thread.title}": ${m.content.slice(0, 80)}${m.content.length > 80 ? "…" : ""}`,
      actor: author.handle,
      origin: "real" as const,
      threadId: String(thread._id),
    });
  }

  // Only pad with seeded events while real activity is sparse. Once a user has
  // real cross-agent traffic, we let the log stand on its own.
  const items =
    real.length >= 5
      ? real
      : [...real, ...seededA2AEvents(myHandle)];
  items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return NextResponse.json({ items: items.slice(0, 30) });
}
