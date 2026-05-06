import type { HealthClient, ToolDef, ToolResult } from "../types";
import { decryptJSON } from "@/lib/crypto";

type OuraSecrets = {
  access_token: string;
  refresh_token?: string;
  expires_at: number | null;
};

const TOOLS: ToolDef[] = [
  {
    name: "oura_get_sleep",
    description:
      "Last night's Oura sleep details: total sleep, REM, deep, efficiency, and sleep score (0-100).",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "oura_get_readiness",
    description:
      "Today's Oura readiness score (0-100) and contributing factors (HRV balance, resting HR, recovery, sleep balance).",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "oura_get_activity",
    description:
      "Today's Oura activity score (0-100), steps, total calories burned.",
    input_schema: { type: "object", properties: {} },
  },
];

function mockSleep() {
  return {
    score: 70 + Math.floor(Math.random() * 25),
    total_sleep_h: Number((6.0 + Math.random() * 2).toFixed(1)),
    rem_sleep_h: Number((1 + Math.random() * 0.6).toFixed(2)),
    deep_sleep_h: Number((0.8 + Math.random() * 0.5).toFixed(2)),
    efficiency_pct: 80 + Math.floor(Math.random() * 18),
    source: "mock",
  };
}
function mockReadiness() {
  return {
    score: 60 + Math.floor(Math.random() * 35),
    contributors: {
      hrv_balance: 70 + Math.floor(Math.random() * 25),
      resting_heart_rate: 70 + Math.floor(Math.random() * 25),
      recovery_index: 70 + Math.floor(Math.random() * 25),
      sleep_balance: 70 + Math.floor(Math.random() * 25),
    },
    source: "mock",
  };
}
function mockActivity() {
  return {
    score: 60 + Math.floor(Math.random() * 35),
    steps: 4000 + Math.floor(Math.random() * 8000),
    total_calories: 1800 + Math.floor(Math.random() * 1200),
    source: "mock",
  };
}

const OURA_API_BASE = "https://api.ouraring.com/v2/usercollection";

async function fetchOura(token: string, path: string): Promise<unknown> {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 24 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);
  const url = `${OURA_API_BASE}${path}?start_date=${yesterday}&end_date=${today}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`oura ${path} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  return res.json();
}

export class OuraClient implements HealthClient {
  readonly source = "oura" as const;
  private token: string | null = null;

  constructor(
    private readonly mode: "real" | "mock",
    secretsCiphertext: string
  ) {
    if (mode === "real") {
      try {
        const s = decryptJSON<OuraSecrets>(secretsCiphertext);
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
        if (name === "oura_get_sleep") return { ok: true, data: mockSleep() };
        if (name === "oura_get_readiness") return { ok: true, data: mockReadiness() };
        if (name === "oura_get_activity") return { ok: true, data: mockActivity() };
        return { ok: false, error: `unknown tool ${name}` };
      }

      if (name === "oura_get_sleep") {
        const raw = (await fetchOura(this.token, "/daily_sleep")) as {
          data?: Array<{ score?: number; contributors?: Record<string, number> }>;
        };
        const last = raw.data?.[raw.data.length - 1];
        return { ok: true, data: { ...last, source: "oura_api" } };
      }
      if (name === "oura_get_readiness") {
        const raw = (await fetchOura(this.token, "/daily_readiness")) as {
          data?: Array<{ score?: number; contributors?: Record<string, number> }>;
        };
        const last = raw.data?.[raw.data.length - 1];
        return { ok: true, data: { ...last, source: "oura_api" } };
      }
      if (name === "oura_get_activity") {
        const raw = (await fetchOura(this.token, "/daily_activity")) as {
          data?: Array<{
            score?: number;
            steps?: number;
            total_calories?: number;
          }>;
        };
        const last = raw.data?.[raw.data.length - 1];
        return { ok: true, data: { ...last, source: "oura_api" } };
      }
      return { ok: false, error: `unknown tool ${name}` };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
