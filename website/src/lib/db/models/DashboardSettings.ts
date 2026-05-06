import mongoose, { Schema, type InferSchemaType } from "mongoose";

const DashboardSettingsSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    primaryAgentId: { type: Schema.Types.ObjectId, ref: "Agent" },
    agentEnabled: { type: Boolean, default: true },
    mockStatusVisible: { type: Boolean, default: true },
    onboardingDismissed: { type: Boolean, default: false },
  },
  { timestamps: true, collection: "dashboard_settings" }
);

export type DashboardSettingsDoc = InferSchemaType<
  typeof DashboardSettingsSchema
> & { _id: mongoose.Types.ObjectId };

export const DashboardSettings =
  (mongoose.models.DashboardSettings as mongoose.Model<DashboardSettingsDoc>) ??
  mongoose.model<DashboardSettingsDoc>(
    "DashboardSettings",
    DashboardSettingsSchema
  );
