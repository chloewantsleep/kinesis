import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm flex flex-col items-center text-center gap-6">
        <div>
          <h1 className="text-3xl font-extralight tracking-wide">Sign in</h1>
          <p className="text-sm text-muted font-light tracking-wide mt-2">
            Create your personal health agent.
          </p>
        </div>
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/dashboard" });
          }}
          className="w-full"
        >
          <button
            type="submit"
            className="w-full h-11 rounded-md border border-border bg-background hover:bg-surface transition text-sm font-light tracking-wide"
          >
            Continue with Google
          </button>
        </form>
        <p className="text-xs text-muted font-light tracking-wider">
          By signing in you agree to participate in the Kinesis class demo.
        </p>
      </div>
    </main>
  );
}
