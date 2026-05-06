import mongoose, { Schema, type InferSchemaType } from "mongoose";

const AgentMCPBindingSchema = new Schema(
  {
    agentId: { type: Schema.Types.ObjectId, ref: "Agent", required: true, index: true },
    mcpConnectionId: {
      type: Schema.Types.ObjectId,
      ref: "MCPConnection",
      required: true,
    },
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true, collection: "agent_mcp_bindings" }
);

AgentMCPBindingSchema.index({ agentId: 1, mcpConnectionId: 1 }, { unique: true });

export type AgentMCPBindingDoc = InferSchemaType<typeof AgentMCPBindingSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const AgentMCPBinding =
  (mongoose.models.AgentMCPBinding as mongoose.Model<AgentMCPBindingDoc>) ??
  mongoose.model<AgentMCPBindingDoc>("AgentMCPBinding", AgentMCPBindingSchema);
