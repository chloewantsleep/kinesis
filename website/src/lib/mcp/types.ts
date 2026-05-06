export type ToolDef = {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties?: Record<string, unknown>;
    required?: string[];
  };
};

export type ToolResult = {
  ok: boolean;
  data?: unknown;
  error?: string;
};

export interface HealthClient {
  readonly source: "whoop" | "oura" | "kinesis";
  listTools(): Promise<ToolDef[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<ToolResult>;
  close?(): Promise<void>;
}
