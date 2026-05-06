"use client";

import { useEffect, useState } from "react";

type Reminder = {
  _id: string;
  message: string;
  dueAt: string;
  status: "pending" | "fired";
  agent: { name: string; handle: string } | null;
};

export default function RemindersList({ initial }: { initial: Reminder[] }) {
  const [items, setItems] = useState<Reminder[]>(initial);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setInterval(async () => {
      const res = await fetch("/api/reminders");
      if (res.ok) {
        const data = (await res.json()) as { items: Reminder[] };
        setItems(data.items);
      }
    }, 8000);
    return () => clearInterval(t);
  }, []);

  async function dismiss(id: string) {
    setBusy(true);
    await fetch("/api/reminders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reminderId: id, status: "dismissed" }),
    });
    setItems((prev) => prev.filter((x) => x._id !== id));
    setBusy(false);
  }

  async function tick() {
    setBusy(true);
    await fetch("/api/cron/agent-tick", { method: "POST" });
    const res = await fetch("/api/reminders");
    if (res.ok) {
      const data = (await res.json()) as { items: Reminder[] };
      setItems(data.items);
    }
    setBusy(false);
  }

  const fired = items.filter((r) => r.status === "fired");
  const pending = items.filter((r) => r.status === "pending");

  if (items.length === 0) return null;

  return (
    <section className="mt-10 border border-border rounded-lg p-5 bg-surface/40">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs uppercase tracking-widest text-muted">
          Reminders
        </h2>
        <button
          onClick={tick}
          disabled={busy}
          className="h-7 px-3 rounded-md border border-border text-xs font-light tracking-wide text-muted hover:text-foreground"
          title="Run agent-tick now: fires due reminders, wakes mentioned agents"
        >
          Tick now
        </button>
      </div>
      {fired.length > 0 && (
        <ul className="flex flex-col gap-2 mb-3">
          {fired.map((r) => (
            <li
              key={r._id}
              className="flex items-start gap-3 p-3 border border-yellow-300 bg-yellow-50/40 rounded"
            >
              <span className="text-xs text-yellow-700 uppercase tracking-widest">
                Now
              </span>
              <div className="flex-1 text-sm font-light tracking-wide">
                {r.message}
                {r.agent && (
                  <span className="text-xs text-muted block mt-1">
                    from @{r.agent.handle}
                  </span>
                )}
              </div>
              <button
                onClick={() => dismiss(r._id)}
                className="text-xs text-muted hover:text-foreground"
              >
                Dismiss
              </button>
            </li>
          ))}
        </ul>
      )}
      {pending.length > 0 && (
        <ul className="flex flex-col gap-2">
          {pending.map((r) => (
            <li
              key={r._id}
              className="flex items-start gap-3 p-3 border border-border rounded"
            >
              <span className="text-xs text-muted uppercase tracking-widest">
                {new Date(r.dueAt).toLocaleString()}
              </span>
              <div className="flex-1 text-sm font-light tracking-wide">
                {r.message}
                {r.agent && (
                  <span className="text-xs text-muted block mt-1">
                    from @{r.agent.handle}
                  </span>
                )}
              </div>
              <button
                onClick={() => dismiss(r._id)}
                className="text-xs text-muted hover:text-foreground"
              >
                Dismiss
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
