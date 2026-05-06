import { NextResponse } from "next/server";
import { connectMongo } from "@/lib/db/mongo";
import { DashboardSettings } from "@/lib/db/models/DashboardSettings";
import { Agent } from "@/lib/db/models/Agent";
import { requireUser } from "@/lib/auth/session";

type SettingsBody = {
  agentEnabled?: boolean;
  mockStatusVisible?: boolean;
  primaryAgentId?: string | null;
  onboardingDismissed?: boolean;
};

export async function GET() {
  let user;
  try {
    user = await requireUser();
  } catch (res) {
    if (res instanceof Response) return res;
    throw res;
  }
  await connectMongo();
  const doc = await DashboardSettings.findOneAndUpdate(
    { userId: user._id },
    { $setOnInsert: { userId: user._id } },
    { upsert: true, new: true }
  ).lean();

  let primaryAgentId = doc!.primaryAgentId
    ? String(doc!.primaryAgentId)
    : null;
  if (!primaryAgentId) {
    const first = await Agent.findOne({ ownerUserId: user._id })
      .sort({ createdAt: -1 })
      .select("_id")
      .lean();
    if (first) {
      primaryAgentId = String(first._id);
      await DashboardSettings.updateOne(
        { userId: user._id },
        { $set: { primaryAgentId: first._id } }
      );
    }
  }

  return NextResponse.json({
    settings: {
      agentEnabled: doc!.agentEnabled ?? true,
      mockStatusVisible: doc!.mockStatusVisible ?? true,
      onboardingDismissed: doc!.onboardingDismissed ?? false,
      primaryAgentId,
    },
  });
}

export async function PUT(req: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (res) {
    if (res instanceof Response) return res;
    throw res;
  }
  const body = (await req.json().catch(() => ({}))) as SettingsBody;
  await connectMongo();

  const $set: Record<string, unknown> = {};
  if (typeof body.agentEnabled === "boolean")
    $set.agentEnabled = body.agentEnabled;
  if (typeof body.mockStatusVisible === "boolean")
    $set.mockStatusVisible = body.mockStatusVisible;
  if (typeof body.onboardingDismissed === "boolean")
    $set.onboardingDismissed = body.onboardingDismissed;
  if (body.primaryAgentId !== undefined) {
    if (body.primaryAgentId) {
      const owns = await Agent.exists({
        _id: body.primaryAgentId,
        ownerUserId: user._id,
      });
      if (!owns)
        return NextResponse.json({ error: "agent not found" }, { status: 404 });
      $set.primaryAgentId = body.primaryAgentId;
    } else {
      $set.primaryAgentId = null;
    }
  }

  const doc = await DashboardSettings.findOneAndUpdate(
    { userId: user._id },
    { $set, $setOnInsert: { userId: user._id } },
    { upsert: true, new: true }
  ).lean();

  return NextResponse.json({
    settings: {
      agentEnabled: doc!.agentEnabled ?? true,
      mockStatusVisible: doc!.mockStatusVisible ?? true,
      onboardingDismissed: doc!.onboardingDismissed ?? false,
      primaryAgentId: doc!.primaryAgentId ? String(doc!.primaryAgentId) : null,
    },
  });
}
