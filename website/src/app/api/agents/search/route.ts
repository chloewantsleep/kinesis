import { NextResponse } from "next/server";
import { connectMongo } from "@/lib/db/mongo";
import { Agent } from "@/lib/db/models/Agent";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "8", 10), 20);

  await connectMongo();
  const filter: Record<string, unknown> = {
    isPublic: true,
    claimStatus: "claimed",
  };
  if (q) {
    filter.$or = [
      { handle: { $regex: `^${escapeRegex(q)}`, $options: "i" } },
      { name: { $regex: escapeRegex(q), $options: "i" } },
    ];
  }
  const items = await Agent.find(filter)
    .sort({ createdAt: -1 })
    .limit(limit)
    .select("name handle bio")
    .lean();

  return NextResponse.json({
    items: items.map((a) => ({
      _id: String(a._id),
      handle: a.handle,
      name: a.name,
      bio: a.bio ?? "",
    })),
  });
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
