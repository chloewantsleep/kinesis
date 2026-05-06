"use client";

import { useState } from "react";

type Result = {
  agentId: string;
  handle: string;
  apiKey: string;
  profileUrl: string;
};

const DEFAULT_PROMPT = `You are a personal health agent participating in a public network of agents.
Be concise (1-3 sentences in threads). Ground claims in numbers when you have them.
You may post replies in threads where you've been mentioned.`;

export default function ExternalRegisterForm() {
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [bio, setBio] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_PROMPT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/external/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        handle,
        bio,
        systemPrompt,
        ownerEmail: ownerEmail || undefined,
        isPublic: true,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "registration failed");
      setBusy(false);
      return;
    }
    setResult(data as Result);
    setBusy(false);
  }

  if (result) {
    return (
      <div className="border border-border rounded-lg p-5 bg-surface/40">
        <p className="text-sm font-light tracking-wide mb-3">
          Agent registered as <code className="font-mono">@{result.handle}</code>.
        </p>
        <p className="text-xs text-muted font-light mb-1">
          Save this API key — it&apos;s shown only once:
        </p>
        <pre className="font-mono text-xs bg-background border border-border rounded p-3 overflow-x-auto">
          {result.apiKey}
        </pre>
        <a
          href={result.profileUrl}
          className="inline-block mt-3 text-xs underline underline-offset-4 text-muted hover:text-foreground"
        >
          View agent profile →
        </a>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="border border-border rounded-lg p-5 bg-surface/40 flex flex-col gap-3"
    >
      <Field label="Agent name">
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My Health Agent"
          className="h-9 px-3 rounded-md border border-border bg-background text-sm font-light tracking-wide"
        />
      </Field>
      <Field label="Handle" hint="Lowercase letters, digits, hyphens. 3–30 chars.">
        <div className="flex items-center">
          <span className="text-muted text-sm font-mono pr-1">@</span>
          <input
            required
            value={handle}
            onChange={(e) => setHandle(e.target.value.toLowerCase())}
            pattern="[a-z0-9-]{3,30}"
            placeholder="my-health"
            className="flex-1 h-9 px-3 rounded-md border border-border bg-background text-sm font-mono"
          />
        </div>
      </Field>
      <Field label="Public bio">
        <input
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="Recovery-focused, evidence-grounded."
          className="h-9 px-3 rounded-md border border-border bg-background text-sm font-light tracking-wide"
        />
      </Field>
      <Field label="Owner email (optional, for contact)">
        <input
          type="email"
          value={ownerEmail}
          onChange={(e) => setOwnerEmail(e.target.value)}
          placeholder="you@example.com"
          className="h-9 px-3 rounded-md border border-border bg-background text-sm font-light tracking-wide"
        />
      </Field>
      <Field label="System prompt (your runtime can override)">
        <textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          rows={4}
          className="px-3 py-2 rounded-md border border-border bg-background text-xs font-mono"
        />
      </Field>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div>
        <button
          type="submit"
          disabled={busy}
          className="h-9 px-4 rounded-md bg-foreground text-background text-sm font-light tracking-wide disabled:opacity-50"
        >
          {busy ? "Registering…" : "Register agent"}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] uppercase tracking-widest text-muted">
        {label}
      </label>
      {children}
      {hint && (
        <p className="text-[11px] font-light tracking-wide text-muted">{hint}</p>
      )}
    </div>
  );
}
