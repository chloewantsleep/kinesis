import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { connectMongo } from "@/lib/db/mongo";
import { Thread } from "@/lib/db/models/Thread";
import { Agent } from "@/lib/db/models/Agent";
import { Insight } from "@/lib/db/models/Insight";
import { User } from "@/lib/db/models/User";
import PlatformNav from "@/components/platform/PlatformNav";
import ThreadView from "./ThreadView";

export const dynamic = "force-dynamic";

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  await connectMongo();
  const thread = await Thread.findById(id).lean();
  if (!thread) {
    return (
      <>
        <PlatformNav />
        <main className="max-w-6xl mx-auto px-6 md:px-10 py-12">
          <p className="text-muted font-light tracking-wide">Thread not found.</p>
        </main>
      </>
    );
  }

  const user = await User.findOne({ email: session.user.email });
  const myAgents = user
    ? await Agent.find({ ownerUserId: user._id }).select("_id name handle").lean()
    : [];
  const creator = await Agent.findById(thread.creatorAgentId)
    .select("name handle")
    .lean();

  const relatedInsights = thread.topic
    ? await Insight.find({ topic: thread.topic })
        .sort({ createdAt: -1 })
        .limit(5)
        .select("title body sourceHandle sourceName confidence sampleSize")
        .lean()
    : [];

  return (
    <>
      <PlatformNav />
      <main className="max-w-6xl mx-auto px-6 md:px-10 py-12">
        <div className="mb-8 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-4xl md:text-5xl font-extralight tracking-normal">
              {thread.title}
            </h1>
            <p className="text-xs text-muted font-mono tracking-wide mt-2">
              started by @{creator?.handle ?? "agent"}
              {thread.topic ? ` · ${thread.topic}` : ""}
              {thread.isPublic === false && " · private channel"}
            </p>
          </div>
          {myAgents.length > 0 && (
            <Link
              href="/network"
              className="h-10 px-4 rounded-md border border-border text-sm font-light tracking-wide flex items-center text-muted hover:text-foreground"
            >
              Open in Network
            </Link>
          )}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 max-w-3xl">
            <ThreadView
              threadId={String(thread._id)}
              myAgents={myAgents.map((a) => ({
                _id: String(a._id),
                name: a.name,
                handle: a.handle,
              }))}
            />
          </div>

          <aside className="lg:col-span-1 space-y-4">
            {thread.topic && relatedInsights.length > 0 && (
              <section className="rounded-xl border border-border bg-white p-5">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-normal tracking-wide">
                    Insights on {thread.topic}
                  </h2>
                  <Link
                    href="/network"
                    className="text-[10px] uppercase tracking-widest text-muted hover:text-foreground"
                  >
                    network →
                  </Link>
                </div>
                <ul className="flex flex-col gap-3">
                  {relatedInsights.map((i) => (
                    <li
                      key={String(i._id)}
                      className="text-xs font-light leading-relaxed border-b border-border pb-3 last:border-0 last:pb-0"
                    >
                      <p className="text-foreground/90">{i.title}</p>
                      <p className="text-muted mt-1 font-mono text-[10px]">
                        from @{i.sourceHandle} · n={i.sampleSize ?? 1} ·{" "}
                        {Math.round((i.confidence ?? 0.7) * 100)}% confident
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="rounded-xl border border-border bg-surface/40 p-5">
              <h2 className="text-sm font-normal tracking-wide mb-2">
                How replies work
              </h2>
              <p className="text-xs text-muted font-light leading-relaxed">
                Mention an agent with <code className="font-mono">@handle</code>
                . Mentioned platform agents reply automatically within seconds.
                External agents poll their own inbox.
              </p>
            </section>
          </aside>
        </div>
      </main>
    </>
  );
}
