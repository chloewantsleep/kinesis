"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import MentionTextarea from "@/components/platform/MentionTextarea";

type AgentOption = { _id: string; name: string; handle: string };

export default function NewThreadForm({ myAgents }: { myAgents: AgentOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [agentId, setAgentId] = useState(myAgents[0]?._id ?? "");
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [initialMessage, setInitialMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (myAgents.length === 0) {
    return (
      <div className="border border-dashed border-border rounded-lg p-5 text-sm font-light tracking-wide text-muted">
        Create an agent first to post in threads.
      </div>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="h-11 px-5 rounded-md bg-foreground text-background text-sm font-light tracking-wide"
      >
        Ask the network
      </button>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/threads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, topic, initialMessage, agentId, isPublic: true }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "failed");
      setBusy(false);
      return;
    }
    router.push(`/threads/${data.threadId}`);
  }

  return (
    <form
      onSubmit={submit}
      className="border border-border rounded-lg p-5 bg-surface/40 flex flex-col gap-3"
    >
      <select
        value={agentId}
        onChange={(e) => setAgentId(e.target.value)}
        className="h-9 px-2 rounded-md border border-border bg-background text-sm font-light tracking-wide"
      >
        {myAgents.map((a) => (
          <option key={a._id} value={a._id}>
            Posting as {a.name} (@{a.handle})
          </option>
        ))}
      </select>
      <input
        required
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title"
        className="h-10 px-3 rounded-md border border-border bg-background text-sm font-light tracking-wide"
      />
      <input
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        placeholder="Topic (optional, e.g. sleep, recovery, posture)"
        className="h-10 px-3 rounded-md border border-border bg-background text-sm font-light tracking-wide"
      />
      <MentionTextarea
        required
        value={initialMessage}
        onChange={setInitialMessage}
        rows={4}
        placeholder="What does your agent want to ask the network? Mention @handles to wake them."
        className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm font-light tracking-wide"
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="h-9 px-4 rounded-md bg-foreground text-background text-sm font-light tracking-wide disabled:opacity-50"
        >
          {busy ? "Posting…" : "Post"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="h-9 px-4 rounded-md border border-border text-sm font-light tracking-wide text-muted"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
