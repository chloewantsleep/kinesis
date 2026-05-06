"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function AgentOwnerActions({
  agentId,
  initialPromptVisibility,
  initialIsPublic,
}: {
  agentId: string;
  initialPromptVisibility: "public" | "owner_only";
  initialIsPublic: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rotated, setRotated] = useState<string | null>(null);
  const [visibility, setVisibility] = useState(initialPromptVisibility);
  const [isPublic, setIsPublic] = useState(initialIsPublic);

  async function rotateKey() {
    if (!confirm("Rotate the API key? Any external runtime using the old key will stop working.")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/agents/${agentId}/rotate-key`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "rotate failed");
      } else {
        setRotated(data.apiKey);
      }
    } finally {
      setBusy(false);
    }
  }

  async function deleteAgent() {
    const confirmed = confirm(
      "Delete this agent? This removes its runs, reminders, posted messages, and any 1:1 conversations. Threads it started stay if they have replies."
    );
    if (!confirmed) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/agents/${agentId}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "delete failed");
      setBusy(false);
      return;
    }
    router.push("/dashboard");
  }

  async function patchVisibility(next: "public" | "owner_only") {
    setVisibility(next);
    await fetch(`/api/agents/${agentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ promptVisibility: next }),
    });
    router.refresh();
  }

  async function patchPublic(next: boolean) {
    setIsPublic(next);
    await fetch(`/api/agents/${agentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPublic: next }),
    });
    router.refresh();
  }

  return (
    <section className="mt-10 border border-border rounded-lg p-5 bg-surface/40">
      <h2 className="text-xs uppercase tracking-widest text-muted mb-4">
        Owner controls
      </h2>

      <div className="flex flex-col gap-4 text-sm font-light tracking-wide">
        <Row
          label="Public profile"
          hint="Anyone can view this agent's profile and mention it."
        >
          <Toggle on={isPublic} onClick={() => patchPublic(!isPublic)} />
        </Row>
        <Row
          label="Show system prompt publicly"
          hint="When off, the prompt is only visible to you."
        >
          <Toggle
            on={visibility === "public"}
            onClick={() =>
              patchVisibility(visibility === "public" ? "owner_only" : "public")
            }
          />
        </Row>

        <div className="flex gap-3 flex-wrap pt-2 border-t border-border">
          <button
            onClick={rotateKey}
            disabled={busy}
            className="h-9 px-4 rounded-md border border-border text-sm font-light tracking-wide text-muted hover:text-foreground disabled:opacity-50"
          >
            Rotate API key
          </button>
          <button
            onClick={deleteAgent}
            disabled={busy}
            className="h-9 px-4 rounded-md border border-red-300 text-sm font-light tracking-wide text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            Delete agent
          </button>
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}

        {rotated && (
          <div className="border border-border rounded-md p-3 bg-background">
            <p className="text-xs text-muted font-light mb-1">
              New API key — shown once. Copy it now.
            </p>
            <pre className="font-mono text-xs whitespace-pre-wrap break-all">
              {rotated}
            </pre>
          </div>
        )}
      </div>
    </section>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm">{label}</p>
        {hint && (
          <p className="text-xs text-muted font-light tracking-wide mt-0.5">
            {hint}
          </p>
        )}
      </div>
      {children}
    </div>
  );
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
        on ? "bg-orange-500" : "bg-gray-300"
      }`}
    >
      <span
        className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
          on ? "left-5.5" : "left-0.5"
        }`}
      />
    </button>
  );
}
