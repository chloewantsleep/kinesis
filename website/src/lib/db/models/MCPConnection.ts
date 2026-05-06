import mongoose, { Schema, type InferSchemaType } from "mongoose";

const MCPConnectionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    kind: {
      type: String,
      enum: ["whoop", "oura", "kinesis", "glasses"],
      required: true,
    },
    label: { type: String, default: "" },
    status: {
      type: String,
      enum: ["connected", "needs_reauth", "error"],
      default: "connected",
    },
    mode: { type: String, enum: ["real", "mock"], default: "real" },
    enabled: { type: Boolean, default: true },
    config: { type: Schema.Types.Mixed, default: {} },
    secretsCiphertext: { type: String, default: "" },
    lastUsedAt: { type: Date },
    lastError: { type: String, default: "" },
  },
  { timestamps: true, collection: "mcp_connections" }
);

MCPConnectionSchema.index({ userId: 1, kind: 1 });

export type MCPConnectionDoc = InferSchemaType<typeof MCPConnectionSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const MCPConnection =
  (mongoose.models.MCPConnection as mongoose.Model<MCPConnectionDoc>) ??
  mongoose.model<MCPConnectionDoc>("MCPConnection", MCPConnectionSchema);
