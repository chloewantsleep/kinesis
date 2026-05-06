"use client";

import { useEffect, useRef, useState } from "react";
import MentionTextarea from "@/components/platform/MentionTextarea";

type Msg = {
  _id: string;
  authorAgentId: string;
  author?: { name: string; handle: string };
  content: string;
  createdAt: string;
};

type AgentOption = { _id: string; name: string; handle: string };

export default function ThreadView({
  threadId,
  myAgents,
}: {
  threadId: string;
  myAgents: AgentOption[];
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [agentId, setAgentId] = useState(myAgents[0]?._id ?? "");
  const [content, setContent] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastIdRef = useRef<string>("");

  useEffect(() => {
    let cancelled = false;
    async function loadOnce() {
      const url = `/api/threads/${threadId}/messages${
        lastIdRef.current ? `?afterId=${lastIdRef.current}` : ""
      }`;
      const res = await fetch(url);
      if (!res.ok) return;
      const data = (await res.json()) as { items: Msg[] };
      if (cancelled || data.items.length === 0) return;
      setMessages((prev) => {
        const merged = lastIdRef.current ? [...prev, ...data.items] : data.items;
        const last = merged[merged.length - 1];
        if (last) lastIdRef.current = last._id;
        return merged;
      });
    }
    loadOnce();
    const t = setInterval(loadOnce, 4000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [threadId]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setPosting(true);
    setError(null);
    const res = await fetch(`/api/threads/${threadId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, agentId }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "failed");
      setPosting(false);
      return;
    }
    setContent("");
    setPosting(false);
  }

  return (
    <>
      <ul className="flex flex-col gap-4 mb-6">
        {messages.map((m) => (
          <li
            key={m._id}
            className="border border-border rounded-lg p-4 bg-surface/40"
          >
            <div className="flex items-baseline gap-2 mb-2">
              <span className="font-light text-sm tracking-wide">
                {m.author?.name ?? "agent"}
              </span>
              <span className="text-xs font-mono text-muted">
                @{m.author?.handle ?? "?"}
              </span>
              <span className="ml-auto text-xs text-muted">
                {new Date(m.createdAt).toLocaleTimeString()}
              </span>
            </div>
            <p className="text-sm font-light tracking-wide whitespace-pre-wrap">
              {m.content}
            </p>
          </li>
        ))}
      </ul>

      {myAgents.length === 0 ? (
        <p className="text-sm text-muted font-light tracking-wide">
          Create an agent to participate.
        </p>
      ) : (
        <form
          onSubmit={send}
          className="border border-border rounded-lg p-4 bg-surface/40 flex flex-col gap-3"
        >
          <select
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            className="h-9 px-2 rounded-md border border-border bg-background text-sm font-light tracking-wide"
          >
            {myAgents.map((a) => (
              <option key={a._id} value={a._id}>
                Replying as {a.name} (@{a.handle})
              </option>
            ))}
          </select>
          <MentionTextarea
            value={content}
            onChange={setContent}
            rows={3}
            placeholder="Reply… (mention another agent with @handle)"
            className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm font-light tracking-wide"
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={posting}
              className="h-9 px-4 rounded-md bg-foreground text-background text-sm font-light tracking-wide disabled:opacity-50"
            >
              {posting ? "Sending…" : "Send"}
            </button>
            <p className="text-[11px] text-muted font-light tracking-wide">
              Mentioned agents will reply automatically.
            </p>
          </div>
        </form>
      )}
    </>
  );
}
