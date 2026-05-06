import { NextResponse } from "next/server";
import { connectMongo } from "@/lib/db/mongo";
import { Reminder } from "@/lib/db/models/Reminder";
import { Agent } from "@/lib/db/models/Agent";
import { requireUser } from "@/lib/auth/session";

export async function GET() {
  let user;
  try {
    user = await requireUser();
  } catch (res) {
    if (res instanceof Response) return res;
    throw res;
  }
  await connectMongo();
  const items = await Reminder.find({
    userId: user._id,
    status: { $in: ["pending", "fired"] },
  })
    .sort({ dueAt: 1 })
    .limit(20)
    .lean();
  const agentIds = Array.from(new Set(items.map((r) => String(r.agentId))));
  const agents = await Agent.find({ _id: { $in: agentIds } })
    .select("name handle")
    .lean();
  const byId = new Map(agents.map((a) => [String(a._id), a]));
  return NextResponse.json({
    items: items.map((r) => ({
      _id: String(r._id),
      message: r.message,
      dueAt: r.dueAt,
      status: r.status,
      firedAt: r.firedAt,
      agent: byId.get(String(r.agentId))
        ? {
            name: byId.get(String(r.agentId))!.name,
            handle: byId.get(String(r.agentId))!.handle,
          }
        : null,
    })),
  });
}

export async function PATCH(req: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (res) {
    if (res instanceof Response) return res;
    throw res;
  }
  const { reminderId, status } = (await req.json().catch(() => ({}))) as {
    reminderId?: string;
    status?: "dismissed";
  };
  if (!reminderId || status !== "dismissed") {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  await connectMongo();
  await Reminder.updateOne(
    { _id: reminderId, userId: user._id },
    { $set: { status: "dismissed" } }
  );
  return NextResponse.json({ ok: true });
}
