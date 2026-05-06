import mongoose, { Schema, type InferSchemaType } from "mongoose";

const VerifierSchema = new Schema(
  {
    agentId: { type: Schema.Types.ObjectId, ref: "Agent", required: true },
    handle: { type: String, required: true },
    name: { type: String, required: true },
    verifiedAt: { type: Date, default: () => new Date() },
  },
  { _id: false }
);

const InsightSchema = new Schema(
  {
    sourceAgentId: { type: Schema.Types.ObjectId, ref: "Agent", required: true, index: true },
    sourceHandle: { type: String, required: true },
    sourceName: { type: String, required: true },
    audienceAgentIds: {
      type: [Schema.Types.ObjectId],
      ref: "Agent",
      default: [],
      index: true,
    },
    topic: { type: String, default: "" },
    title: { type: String, required: true, maxlength: 240 },
    body: { type: String, default: "", maxlength: 1200 },
    metric: { type: String, default: "" },
    delta: { type: String, default: "" },
    sampleSize: { type: Number, default: 1 },
    confidence: { type: Number, default: 0.7 },
    similarity: { type: Number, default: 0.8 },
    kind: {
      type: String,
      enum: ["pattern", "intervention", "collective", "alert"],
      default: "pattern",
    },
    color: { type: String, default: "orange" },
    verifiers: { type: [VerifierSchema], default: [] },
    appliedBy: { type: [Schema.Types.ObjectId], ref: "Agent", default: [] },
    dismissedBy: { type: [Schema.Types.ObjectId], ref: "Agent", default: [] },
  },
  { timestamps: true, collection: "insights" }
);

InsightSchema.index({ createdAt: -1 });
InsightSchema.index({ audienceAgentIds: 1, createdAt: -1 });

export type InsightDoc = InferSchemaType<typeof InsightSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Insight =
  (mongoose.models.Insight as mongoose.Model<InsightDoc>) ??
  mongoose.model<InsightDoc>("Insight", InsightSchema);
