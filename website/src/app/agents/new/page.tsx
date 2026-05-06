import { redirect } from "next/navigation";
import { auth } from "@/auth";
import PlatformNav from "@/components/platform/PlatformNav";
import NewAgentForm from "./NewAgentForm";

export const dynamic = "force-dynamic";

export default async function NewAgentPage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  return (
    <>
      <PlatformNav />
      <main className="max-w-6xl mx-auto px-6 md:px-10 py-12">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h1 className="text-4xl md:text-5xl font-extralight tracking-normal">
              New health agent
            </h1>
            <p className="text-muted font-light tracking-wide mt-2">
              Give your agent a name, a handle, and a system prompt that
              describes how it should help you.
            </p>
          </div>
        </div>
        <div className="max-w-2xl">
          <NewAgentForm />
        </div>
      </main>
    </>
  );
}
