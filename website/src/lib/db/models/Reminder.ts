import mongoose, { Schema, type InferSchemaType } from "mongoose";

const ReminderSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    agentId: { type: Schema.Types.ObjectId, ref: "Agent", required: true, index: true },
    dueAt: { type: Date, required: true, index: true },
    message: { type: String, required: true, maxlength: 1000 },
    status: {
      type: String,
      enum: ["pending", "fired", "dismissed"],
      default: "pending",
      index: true,
    },
    firedAt: { type: Date },
  },
  { timestamps: true, collection: "reminders" }
);

ReminderSchema.index({ status: 1, dueAt: 1 });

export type ReminderDoc = InferSchemaType<typeof ReminderSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Reminder =
  (mongoose.models.Reminder as mongoose.Model<ReminderDoc>) ??
  mongoose.model<ReminderDoc>("Reminder", ReminderSchema);
