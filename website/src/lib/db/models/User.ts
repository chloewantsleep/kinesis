import mongoose, { Schema, type InferSchemaType } from "mongoose";

const UserSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, index: true },
    name: { type: String },
    image: { type: String },
  },
  { timestamps: true, collection: "users" }
);

export type UserDoc = InferSchemaType<typeof UserSchema> & { _id: mongoose.Types.ObjectId };

export const User = (mongoose.models.User as mongoose.Model<UserDoc>)
  ?? mongoose.model<UserDoc>("User", UserSchema);
