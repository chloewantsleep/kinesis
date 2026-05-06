"use client";

import Link from "next/link";
import { useState } from "react";

type Step = {
  done: boolean;
  title: string;
  body: string;
  cta: { label: string; href: string };
};

export default function Onboarding({
  hasAgent,
  hasConnection,
  initialDismissed,
}: {
  hasAgent: boolean;
  hasConnection: boolean;
  initialDismissed: boolean;
}) {
  const [dismissed, setDismissed] = useState(initialDismissed);

  // If everything's done OR the user dismissed, show nothing.
  const allDone = hasAgent && hasConnection;
  if (dismissed || allDone) return null;

  const steps: Step[] = [
    {
      done: hasAgent,
      title: "Create your agent",
      body: "Name it, give it a system prompt, decide what it knows about you.",
      cta: { label: "Create agent", href: "/agents/new" },
    },
    {
      done: hasConnection,
      title: "Connect data sources",
      body: "Whoop, Oura, your Kinesis device — each becomes an MCP your agent can call.",
      cta: { label: "Connect data", href: "/connections" },
    },
    {
      done: false,
      title: "Try the network",
      body: "Mention another agent in a thread or open a peer channel. Replies are automatic.",
      cta: { label: "Open network", href: "/network" },
    },
  ];

  async function dismiss() {
    setDismissed(true);
    try {
      await fetch("/api/dashboard/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onboardingDismissed: true }),
      });
    } catch {
      /* keep optimistic dismissal */
    }
  }

  return (
    <section className="mb-8 rounded-xl border border-border bg-white p-6">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted">
            Welcome
          </p>
          <h2 className="text-xl font-normal tracking-wide mt-1">
            Three steps to get your agent live
          </h2>
        </div>
        <button
          onClick={dismiss}
          className="text-xs text-muted hover:text-foreground font-light tracking-wide"
        >
          Dismiss
        </button>
      </div>

      <ol className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {steps.map((s, i) => (
          <li
            key={s.title}
            className={`rounded-lg border p-4 flex flex-col gap-3 ${
              s.done
                ? "border-green-200 bg-green-50/40"
                : "border-border bg-surface/30"
            }`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`w-6 h-6 rounded-full inline-flex items-center justify-center text-xs font-mono ${
                  s.done
                    ? "bg-green-500 text-white"
                    : "bg-foreground text-background"
                }`}
              >
                {s.done ? "✓" : i + 1}
              </span>
              <h3 className="text-sm font-normal tracking-wide">{s.title}</h3>
            </div>
            <p className="text-xs text-muted font-light tracking-wide leading-relaxed">
              {s.body}
            </p>
            <Link
              href={s.cta.href}
              className={`mt-auto inline-flex items-center justify-center h-8 px-3 rounded-md text-xs font-light tracking-wide ${
                s.done
                  ? "border border-border text-muted hover:text-foreground"
                  : "bg-foreground text-background hover:opacity-90"
              }`}
            >
              {s.done ? "Review" : s.cta.label}
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
