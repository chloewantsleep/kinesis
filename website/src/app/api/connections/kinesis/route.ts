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
  const { deviceUrl } = (await req.json().catch(() => ({}))) as {
    deviceUrl?: string;
  };
  if (!deviceUrl || !/^https?:\/\//.test(deviceUrl)) {
    return NextResponse.json({ error: "deviceUrl must be http(s) URL" }, { status: 400 });
  }
  await connectMongo();
  await MCPConnection.findOneAndUpdate(
    { userId: user._id, kind: "kinesis" },
    {
      userId: user._id,
      kind: "kinesis",
      label: deviceUrl,
      mode: "real",
      status: "connected",
      config: { deviceUrl },
      secretsCiphertext: "",
      lastError: "",
    },
    { upsert: true, new: true }
  );
  return NextResponse.json({ ok: true });
}
