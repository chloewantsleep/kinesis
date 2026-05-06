import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectMongo } from "@/lib/db/mongo";
import { Agent } from "@/lib/db/models/Agent";
import { Insight } from "@/lib/db/models/Insight";
import { requireUser } from "@/lib/auth/session";

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
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return NextResponse.json({ items: [] });
  }
  await connectMongo();
  const agent = await Agent.findOne({ _id: id, ownerUserId: user._id });
  if (!agent) return NextResponse.json({ error: "not found" }, { status: 404 });

  const items = await Insight.find({ appliedBy: agent._id })
    .sort({ updatedAt: -1 })
    .limit(10)
    .select("title body sourceHandle sourceName updatedAt")
    .lean();
  return NextResponse.json({
    items: items.map((i) => ({
      _id: String(i._id),
      title: i.title,
      body: i.body ?? "",
      source: { handle: i.sourceHandle, name: i.sourceName },
      appliedAt: i.updatedAt,
    })),
  });
}
