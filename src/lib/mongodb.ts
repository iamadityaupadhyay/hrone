import { MongoClient } from "mongodb";
import * as dotenv from "dotenv";

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

function initMongoClient(): Promise<MongoClient> {
  if (!process.env.MONGODB_URI) {
    dotenv.config({ path: ".env.local" });
    dotenv.config({ path: ".env" });
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      "Please define the MONGODB_URI environment variable inside .env.local or your deployment settings."
    );
  }

  if (process.env.NODE_ENV === "development") {
    if (!global._mongoClientPromise) {
      const client = new MongoClient(uri);
      global._mongoClientPromise = client.connect();
    }
    return global._mongoClientPromise;
  } else {
    // In production (e.g. Vercel serverless), reuse global promise across warm lambdas
    if (!global._mongoClientPromise) {
      const client = new MongoClient(uri);
      global._mongoClientPromise = client.connect();
    }
    return global._mongoClientPromise;
  }
}

/**
 * Lazy client promise that only connects when accessed/awaited
 */
const clientPromise: Promise<MongoClient> = {
  then(onfulfilled, onrejected) {
    return initMongoClient().then(onfulfilled, onrejected);
  },
  catch(onrejected) {
    return initMongoClient().catch(onrejected);
  },
  finally(onfinally) {
    return initMongoClient().finally(onfinally);
  },
  [Symbol.toStringTag]: "Promise",
};

/**
 * Helper to get the MongoDB database instance.
 * Defaults to the db name in MONGODB_DB env var or the default db in the URI.
 */
export async function getDatabase(dbName?: string) {
  const client = await initMongoClient();
  return client.db(dbName || process.env.MONGODB_DB || "test");
}

export default clientPromise;
