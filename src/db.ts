import { MongoClient } from "mongodb";

const url = process.env.MONGODB_URL;
if (!url) {
  throw new Error("MONGODB_URL is required; copy .env.example to .env for local development");
}

export const client = new MongoClient(url);
export const db = client.db();
