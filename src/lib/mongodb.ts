import { MongoClient } from "mongodb";
import * as dotenv from "dotenv";

if (!process.env.MONGODB_URI) {
  dotenv.config({ path: ".env.local" });
  dotenv.config({ path: ".env" });
}

if (!process.env.MONGODB_URI) {
  throw new Error("Please define the MONGODB_URI environment variable inside .env.local");
}

const uri = process.env.MONGODB_URI;
const options = {};

let client: MongoClient;
let clientPromise: Promise<MongoClient>;

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

if (process.env.NODE_ENV === "development") {
  // In development mode, use a global variable so that the value
  // is preserved across module reloads caused by HMR (Hot Module Replacement).
  if (!global._mongoClientPromise) {
    client = new MongoClient(uri, options);
    global._mongoClientPromise = client.connect();
  }
  clientPromise = global._mongoClientPromise;
} else {
  // In production mode, it is best to not use a global variable.
  client = new MongoClient(uri, options);
  clientPromise = client.connect();
}

/**
 * Helper to get the MongoDB database instance.
 * Defaults to the db name in MONGODB_DB env var or the default db in the URI.
 */
export async function getDatabase(dbName?: string) {
  const client = await clientPromise;
  return client.db(dbName || process.env.MONGODB_DB || "test");
}

export default clientPromise;
