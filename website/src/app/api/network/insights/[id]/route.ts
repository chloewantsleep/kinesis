import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { auth } from "@/auth";
import { connectMongo } from "@/lib/db/mongo";
import { Agent } from "@/lib/db/models/Agent";
import { Insight } from "@/lib/db/models/Insight";
import { User } from "@/lib/db/models/User";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    action?: "apply" | "verify" | "dismiss" | "undo";
    agentId?: string;
  };
  if (!body.action) {
    return NextResponse.json({ error: "action required" }, { status: 400 });
  }

  await connectMongo();
  const user = await User.findOne({ email: session.user.email });
  if (!user) return NextResponse.json({ error: "no user" }, { status: 404 });

  const myAgent = body.agentId
    ? await Agent.findOne({ _id: body.agentId, ownerUserId: user._id })
    : await Agent.findOne({ ownerUserId: user._id }).sort({ createdAt: -1 });
  if (!myAgent) {
    return NextResponse.json({ error: "no agent" }, { status: 404 });
  }

  // Mock insight ids start with "ins-" — accept and 200 silently
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return NextResponse.json({ ok: true, ephemeral: true });
  }

  const insight = await Insight.findById(id);
  if (!insight) return NextResponse.json({ error: "not found" }, { status: 404 });

  const aid = myAgent._id;
  const has = (arr: mongoose.Types.ObjectId[]) =>
    arr.some((x) => String(x) === String(aid));

  if (body.action === "apply") {
    if (!has(insight.appliedBy as mongoose.Types.ObjectId[])) {
      insight.appliedBy.push(aid);
    }
    insight.dismissedBy = (insight.dismissedBy as mongoose.Types.ObjectId[]).filter(
      (x) => String(x) !== String(aid)
    );
  } else if (body.action === "dismiss") {
    if (!has(insight.dismissedBy as mongoose.Types.ObjectId[])) {
      insight.dismissedBy.push(aid);
    }
    insight.appliedBy = (insight.appliedBy as mongoose.Types.ObjectId[]).filter(
      (x) => String(x) !== String(aid)
    );
  } else if (body.action === "verify") {
    if (!insight.verifiers.some((v) => String(v.agentId) === String(aid))) {
      insight.verifiers.push({
        agentId: aid,
        handle: myAgent.handle,
        name: myAgent.name,
        verifiedAt: new Date(),
      });
    }
  } else if (body.action === "undo") {
    insight.appliedBy = (insight.appliedBy as mongoose.Types.ObjectId[]).filter(
      (x) => String(x) !== String(aid)
    );
    insight.dismissedBy = (insight.dismissedBy as mongoose.Types.ObjectId[]).filter(
      (x) => String(x) !== String(aid)
    );
  }
  await insight.save();
  return NextResponse.json({ ok: true });
}
