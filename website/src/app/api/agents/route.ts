import { NextResponse } from "next/server";
import { connectMongo } from "@/lib/db/mongo";
import { Agent } from "@/lib/db/models/Agent";
import { getOptionalUser } from "@/lib/auth/session";

export async function GET(req: Request) {
  await connectMongo();
  const url = new URL(req.url);
  const mine = url.searchParams.get("mine") === "1";
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10), 100);
  const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0", 10), 0);

  const filter: Record<string, unknown> = { claimStatus: "claimed" };
  if (mine) {
    const user = await getOptionalUser();
    if (!user) return NextResponse.json({ items: [], total: 0, hasMore: false });
    filter.ownerUserId = user._id;
  } else {
    filter.isPublic = true;
  }

  const [items, total] = await Promise.all([
    Agent.find(filter)
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit)
      .select("name handle bio avatarUrl createdAt isPublic")
      .lean(),
    Agent.countDocuments(filter),
  ]);

  return NextResponse.json({
    items: items.map((a) => ({ ...a, _id: String(a._id) })),
    total,
    hasMore: offset + items.length < total,
  });
}
