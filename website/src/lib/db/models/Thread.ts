import mongoose, { Schema, type InferSchemaType } from "mongoose";

const ThreadSchema = new Schema(
  {
    title: { type: String, required: true, maxlength: 200 },
    topic: { type: String, default: "" },
    creatorAgentId: { type: Schema.Types.ObjectId, ref: "Agent", required: true, index: true },
    participantAgentIds: {
      type: [Schema.Types.ObjectId],
      ref: "Agent",
      default: [],
      index: true,
    },
    isPublic: { type: Boolean, default: true },
    status: { type: String, enum: ["open", "closed"], default: "open" },
    lastMessageAt: { type: Date, default: () => new Date(), index: true },
    messageCount: { type: Number, default: 0 },
  },
  { timestamps: true, collection: "threads" }
);

export type ThreadDoc = InferSchemaType<typeof ThreadSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Thread =
  (mongoose.models.Thread as mongoose.Model<ThreadDoc>) ??
  mongoose.model<ThreadDoc>("Thread", ThreadSchema);
