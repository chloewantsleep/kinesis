import Anthropic from "@anthropic-ai/sdk";
import mongoose from "mongoose";
import { connectMongo } from "@/lib/db/mongo";
import { Agent } from "@/lib/db/models/Agent";
import { Insight } from "@/lib/db/models/Insight";
import { MCPConnection } from "@/lib/db/models/MCPConnection";
import { AgentRun } from "@/lib/db/models/AgentRun";
import { WhoopClient } from "./clients/whoop";
import { OuraClient } from "./clients/oura";
import { KinesisClient } from "./clients/kinesis";
import { PlatformClient } from "./clients/platform";
import type { HealthClient, ToolDef } from "./types";

const MAX_TURNS = 6;
const MODEL = "claude-sonnet-4-6";

type RunOptions = {
  agentId: string;
  trigger?: "manual" | "cron" | "thread_reply" | "reminder";
  triggerNote?: string;
};

export async function runAgentTurn(opts: RunOptions): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  await connectMongo();
  const agent = await Agent.findById(opts.agentId);
  if (!agent) throw new Error("agent not found");
  if (agent.runtime === "external") {
    throw new Error("agent runtime is external; the platform does not run it");
  }
  const ownerUserId = agent.ownerUserId;
  if (!ownerUserId) {
    throw new Error("agent has no owner; cannot run");
  }

  const conns = await MCPConnection.find({
    userId: ownerUserId,
    status: "connected",
    enabled: { $ne: false },
  }).lean();

  const clients: HealthClient[] = [];
  for (const c of conns) {
    if (c.kind === "whoop")
      clients.push(new WhoopClient(c.mode, c.secretsCiphertext));
    else if (c.kind === "oura")
      clients.push(new OuraClient(c.mode, c.secretsCiphertext));
    else if (c.kind === "kinesis")
      clients.push(
        new KinesisClient(
          c.mode,
          ((c.config as { deviceUrl?: string })?.deviceUrl) ??
            "http://localhost:8081"
        )
      );
    // glasses: no client implementation yet, skipped
  }
  clients.push(new PlatformClient(agent._id, ownerUserId));

  const toolList: ToolDef[] = [];
  const toolToClient = new Map<string, HealthClient>();
  for (const client of clients) {
    const tools = await client.listTools();
    for (const t of tools) {
      toolList.push(t);
      toolToClient.set(t.name, client);
    }
  }

  const run = await AgentRun.create({
    agentId: agent._id,
    userId: ownerUserId,
    trigger: opts.trigger ?? "manual",
    triggerNote: opts.triggerNote ?? "",
    status: "running",
    startedAt: new Date(),
  });

  const anthropic = new Anthropic({ apiKey });
  const userMessage =
    opts.triggerNote && opts.triggerNote.trim().length > 0
      ? opts.triggerNote
      : "Run a routine check-in: pull my latest health data, summarize what stands out, and suggest one concrete action for today. Be specific about numbers.";

  const messages: Anthropic.Messages.MessageParam[] = [
    { role: "user", content: userMessage },
  ];

  // Inject any insights this agent has applied as "active patterns" so they
  // shape behavior on every run without mutating the user's authored prompt.
  const appliedInsights = await Insight.find({ appliedBy: agent._id })
    .sort({ updatedAt: -1 })
    .limit(8)
    .select("title body sourceHandle")
    .lean();
  let systemPrompt = agent.systemPrompt;
  if (appliedInsights.length > 0) {
    const block = appliedInsights
      .map((i, idx) => {
        const src = i.sourceHandle ? ` [from @${i.sourceHandle}]` : "";
        const body = i.body ? ` — ${i.body.slice(0, 240)}` : "";
        return `${idx + 1}. ${i.title}${body}${src}`;
      })
      .join("\n");
    systemPrompt += `\n\n## Active patterns (applied from peer network)\nFollow these unless overridden:\n${block}`;
  }

  let totalIn = 0;
  let totalOut = 0;
  let finalText = "";

  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 1024,
        system: systemPrompt,
        tools: toolList.length
          ? toolList.map((t) => ({
              name: t.name,
              description: t.description,
              input_schema: t.input_schema,
            }))
          : undefined,
        messages,
      });
      totalIn += response.usage.input_tokens;
      totalOut += response.usage.output_tokens;

      const toolUses = response.content.filter(
        (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use"
      );
      const textBlocks = response.content.filter(
        (b): b is Anthropic.Messages.TextBlock => b.type === "text"
      );

      messages.push({ role: "assistant", content: response.content });

      if (response.stop_reason === "end_turn" || toolUses.length === 0) {
        finalText = textBlocks.map((b) => b.text).join("\n").trim();
        break;
      }

      const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];
      for (const tu of toolUses) {
        const client = toolToClient.get(tu.name);
        const startedAt = new Date();
        if (!client) {
          const finishedAt = new Date();
          run.toolCalls.push({
            name: tu.name,
            input: tu.input,
            output: null,
            error: "no client",
            startedAt,
            finishedAt,
          });
          toolResults.push({
            type: "tool_result",
            tool_use_id: tu.id,
            content: `error: no client for tool ${tu.name}`,
            is_error: true,
          });
          continue;
        }
        const result = await client.callTool(tu.name, (tu.input as Record<string, unknown>) ?? {});
        const finishedAt = new Date();
        run.toolCalls.push({
          name: tu.name,
          input: tu.input,
          output: result.ok ? result.data : null,
          error: result.ok ? "" : result.error ?? "",
          startedAt,
          finishedAt,
        });
        toolResults.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: result.ok
            ? JSON.stringify(result.data)
            : `error: ${result.error ?? "unknown"}`,
          is_error: !result.ok,
        });
      }
      messages.push({ role: "user", content: toolResults });
    }

    run.status = "succeeded";
    run.outputSummary = finalText.slice(0, 4000);
  } catch (err) {
    run.status = "failed";
    run.error = err instanceof Error ? err.message : String(err);
  } finally {
    for (const c of clients) await c.close?.();
    run.finishedAt = new Date();
    run.inputTokens = totalIn;
    run.outputTokens = totalOut;
    run.markModified("toolCalls");
    await run.save();
    void touchConnections(conns.map((c) => c._id));
  }

  return String(run._id);
}

async function touchConnections(ids: mongoose.Types.ObjectId[]) {
  if (ids.length === 0) return;
  await MCPConnection.updateMany(
    { _id: { $in: ids } },
    { $set: { lastUsedAt: new Date() } }
  );
}
