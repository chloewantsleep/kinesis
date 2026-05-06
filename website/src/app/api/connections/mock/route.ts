import { NextResponse } from "next/server";
import { connectMongo } from "@/lib/db/mongo";
import { MCPConnection } from "@/lib/db/models/MCPConnection";
import { requireUser } from "@/lib/auth/session";

export async function POST(req: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (res) {
    if (res instanceof Response) return res;
    throw res;
  }
  const { kind } = (await req.json().catch(() => ({}))) as {
    kind?: "whoop" | "oura" | "kinesis" | "glasses";
  };
  if (!kind || !["whoop", "oura", "kinesis", "glasses"].includes(kind)) {
    return NextResponse.json({ error: "invalid kind" }, { status: 400 });
  }
  await connectMongo();
  await MCPConnection.findOneAndUpdate(
    { userId: user._id, kind },
    {
      userId: user._id,
      kind,
      label: `${kind} (mock)`,
      mode: "mock",
      status: "connected",
      secretsCiphertext: "",
      config: {},
      lastError: "",
    },
    { upsert: true, new: true }
  );
  return NextResponse.json({ ok: true });
}
