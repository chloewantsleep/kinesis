"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Score = {
  value: number;
  label: string;
  band: "great" | "good" | "fair" | "low";
};

type SourceBadge = "whoop" | "oura" | "kinesis" | "glasses" | "agent";

type MetricRow = {
  label: string;
  value: string;
  source?: SourceBadge;
  hint?: string;
};

type Card = {
  key:
    | "recovery"
    | "sleep"
    | "posture"
    | "movement"
    | "wlb"
    | "stress"
    | "readiness";
  title: string;
  score: Score | null;
  rows: MetricRow[];
  available: boolean;
  mode?: "real" | "mock";
};

type Reminder = {
  _id: string;
  message: string;
  dueAt: string;
  status: "pending" | "fired" | "dismissed";
};

type Insight = {
  _id: string;
  title: string;
  body: string;
  sourceHandle: string;
  kind: "pattern" | "intervention" | "collective" | "alert";
};

type Summary = {
  agent: { name: string; handle: string; bio: string } | null;
  message: string;
  messageAt: string | null;
  cards: Card[];
  reminders: Reminder[];
  insights: Insight[];
  connectedKinds: string[];
};

const BRAND_ORANGE = "#f59235"; // matches toggle / accents across the app
const BRAND_BLUE = "#2f80ff"; // matches agent labels in System Log

const BAND_COLORS: Record<
  Score["band"],
  { stroke: string; text: string }
> = {
  great: { stroke: BRAND_ORANGE, text: "text-orange-500" },
  good: { stroke: BRAND_ORANGE, text: "text-orange-500" },
  fair: { stroke: "#f5a96a", text: "text-orange-400" },
  low: { stroke: "#cbd5e1", text: "text-slate-400" },
};

export default function HomeView({ firstName }: { firstName: string }) {
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/home/summary");
        if (res.ok && !cancelled) {
          setData(await res.json());
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    const t = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  if (loading && !data) {
    return (
      <div className="min-h-[400px] flex items-center justify-center text-muted font-light">
        Loading your day…
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-[400px] flex items-center justify-center text-muted font-light">
        Couldn&apos;t load your home view. Try refreshing.
      </div>
    );
  }

  const greeting = greetingFor(new Date(), firstName);
  const todayCard = data.cards.find((c) => c.key === "readiness" && c.score);
  const otherCards = data.cards.filter((c) => c !== todayCard);
  const firedReminders = data.reminders.filter((r) => r.status === "fired");
  const pendingReminders = data.reminders.filter((r) => r.status === "pending");

  return (
    <div className="flex flex-col gap-8">
      {/* Greeting + agent message */}
      <section>
        <h1 className="text-4xl md:text-5xl font-extralight tracking-normal">
          {greeting}
        </h1>
        {data.agent ? (
          <p className="text-sm text-muted font-light tracking-wide mt-2">
            <span
              className="font-mono"
              style={{ color: BRAND_BLUE }}
            >
              @{data.agent.handle}
            </span>{" "}
            is watching your day.
          </p>
        ) : (
          <p className="text-sm text-muted font-light tracking-wide mt-2">
            <Link
              href="/agents/new"
              className="underline underline-offset-4"
              style={{ color: BRAND_BLUE }}
            >
              Create your health agent
            </Link>{" "}
            to start tracking your day.
          </p>
        )}
      </section>

      {/* Hero — Today score + agent narrative */}
      {(todayCard || data.message) && (
        <section
          className="rounded-2xl border p-6 md:p-8 flex flex-col md:flex-row gap-8 items-start"
          style={{
            borderColor: "#fde7d4",
            background:
              "linear-gradient(135deg, rgba(245,146,53,0.08) 0%, rgba(47,128,255,0.04) 100%)",
          }}
        >
          {todayCard && (
            <ScoreRing score={todayCard.score!} size={140} stroke={10} />
          )}
          <div className="flex-1 min-w-0">
            {todayCard && (
              <p className="text-xs uppercase tracking-widest text-muted mb-1">
                Today
              </p>
            )}
            {todayCard && (
              <h2 className="text-2xl font-light tracking-wide mb-3">
                {scoreHeadline(todayCard.score!)}
              </h2>
            )}
            {data.message ? (
              <p className="text-sm font-light leading-relaxed text-foreground/85 whitespace-pre-wrap line-clamp-6">
                {stripMdHeadings(data.message)}
              </p>
            ) : (
              <p className="text-sm font-light text-muted">
                Your agent hasn&apos;t weighed in yet. Connect a data source and
                give it a moment.
              </p>
            )}
            {data.messageAt && (
              <p className="mt-3 text-[11px] uppercase tracking-widest text-muted">
                from {timeAgo(data.messageAt)}
              </p>
            )}
          </div>
        </section>
      )}

      {/* Reminders / Nudges */}
      {(firedReminders.length > 0 || pendingReminders.length > 0) && (
        <section>
          <h2 className="text-xs uppercase tracking-widest text-muted mb-3">
            Nudges
          </h2>
          <ul className="flex flex-col gap-2">
            {firedReminders.map((r) => (
              <li
                key={r._id}
                className="flex items-start gap-3 p-4 rounded-lg border"
                style={{
                  borderColor: "#fcd9b5",
                  background: "rgba(245,146,53,0.06)",
                }}
              >
                <span
                  className="mt-1 w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: BRAND_ORANGE }}
                />
                <div className="flex-1">
                  <p className="text-sm font-light tracking-wide">
                    {r.message}
                  </p>
                  <p
                    className="text-[11px] uppercase tracking-widest mt-1"
                    style={{ color: BRAND_ORANGE }}
                  >
                    Now
                  </p>
                </div>
              </li>
            ))}
            {pendingReminders.slice(0, 3).map((r) => (
              <li
                key={r._id}
                className="flex items-start gap-3 p-4 rounded-lg border border-border/60"
              >
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-muted shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-light tracking-wide">
                    {r.message}
                  </p>
                  <p className="text-[11px] uppercase tracking-widest text-muted mt-1">
                    {new Date(r.dueAt).toLocaleString()}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Score cards */}
      <section>
        <h2 className="text-xs uppercase tracking-widest text-muted mb-3">
          Vitals
        </h2>
        {otherCards.every((c) => !c.available) ? (
          <div className="border border-dashed border-border rounded-lg p-8 text-center">
            <p className="font-light tracking-wide text-muted mb-3">
              No data sources connected yet.
            </p>
            <Link
              href="/connections"
              className="text-sm underline underline-offset-4"
              style={{ color: BRAND_BLUE }}
            >
              Connect Whoop, Oura, or your Kinesis device
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {otherCards.map((c) => (
              <ScoreCard key={c.key} card={c} />
            ))}
          </div>
        )}
      </section>

      {/* Insights from peer network */}
      {data.insights.length > 0 && (
        <section>
          <h2 className="text-xs uppercase tracking-widest text-muted mb-3">
            Patterns your agent is following
          </h2>
          <ul className="flex flex-col gap-3">
            {data.insights.map((i) => (
              <li
                key={i._id}
                className="rounded-lg border border-border/60 p-4 bg-surface/30"
              >
                <div className="flex items-baseline gap-2 mb-1">
                  <span
                    className="text-[10px] uppercase tracking-widest"
                    style={{
                      color:
                        i.kind === "alert" || i.kind === "intervention"
                          ? BRAND_ORANGE
                          : undefined,
                    }}
                  >
                    {i.kind}
                  </span>
                  <span
                    className="text-[10px] font-mono"
                    style={{ color: BRAND_BLUE }}
                  >
                    @{i.sourceHandle}
                  </span>
                </div>
                <p className="font-light tracking-wide">{i.title}</p>
                {i.body && (
                  <p className="text-sm text-muted font-light mt-1 line-clamp-2">
                    {i.body}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function ScoreCard({ card }: { card: Card }) {
  if (!card.available || !card.score) {
    return (
      <div className="rounded-xl border border-border/60 bg-surface/30 p-5 min-h-[180px] flex flex-col">
        <p className="text-xs uppercase tracking-widest text-muted">
          {card.title}
        </p>
        <div className="flex-1 flex items-center justify-center">
          <Link
            href="/connections"
            className="text-xs underline underline-offset-4"
            style={{ color: BRAND_BLUE }}
          >
            connect a source
          </Link>
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-border/60 bg-white p-5 flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <p className="text-xs uppercase tracking-widest text-muted">
          {card.title}
        </p>
        {card.mode === "mock" && (
          <span className="text-[9px] uppercase tracking-widest text-muted px-1.5 py-0.5 rounded bg-surface border border-border">
            mock
          </span>
        )}
      </div>
      <div className="flex items-end gap-3">
        <ScoreRing score={card.score} size={84} stroke={7} />
        <div>
          <p className={`text-xs font-light ${BAND_COLORS[card.score.band].text}`}>
            {card.score.label}
          </p>
        </div>
      </div>
      <ul className="text-xs font-light tracking-wide text-foreground/85 flex flex-col gap-1 mt-1">
        {card.rows.map((r, i) => (
          <li key={i} className="flex justify-between">
            <span className="text-muted">{r.label}</span>
            <span>{r.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ScoreRing({
  score,
  size,
  stroke,
}: {
  score: Score;
  size: number;
  stroke: number;
}) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (Math.max(0, Math.min(100, score.value)) / 100) * circ;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={BAND_COLORS[score.band].stroke}
          strokeWidth={stroke}
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span
          className="font-extralight tabular-nums tracking-tight"
          style={{ fontSize: Math.round(size * 0.32) }}
        >
          {score.value}
        </span>
      </div>
    </div>
  );
}

function greetingFor(now: Date, name: string): string {
  const h = now.getHours();
  const part =
    h < 5 ? "Late night" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  return name ? `${part}, ${name}` : `${part}`;
}

function scoreHeadline(s: Score): string {
  if (s.band === "great") return "You're in a great spot.";
  if (s.band === "good") return "Solid baseline today.";
  if (s.band === "fair") return "Take it a little easier.";
  return "Recovery first today.";
}

function stripMdHeadings(s: string): string {
  return s.replace(/^\s*#{1,6}\s+/gm, "");
}

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(ts).toLocaleDateString();
}
