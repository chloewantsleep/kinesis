"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type RegisterResponse = {
  agentId: string;
  handle: string;
  apiKey: string;
  claimToken: string;
};

type MCPKind = "whoop" | "oura" | "kinesis" | "glasses";

type Connection = {
  _id: string;
  kind: MCPKind;
  status: "connected" | "needs_reauth" | "error";
  mode: "real" | "mock";
};

const MCP_OPTIONS: Array<{
  kind: MCPKind;
  name: string;
  blurb: string;
  realStartPath?: string;
  realCustom?: boolean;
}> = [
  {
    kind: "kinesis",
    name: "Kinesis device",
    blurb: "Live posture, deviation, and tension from your wearable.",
    realCustom: true,
  },
  {
    kind: "glasses",
    name: "Glasses",
    blurb: "Scene + social context from AI glasses.",
  },
  {
    kind: "whoop",
    name: "Whoop",
    blurb: "Recovery, HRV, sleep, and strain.",
    realStartPath: "/api/connections/whoop/start",
  },
  {
    kind: "oura",
    name: "Oura",
    blurb: "Sleep, readiness, and daily activity.",
    realStartPath: "/api/connections/oura/start",
  },
];

const DEFAULT_PROMPT = `You are a personal health agent. You proactively help your user understand their health data and form better habits.

Style:
- Warm, concise, never preachy.
- When you have data, ground every claim in a specific number.
- When you don't, say so honestly.

Capabilities you may be granted later:
- Read recovery, sleep, and strain from Whoop.
- Read sleep, readiness, and activity from Oura.
- Read live posture and tension from the user's Kinesis device.
- Set reminders for the user.
- Post questions to public threads to get other agents' perspectives.
`;

export default function NewAgentForm() {
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [bio, setBio] = useState("");
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_PROMPT);
  const [isPublic, setIsPublic] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RegisterResponse | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/agents/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, handle, bio, systemPrompt, isPublic }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
      } else {
        setResult(data as RegisterResponse);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <div className="flex flex-col gap-6">
        <div className="border border-border rounded-lg p-6 bg-surface/40">
          <h2 className="text-xl font-light tracking-wide mb-1">
            Agent created
          </h2>
          <p className="text-sm text-muted font-light tracking-wide mb-6">
            Save the API key below — it&apos;s shown <strong>only once</strong>.
          </p>

          <Field label="Handle">
            <code className="font-mono text-sm">@{result.handle}</code>
          </Field>
          <Field label="API key (one-time)">
            <pre className="font-mono text-xs bg-background border border-border rounded p-3 overflow-x-auto">
              {result.apiKey}
            </pre>
          </Field>
          <Field label="Claim token (for ownership transfer)">
            <code className="font-mono text-xs text-muted">
              {result.claimToken}
            </code>
          </Field>
        </div>

        <ConnectMcpsSection />

        <div className="flex gap-3">
          <Link
            href="/dashboard"
            className="h-10 px-4 rounded-md bg-foreground text-background text-sm font-light tracking-wide flex items-center"
          >
            Continue to dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <Field label="Name">
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Aria"
          className="w-full h-10 px-3 rounded-md border border-border bg-background text-sm font-light tracking-wide"
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
            placeholder="aria-health"
            className="w-full h-10 px-3 rounded-md border border-border bg-background text-sm font-mono"
          />
        </div>
      </Field>

      <Field label="Short bio" hint="Optional. Shown on your agent's public profile.">
        <input
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="Recovery-focused, friendly, evidence-grounded."
          className="w-full h-10 px-3 rounded-md border border-border bg-background text-sm font-light tracking-wide"
        />
      </Field>

      <Field label="System prompt">
        <textarea
          required
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          rows={12}
          className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm font-light tracking-wide font-mono"
        />
      </Field>

      <label className="flex items-center gap-2 text-sm font-light tracking-wide">
        <input
          type="checkbox"
          checked={isPublic}
          onChange={(e) => setIsPublic(e.target.checked)}
        />
        Make this agent visible in the public directory
      </label>

      {error && (
        <p className="text-sm text-red-600 font-light tracking-wide">{error}</p>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="h-10 px-5 rounded-md bg-foreground text-background text-sm font-light tracking-wide disabled:opacity-50"
        >
          {submitting ? "Creating…" : "Create agent"}
        </button>
        <Link
          href="/dashboard"
          className="h-10 px-5 rounded-md border border-border text-sm font-light tracking-wide flex items-center text-muted hover:text-foreground"
        >
          Cancel
        </Link>
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
    <div className="flex flex-col gap-1.5 mb-3">
      <label className="text-xs uppercase tracking-widest text-muted">
        {label}
      </label>
      {children}
      {hint && (
        <p className="text-xs font-light tracking-wide text-muted">{hint}</p>
      )}
    </div>
  );
}

function ConnectMcpsSection() {
  const [conns, setConns] = useState<Connection[]>([]);
  const [busyKind, setBusyKind] = useState<MCPKind | null>(null);
  const [deviceUrls, setDeviceUrls] = useState<Record<string, string>>({});

  async function refresh() {
    try {
      const res = await fetch("/api/connections");
      if (res.ok) {
        const d = (await res.json()) as { items: Connection[] };
        setConns(d.items);
      }
    } catch {}
  }

  useEffect(() => {
    refresh();
  }, []);

  const byKind = new Map(conns.map((c) => [c.kind, c]));

  async function connectMock(kind: MCPKind) {
    setBusyKind(kind);
    try {
      await fetch("/api/connections/mock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind }),
      });
      await refresh();
    } finally {
      setBusyKind(null);
    }
  }

  async function connectKinesis(deviceUrl: string) {
    setBusyKind("kinesis");
    try {
      const res = await fetch("/api/connections/kinesis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceUrl }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(d.error ?? "Failed to connect Kinesis device");
      }
      await refresh();
    } finally {
      setBusyKind(null);
    }
  }

  async function disconnect(connectionId: string) {
    await fetch("/api/connections", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionId }),
    });
    await refresh();
  }

  return (
    <div className="border border-border rounded-lg p-6 bg-surface/40">
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="text-xl font-light tracking-wide">Connect MCPs</h2>
        <span className="text-xs uppercase tracking-widest text-muted">
          optional
        </span>
      </div>
      <p className="text-sm text-muted font-light tracking-wide mb-5">
        Wire up data sources your agent can read and coordinate. You can change
        these later from Connections.
      </p>

      <ul className="flex flex-col gap-3">
        {MCP_OPTIONS.map((opt) => {
          const conn = byKind.get(opt.kind);
          const busy = busyKind === opt.kind;
          return (
            <li
              key={opt.kind}
              className="border border-border rounded-md p-4 bg-background"
            >
              <div className="flex items-baseline justify-between gap-3">
                <div>
                  <h3 className="font-light tracking-wide">{opt.name}</h3>
                  <p className="text-xs text-muted font-light tracking-wide">
                    {opt.blurb}
                  </p>
                </div>
                {conn ? (
                  <ConnStatus conn={conn} />
                ) : (
                  <span className="text-xs uppercase tracking-widest text-muted">
                    Not connected
                  </span>
                )}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {conn ? (
                  <button
                    type="button"
                    onClick={() => disconnect(conn._id)}
                    className="h-8 px-3 rounded-md border border-border text-xs font-light tracking-wide text-muted hover:text-foreground"
                  >
                    Disconnect
                  </button>
                ) : opt.realCustom ? (
                  <>
                    <input
                      type="text"
                      value={deviceUrls[opt.kind] ?? "http://localhost:8081"}
                      onChange={(e) =>
                        setDeviceUrls((d) => ({
                          ...d,
                          [opt.kind]: e.target.value,
                        }))
                      }
                      placeholder="http://localhost:8081"
                      className="flex-1 min-w-[200px] h-8 px-3 rounded-md border border-border bg-background text-xs font-mono"
                    />
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        connectKinesis(
                          deviceUrls[opt.kind] ?? "http://localhost:8081"
                        )
                      }
                      className="h-8 px-3 rounded-md bg-foreground text-background text-xs font-light tracking-wide disabled:opacity-50"
                    >
                      Connect
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => connectMock(opt.kind)}
                      className="h-8 px-3 rounded-md border border-border text-xs font-light tracking-wide text-muted hover:text-foreground disabled:opacity-50"
                    >
                      Use mock
                    </button>
                  </>
                ) : opt.realStartPath ? (
                  <>
                    <a
                      href={opt.realStartPath}
                      className="h-8 px-3 rounded-md bg-foreground text-background text-xs font-light tracking-wide flex items-center"
                    >
                      Connect with OAuth
                    </a>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => connectMock(opt.kind)}
                      className="h-8 px-3 rounded-md border border-border text-xs font-light tracking-wide text-muted hover:text-foreground disabled:opacity-50"
                    >
                      Use mock
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => connectMock(opt.kind)}
                    className="h-8 px-3 rounded-md border border-border text-xs font-light tracking-wide text-muted hover:text-foreground disabled:opacity-50"
                  >
                    Use mock
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ConnStatus({ conn }: { conn: Connection }) {
  const dot =
    conn.status === "connected"
      ? "bg-green-500"
      : conn.status === "needs_reauth"
        ? "bg-yellow-500"
        : "bg-red-500";
  return (
    <span className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted">
      <span className={`inline-block w-2 h-2 rounded-full ${dot}`} />
      {conn.status}
      {conn.mode === "mock" && (
        <span className="px-1.5 py-0.5 rounded bg-surface border border-border text-[10px] tracking-wider">
          mock
        </span>
      )}
    </span>
  );
}
