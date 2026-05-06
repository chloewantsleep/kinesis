import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { connectMongo } from "@/lib/db/mongo";
import { User } from "@/lib/db/models/User";
import { MCPConnection } from "@/lib/db/models/MCPConnection";
import PlatformNav from "@/components/platform/PlatformNav";
import ConnectionsBoard from "./ConnectionsBoard";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ connected?: string; error?: string; msg?: string }>;

export default async function ConnectionsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");
  const sp = await searchParams;

  await connectMongo();
  const user = await User.findOneAndUpdate(
    { email: session.user.email },
    {
      $setOnInsert: {
        email: session.user.email,
        name: session.user.name ?? undefined,
        image: session.user.image ?? undefined,
      },
    },
    { upsert: true, new: true }
  );

  const conns = await MCPConnection.find({ userId: user._id })
    .sort({ createdAt: -1 })
    .select("kind label status mode lastError config createdAt")
    .lean();

  return (
    <>
      <PlatformNav />
      <main className="max-w-6xl mx-auto px-6 md:px-10 py-12">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h1 className="text-4xl md:text-5xl font-extralight tracking-normal">
              Connections
            </h1>
            <p className="text-muted font-light tracking-wide mt-2">
              Connect health data sources so your agent can read them. Mock mode
              uses simulated data for the demo.
            </p>
          </div>
        </div>

        {sp.connected && (
          <div className="mb-6 border border-border bg-surface/40 rounded p-4 text-sm font-light max-w-3xl">
            Connected <strong>{sp.connected}</strong> successfully.
          </div>
        )}
        {sp.error && (
          <div className="mb-6 border border-red-300 bg-red-50 rounded p-4 text-sm font-light text-red-700 max-w-3xl">
            Error: {sp.error}
            {sp.msg && ` — ${sp.msg}`}
          </div>
        )}

        <div className="max-w-3xl">
          <ConnectionsBoard
            existing={conns.map((c) => ({
              _id: String(c._id),
              kind: c.kind,
              label: c.label,
              status: c.status,
              mode: c.mode,
              lastError: c.lastError,
              config: c.config as Record<string, unknown>,
            }))}
          />
        </div>
      </main>
    </>
  );
}
