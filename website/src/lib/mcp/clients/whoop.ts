import type { HealthClient, ToolDef, ToolResult } from "../types";
import { decryptJSON } from "@/lib/crypto";

type WhoopSecrets = {
  access_token: string;
  refresh_token?: string;
  expires_at: number | null;
};

const TOOLS: ToolDef[] = [
  {
    name: "whoop_get_recovery",
    description:
      "Today's WHOOP recovery score (0-100), HRV (rmssd, ms), and resting heart rate (bpm).",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "whoop_get_sleep",
    description:
      "Last night's sleep quality (0-1), total duration (hours), disturbances, and sleep debt (hours).",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "whoop_get_strain",
    description:
      "Today's accumulated strain (0-21), average and max heart rate, and energy expended (kJ).",
    input_schema: { type: "object", properties: {} },
  },
];

function mockRecovery() {
  const score = Math.round(60 + Math.random() * 25);
  return {
    score,
    hrv_rmssd_ms: 30 + Math.round(Math.random() * 25),
    resting_heart_rate_bpm: 50 + Math.round(Math.random() * 10),
    recovery_level:
      score >= 67 ? "peak" : score >= 34 ? "good" : "needs_recovery",
    source: "mock",
  };
}
function mockSleep() {
  return {
    quality_score: Number((0.6 + Math.random() * 0.3).toFixed(2)),
    total_duration_h: Number((6.5 + Math.random() * 1.8).toFixed(1)),
    disturbances: Math.floor(Math.random() * 5),
    sleep_debt_h: Number((Math.random() * 2.5).toFixed(1)),
    source: "mock",
  };
}
function mockStrain() {
  return {
    score: Number((4 + Math.random() * 14).toFixed(1)),
    average_heart_rate_bpm: Math.round(70 + Math.random() * 20),
    max_heart_rate_bpm: Math.round(110 + Math.random() * 50),
    kilojoule: Math.round(800 + Math.random() * 1500),
    source: "mock",
  };
}

const WHOOP_API_BASE = "https://api.prod.whoop.com/developer/v1";

async function fetchWhoop(token: string, endpoint: string): Promise<unknown> {
  const res = await fetch(`${WHOOP_API_BASE}${endpoint}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`whoop ${endpoint} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  return res.json();
}

export class WhoopClient implements HealthClient {
  readonly source = "whoop" as const;
  private token: string | null = null;

  constructor(
    private readonly mode: "real" | "mock",
    secretsCiphertext: string
  ) {
    if (mode === "real") {
      try {
        const s = decryptJSON<WhoopSecrets>(secretsCiphertext);
        this.token = s.access_token;
      } catch {
        this.token = null;
      }
    }
  }

  async listTools(): Promise<ToolDef[]> {
    return TOOLS;
  }

  async callTool(name: string, _args: Record<string, unknown>): Promise<ToolResult> {
    try {
      if (this.mode === "mock" || !this.token) {
        if (name === "whoop_get_recovery") return { ok: true, data: mockRecovery() };
        if (name === "whoop_get_sleep") return { ok: true, data: mockSleep() };
        if (name === "whoop_get_strain") return { ok: true, data: mockStrain() };
        return { ok: false, error: `unknown tool ${name}` };
      }

      if (name === "whoop_get_recovery") {
        const raw = (await fetchWhoop(this.token, "/cycle?limit=1")) as {
          records?: Array<{ score?: Record<string, number | boolean> }>;
        };
        const rec = raw.records?.[0]?.score ?? {};
        const score = (rec.recovery_score as number) ?? 0;
        return {
          ok: true,
          data: {
            score,
            hrv_rmssd_ms: rec.hrv_rmssd_milli ?? 0,
            resting_heart_rate_bpm: rec.resting_heart_rate ?? 0,
            recovery_level:
              score >= 67 ? "peak" : score >= 34 ? "good" : "needs_recovery",
            source: "whoop_api",
          },
        };
      }
      if (name === "whoop_get_sleep") {
        const raw = (await fetchWhoop(this.token, "/activity/sleep?limit=1")) as {
          records?: Array<{ score?: Record<string, unknown> }>;
        };
        const rec = (raw.records?.[0]?.score ?? {}) as Record<string, unknown>;
        const stage = (rec.stage_summary ?? {}) as Record<string, number>;
        return {
          ok: true,
          data: {
            quality_score:
              ((rec.sleep_performance_percentage as number) ?? 0) / 100,
            total_duration_h:
              Math.round(((stage.total_in_bed_time_milli ?? 0) / 3_600_000) * 10) / 10,
            disturbances: rec.disturbance_count ?? 0,
            source: "whoop_api",
          },
        };
      }
      if (name === "whoop_get_strain") {
        const raw = (await fetchWhoop(this.token, "/cycle?limit=1")) as {
          records?: Array<{ score?: Record<string, number> }>;
        };
        const rec = raw.records?.[0]?.score ?? {};
        return {
          ok: true,
          data: {
            score: rec.strain ?? 0,
            average_heart_rate_bpm: rec.average_heart_rate ?? 0,
            max_heart_rate_bpm: rec.max_heart_rate ?? 0,
            kilojoule: rec.kilojoule ?? 0,
            source: "whoop_api",
          },
        };
      }
      return { ok: false, error: `unknown tool ${name}` };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
