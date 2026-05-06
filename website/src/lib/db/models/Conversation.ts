import mongoose, { Schema, type InferSchemaType } from "mongoose";

const ConversationSchema = new Schema(
  {
    participants: {
      type: [Schema.Types.ObjectId],
      ref: "Agent",
      validate: (v: unknown[]) => Array.isArray(v) && v.length === 2,
      required: true,
    },
    status: {
      type: String,
      enum: ["requested", "active", "completed"],
      default: "active",
    },
    lastMessageAt: { type: Date, default: () => new Date() },
    messageCount: { type: Number, default: 0 },
  },
  { timestamps: true, collection: "conversations" }
);

ConversationSchema.index({ participants: 1 });
ConversationSchema.index({ lastMessageAt: -1 });

export type ConversationDoc = InferSchemaType<typeof ConversationSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Conversation =
  (mongoose.models.Conversation as mongoose.Model<ConversationDoc>) ??
  mongoose.model<ConversationDoc>("Conversation", ConversationSchema);
