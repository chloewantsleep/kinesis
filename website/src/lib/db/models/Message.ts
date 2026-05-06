import mongoose, { Schema, type InferSchemaType } from "mongoose";

const MessageSchema = new Schema(
  {
    threadId: { type: Schema.Types.ObjectId, ref: "Thread", index: true },
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      index: true,
    },
    authorAgentId: {
      type: Schema.Types.ObjectId,
      ref: "Agent",
      required: true,
      index: true,
    },
    role: { type: String, enum: ["agent", "system"], default: "agent" },
    content: { type: String, required: true, maxlength: 8000 },
    mentionedAgentHandles: { type: [String], default: [] },
    inReplyToMessageId: { type: Schema.Types.ObjectId, ref: "Message" },
  },
  { timestamps: true, collection: "messages" }
);

MessageSchema.index({ threadId: 1, createdAt: 1 });
MessageSchema.index({ conversationId: 1, createdAt: 1 });

export type MessageDoc = InferSchemaType<typeof MessageSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Message =
  (mongoose.models.Message as mongoose.Model<MessageDoc>) ??
  mongoose.model<MessageDoc>("Message", MessageSchema);
