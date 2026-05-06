import mongoose, { Schema, type InferSchemaType } from "mongoose";

const ToolCallSchema = new Schema(
  {
    name: { type: String, required: true },
    input: { type: Schema.Types.Mixed },
    output: { type: Schema.Types.Mixed },
    error: { type: String, default: "" },
    startedAt: { type: Date, required: true },
    finishedAt: { type: Date, required: true },
  },
  { _id: false }
);

const AgentRunSchema = new Schema(
  {
    agentId: { type: Schema.Types.ObjectId, ref: "Agent", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    trigger: {
      type: String,
      enum: ["manual", "cron", "thread_reply", "reminder"],
      default: "manual",
    },
    triggerNote: { type: String, default: "" },
    status: {
      type: String,
      enum: ["running", "succeeded", "failed"],
      default: "running",
    },
    startedAt: { type: Date, default: () => new Date() },
    finishedAt: { type: Date },
    toolCalls: { type: [ToolCallSchema], default: [] },
    outputSummary: { type: String, default: "" },
    error: { type: String, default: "" },
    inputTokens: { type: Number, default: 0 },
    outputTokens: { type: Number, default: 0 },
  },
  { timestamps: true, collection: "agent_runs" }
);

AgentRunSchema.index({ agentId: 1, startedAt: -1 });

export type AgentRunDoc = InferSchemaType<typeof AgentRunSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const AgentRun =
  (mongoose.models.AgentRun as mongoose.Model<AgentRunDoc>) ??
  mongoose.model<AgentRunDoc>("AgentRun", AgentRunSchema);
