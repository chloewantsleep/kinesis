import { auth } from "@/auth";
import { connectMongo } from "@/lib/db/mongo";
import { User, type UserDoc } from "@/lib/db/models/User";

export async function requireUser(): Promise<UserDoc> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) throw new Response("Unauthorized", { status: 401 });
  await connectMongo();
  const existing = await User.findOne({ email });
  if (existing) return existing.toObject() as UserDoc;
  const created = await User.create({
    email,
    name: session.user?.name ?? undefined,
    image: session.user?.image ?? undefined,
  });
  return created.toObject() as UserDoc;
}

export async function getOptionalUser(): Promise<UserDoc | null> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return null;
  await connectMongo();
  const existing = await User.findOne({ email });
  if (existing) return existing.toObject() as UserDoc;
  const created = await User.create({
    email,
    name: session.user?.name ?? undefined,
    image: session.user?.image ?? undefined,
  });
  return created.toObject() as UserDoc;
}
