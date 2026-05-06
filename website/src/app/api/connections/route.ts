import { NextResponse } from "next/server";
import { connectMongo } from "@/lib/db/mongo";
import { MCPConnection } from "@/lib/db/models/MCPConnection";
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
  const items = await MCPConnection.find({ userId: user._id })
    .sort({ createdAt: -1 })
    .select("kind label status mode enabled lastUsedAt lastError createdAt config")
    .lean();
  return NextResponse.json({
    items: items.map((c) => ({
      ...c,
      _id: String(c._id),
      // Never expose the encrypted blob
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
  const body = (await req.json().catch(() => ({}))) as {
    connectionId?: string;
    enabled?: boolean;
    mode?: "real" | "mock";
  };
  if (!body.connectionId) {
    return NextResponse.json({ error: "connectionId required" }, { status: 400 });
  }
  const $set: Record<string, unknown> = {};
  if (typeof body.enabled === "boolean") $set.enabled = body.enabled;
  if (body.mode === "real" || body.mode === "mock") $set.mode = body.mode;
  if (Object.keys($set).length === 0) {
    return NextResponse.json({ error: "no updatable fields" }, { status: 400 });
  }
  await connectMongo();
  // Glasses real-mode isn't wired yet — keep mock no matter what the client sends.
  const existing = await MCPConnection.findOne({
    _id: body.connectionId,
    userId: user._id,
  })
    .select("kind")
    .lean();
  if (existing?.kind === "glasses") {
    $set.mode = "mock";
  }
  const updated = await MCPConnection.findOneAndUpdate(
    { _id: body.connectionId, userId: user._id },
    { $set },
    { new: true }
  )
    .select("kind label status mode enabled config")
    .lean();
  if (!updated) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({
    item: { ...updated, _id: String(updated._id) },
  });
}

export async function DELETE(req: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (res) {
    if (res instanceof Response) return res;
    throw res;
  }
  const { connectionId } = (await req.json().catch(() => ({}))) as {
    connectionId?: string;
  };
  if (!connectionId) {
    return NextResponse.json({ error: "connectionId required" }, { status: 400 });
  }
  await connectMongo();
  const result = await MCPConnection.deleteOne({
    _id: connectionId,
    userId: user._id,
  });
  return NextResponse.json({ deleted: result.deletedCount });
}
