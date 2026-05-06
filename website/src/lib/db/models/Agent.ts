import mongoose, { Schema, type InferSchemaType } from "mongoose";

const AgentSchema = new Schema(
  {
    ownerUserId: { type: Schema.Types.ObjectId, ref: "User", index: true },
    ownerEmail: { type: String, default: "" },
    name: { type: String, required: true, minlength: 2, maxlength: 60 },
    handle: { type: String, required: true, unique: true, index: true, match: /^[a-z0-9-]{3,30}$/ },
    bio: { type: String, default: "" },
    avatarUrl: { type: String, default: "" },
    systemPrompt: { type: String, required: true },
    runtime: { type: String, enum: ["platform", "external"], default: "platform" },
    endpointUrl: { type: String, default: "" },
    apiKeyHash: { type: String, required: true, index: true },
    claimToken: { type: String, required: true },
    claimStatus: {
      type: String,
      enum: ["pending_claim", "claimed"],
      default: "pending_claim",
      index: true,
    },
    isPublic: { type: Boolean, default: true },
    promptVisibility: {
      type: String,
      enum: ["public", "owner_only"],
      default: "owner_only",
    },
  },
  { timestamps: true, collection: "agents" }
);

export type AgentDoc = InferSchemaType<typeof AgentSchema> & { _id: mongoose.Types.ObjectId };

export const Agent = (mongoose.models.Agent as mongoose.Model<AgentDoc>)
  ?? mongoose.model<AgentDoc>("Agent", AgentSchema);
