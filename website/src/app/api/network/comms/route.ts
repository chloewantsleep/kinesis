import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { auth } from "@/auth";
import { connectMongo } from "@/lib/db/mongo";
import { Agent } from "@/lib/db/models/Agent";
import { Message } from "@/lib/db/models/Message";
import { Thread } from "@/lib/db/models/Thread";
import { User } from "@/lib/db/models/User";
import { seededComms, type CommThread, type CommMessage } from "@/lib/network/mockData";

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ items: seededComms("your-agent", "Your agent") });
  }
  await connectMongo();
  const user = await User.findOne({ email: session.user.email });
  if (!user) return NextResponse.json({ items: seededComms("your-agent", "Your agent") });

  const myAgent = await Agent.findOne({ ownerUserId: user._id })
    .sort({ createdAt: -1 })
    .lean();
  const myHandle = myAgent?.handle ?? "your-agent";
  const myName = myAgent?.name ?? "Your agent";

  const items: CommThread[] = [];

  if (myAgent) {
    const threads = await Thread.find({
      participantAgentIds: myAgent._id,
    })
      .sort({ lastMessageAt: -1 })
      .limit(5)
      .lean();

    for (const t of threads) {
      const msgs = await Message.find({ threadId: t._id })
        .sort({ createdAt: 1 })
        .limit(20)
        .lean();
      if (msgs.length === 0) continue;
      const authorIds = Array.from(new Set(msgs.map((m) => String(m.authorAgentId))));
      const authors = await Agent.find({
        _id: { $in: authorIds.map((i) => new mongoose.Types.ObjectId(i)) },
      })
        .select("_id name handle")
        .lean();
      const am = new Map(authors.map((a) => [String(a._id), a]));
      const peerAuthor = authors.find((a) => String(a._id) !== String(myAgent._id));

      const messages: CommMessage[] = msgs.map((m) => {
        const author = am.get(String(m.authorAgentId));
        const isMe = String(m.authorAgentId) === String(myAgent._id);
        return {
          _id: String(m._id),
          from: isMe ? "me" : "peer",
          fromHandle: author?.handle ?? "unknown",
          fromName: author?.name ?? "unknown",
          content: m.content,
          createdAt: new Date(m.createdAt as unknown as string).toISOString(),
        };
      });

      items.push({
        _id: String(t._id),
        threadId: String(t._id),
        title: t.title,
        topic: t.topic ?? "",
        peer: peerAuthor
          ? { handle: peerAuthor.handle, name: peerAuthor.name }
          : { handle: "network", name: "Network" },
        myAgent: { handle: myHandle, name: myName },
        status: t.status === "closed" ? "resolved" : "live",
        unread: 0,
        messages,
        origin: "real" as const,
      });
    }
  }

  // Pad with mock only when the user has fewer than 3 real comms — keeps the demo
  // rich at first run, but quietly steps aside as real activity grows.
  if (items.length < 3) {
    const mock = seededComms(myHandle, myName);
    const seen = new Set(items.map((i) => i.title));
    for (const m of mock) if (!seen.has(m.title)) items.push(m);
  }

  return NextResponse.json({ items: items.slice(0, 6) });
}
