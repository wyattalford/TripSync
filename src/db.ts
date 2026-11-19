import { MongoClient } from "mongodb";

const url = process.env.MONGODB_URL;
if (!url) {
  throw new Error("MONGODB_URL is required; copy .env.example to .env for local development");
}

export const client = new MongoClient(url);
export const db = client.db();

export async function verifyTransactionSupport(): Promise<void> {
  const session = client.startSession({ causalConsistency: false });
  try {
    await session.withTransaction(async () => {
      await db.collection<{ _id: string }>("gathering.gatherings").findOne(
        { _id: "__transaction_support_check__" },
        { session },
      );
    }, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } });
  } catch (error) {
    throw new Error("MongoDB snapshot transactions are required for OpenTime.", { cause: error });
  } finally {
    await session.endSession();
  }
}
