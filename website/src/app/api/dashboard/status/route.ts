import { NextResponse } from "next/server";
import { connectMongo } from "@/lib/db/mongo";
import { MCPConnection } from "@/lib/db/models/MCPConnection";
import { requireUser } from "@/lib/auth/session";
import { KinesisClient } from "@/lib/mcp/clients/kinesis";

type StatusPayload = {
  posture: string;
  deviation: string;
  tension: string;
  social: string;
  scene: string;
  hrv: string;
  sleep: string;
  sources: {
    body: { available: boolean; mode: "real" | "mock"; enabled: boolean } | null;
    context:
      | { available: boolean; mode: "real" | "mock"; enabled: boolean }
      | null;
    whoop:
      | { available: boolean; mode: "real" | "mock"; enabled: boolean }
      | null;
    oura:
      | { available: boolean; mode: "real" | "mock"; enabled: boolean }
      | null;
  };
};

const SCENES = ["meeting", "deep work", "commute", "break"];

function pick<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length];
}

function mockBody(seed: number) {
  const slouching = seed % 3 !== 0;
  return {
    posture: slouching ? "slouching" : "good",
    deviation: (slouching ? 8 + (seed % 7) : 1 + (seed % 3)).toFixed(1) + "°",
    tension: (40 + (seed * 13) % 50) + "%",
  };
}

function emptySource(): null {
  return null;
}

export async function GET() {
  let user;
  try {
    user = await requireUser();
  } catch (res) {
    if (res instanceof Response) return res;
    throw res;
  }
  await connectMongo();
  const conns = await MCPConnection.find({ userId: user._id })
    .select("kind status mode enabled config")
    .lean();
  const byKind = new Map(conns.map((c) => [c.kind, c]));

  const seed = Math.floor(Date.now() / 5000);
  const mb = mockBody(seed);

  const result: StatusPayload = {
    posture: "--",
    deviation: "--",
    tension: "--",
    social: "--",
    scene: "--",
    hrv: "--",
    sleep: "--",
    sources: {
      body: emptySource(),
      context: emptySource(),
      whoop: emptySource(),
      oura: emptySource(),
    },
  };

  // Body — kinesis agent
  const kin = byKind.get("kinesis");
  if (kin) {
    result.sources.body = {
      available: kin.status === "connected",
      mode: kin.mode,
      enabled: kin.enabled !== false,
    };
    if (kin.status === "connected" && kin.enabled !== false) {
      if (kin.mode === "mock") {
        result.posture = mb.posture;
        result.deviation = mb.deviation;
        result.tension = mb.tension;
      } else {
        try {
          const deviceUrl =
            (kin.config as { deviceUrl?: string })?.deviceUrl ??
            "http://localhost:8081";
          const client = new KinesisClient("real", deviceUrl);
          const r = await client.callTool("kinesis_get_posture", {});
          await client.close();
          if (r.ok && r.data && typeof r.data === "object") {
            const d = r.data as Record<string, unknown>;
            const upper = d.upper_back as
              | { tilt_deg?: number; slouch_score?: number }
              | undefined;
            const tens = d.tension as Record<string, number> | undefined;
            if (upper?.slouch_score !== undefined)
              result.posture = upper.slouch_score > 0.4 ? "slouching" : "good";
            if (upper?.tilt_deg !== undefined)
              result.deviation = Math.abs(upper.tilt_deg).toFixed(1) + "°";
            if (tens) {
              const vals = Object.values(tens);
              if (vals.length) {
                const avg = (vals.reduce((a, b) => a + b, 0) / vals.length) * 100;
                result.tension = avg.toFixed(0) + "%";
              }
            }
          }
        } catch {
          result.posture = mb.posture;
          result.deviation = mb.deviation;
          result.tension = mb.tension;
        }
      }
    }
  }

  // Context — glasses agent
  const glasses = byKind.get("glasses");
  if (glasses) {
    result.sources.context = {
      available: glasses.status === "connected",
      mode: glasses.mode,
      enabled: glasses.enabled !== false,
    };
    if (glasses.status === "connected" && glasses.enabled !== false) {
      // Real glasses client not yet implemented; mock for both modes.
      result.scene = pick(SCENES, seed);
      result.social = seed % 2 === 0 ? "yes" : "no";
    }
  }

  // Whoop
  const whoop = byKind.get("whoop");
  if (whoop) {
    result.sources.whoop = {
      available: whoop.status === "connected",
      mode: whoop.mode,
      enabled: whoop.enabled !== false,
    };
    if (whoop.status === "connected" && whoop.enabled !== false) {
      result.hrv = whoop.mode === "mock" ? `${42 + (seed % 18)} ms` : "live";
      result.sleep = whoop.mode === "mock" ? `${6 + (seed % 3)}h` : "live";
    }
  }

  // Oura
  const oura = byKind.get("oura");
  if (oura) {
    result.sources.oura = {
      available: oura.status === "connected",
      mode: oura.mode,
      enabled: oura.enabled !== false,
    };
  }

  return NextResponse.json({ status: result });
}
