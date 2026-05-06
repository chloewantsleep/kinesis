import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { HealthClient, ToolDef, ToolResult } from "../types";

type KinesisToolList = {
  tools: Array<{
    name: string;
    description?: string;
    inputSchema?: {
      type: "object";
      properties?: Record<string, unknown>;
      required?: string[];
    };
  }>;
};

type KinesisCallToolResult = {
  content?: Array<{ type: string; text?: string }>;
  isError?: boolean;
};

const MOCK_TOOLS: ToolDef[] = [
  {
    name: "kinesis_get_posture",
    description:
      "Mock current posture state from a Kinesis device (no real device connected).",
    input_schema: { type: "object", properties: {} },
  },
];

function mockPosture() {
  return {
    upper_back: { tilt_deg: -3 + Math.random() * 6, slouch_score: Math.random() * 0.4 },
    lower_back: { tilt_deg: -2 + Math.random() * 4 },
    tension: { rhomboid_l: Math.random(), rhomboid_r: Math.random() },
    in_bad_posture_for_s: Math.floor(Math.random() * 60),
    source: "mock",
  };
}

export class KinesisClient implements HealthClient {
  readonly source = "kinesis" as const;
  private client: Client | null = null;
  private tools: ToolDef[] | null = null;

  constructor(
    private readonly mode: "real" | "mock",
    private readonly deviceUrl: string
  ) {}

  private async ensureConnected(): Promise<Client> {
    if (this.client) return this.client;
    const url = new URL(this.deviceUrl.replace(/\/$/, "") + "/mcp");
    const transport = new StreamableHTTPClientTransport(url);
    const client = new Client(
      { name: "kinesis-platform-runtime", version: "0.1.0" },
      { capabilities: {} }
    );
    await client.connect(transport);
    this.client = client;
    return client;
  }

  async listTools(): Promise<ToolDef[]> {
    if (this.tools) return this.tools;
    if (this.mode === "mock") {
      this.tools = MOCK_TOOLS;
      return this.tools;
    }
    try {
      const client = await this.ensureConnected();
      const list = (await client.listTools()) as unknown as KinesisToolList;
      this.tools = (list.tools ?? []).map((t) => ({
        name: `kinesis_${t.name}`,
        description: t.description ?? "",
        input_schema: t.inputSchema ?? { type: "object", properties: {} },
      }));
      return this.tools;
    } catch {
      this.tools = MOCK_TOOLS;
      return this.tools;
    }
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      if (this.mode === "mock") {
        if (name === "kinesis_get_posture") return { ok: true, data: mockPosture() };
        return { ok: false, error: `unknown mock tool ${name}` };
      }
      const client = await this.ensureConnected();
      const remoteName = name.startsWith("kinesis_") ? name.slice("kinesis_".length) : name;
      const result = (await client.callTool({
        name: remoteName,
        arguments: args,
      })) as unknown as KinesisCallToolResult;
      const text = result.content?.find((c) => c.type === "text")?.text ?? "";
      let parsed: unknown = text;
      try {
        parsed = JSON.parse(text);
      } catch {
        // leave as text
      }
      return result.isError
        ? { ok: false, error: typeof parsed === "string" ? parsed : JSON.stringify(parsed) }
        : { ok: true, data: parsed };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async close(): Promise<void> {
    if (this.client) {
      try {
        await this.client.close();
      } catch {
        // ignore
      }
      this.client = null;
    }
  }
}
