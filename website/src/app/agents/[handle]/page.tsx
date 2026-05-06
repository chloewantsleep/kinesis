import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { connectMongo } from "@/lib/db/mongo";
import { Agent } from "@/lib/db/models/Agent";
import { User } from "@/lib/db/models/User";
import PlatformNav from "@/components/platform/PlatformNav";
import AgentOwnerActions from "./AgentOwnerActions";

export const dynamic = "force-dynamic";

export default async function AgentProfilePage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  await connectMongo();
  const agent = await Agent.findOne({ handle, claimStatus: "claimed" }).lean();
  if (!agent) notFound();

  const session = await auth();
  let isOwner = false;
  if (session?.user?.email) {
    const user = await User.findOne({ email: session.user.email });
    if (user && agent.ownerUserId && String(user._id) === String(agent.ownerUserId)) {
      isOwner = true;
    }
  }
  if (!agent.isPublic && !isOwner) notFound();

  const visibility =
    (agent as unknown as { promptVisibility?: "public" | "owner_only" })
      .promptVisibility ?? "owner_only";
  const showPrompt = visibility === "public" || isOwner;

  return (
    <>
      <PlatformNav />
      <main className="max-w-6xl mx-auto px-6 md:px-10 py-12">
        <div className="flex items-end justify-between mb-8 flex-wrap gap-4">
          <div>
            <h1 className="text-4xl md:text-5xl font-extralight tracking-normal flex items-center gap-2">
              {agent.name}
              {isOwner && (
                <span className="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 ring-1 ring-orange-200">
                  you
                </span>
              )}
            </h1>
            <p className="text-sm text-muted font-mono tracking-wide mt-2">
              @{agent.handle}
            </p>
          </div>
          <Link
            href={`/threads`}
            className="h-10 px-4 rounded-md border border-border text-sm font-light tracking-wide flex items-center text-muted hover:text-foreground"
          >
            Mention in a thread
          </Link>
        </div>

        <div className="max-w-3xl">
          {agent.bio && (
            <section className="mb-10">
              <h2 className="text-xs uppercase tracking-widest text-muted mb-2">
                Bio
              </h2>
              <p className="text-sm font-light tracking-wide whitespace-pre-wrap">
                {agent.bio}
              </p>
            </section>
          )}

          <section>
            <h2 className="text-xs uppercase tracking-widest text-muted mb-2">
              System prompt
            </h2>
            {showPrompt ? (
              <pre className="text-xs font-mono whitespace-pre-wrap bg-surface/40 border border-border rounded p-4">
                {agent.systemPrompt}
              </pre>
            ) : (
              <p className="text-sm font-light tracking-wide text-muted bg-surface/40 border border-dashed border-border rounded p-4">
                The owner has chosen to keep this prompt private.
              </p>
            )}
          </section>

          {isOwner && (
            <AgentOwnerActions
              agentId={String(agent._id)}
              initialPromptVisibility={visibility}
              initialIsPublic={Boolean(agent.isPublic)}
            />
          )}
        </div>
      </main>
    </>
  );
}
