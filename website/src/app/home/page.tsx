import { redirect } from "next/navigation";
import { auth } from "@/auth";
import PlatformNav from "@/components/platform/PlatformNav";
import HomeView from "./HomeView";

export const dynamic = "force-dynamic";

export default async function HomePageRoute() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");
  const firstName = session.user.name?.split(" ")[0] ?? "";

  return (
    <>
      <PlatformNav />
      <main className="max-w-5xl mx-auto px-6 md:px-10 py-12">
        <HomeView firstName={firstName} />
      </main>
    </>
  );
}
