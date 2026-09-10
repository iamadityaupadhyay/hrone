import { getDatabase } from '@/lib/mongodb';
import { PunchLog } from '@/lib/types/employee';

export const PUNCH_LOGS_COLLECTION = 'punch_logs';

export async function addPunchLog(log: Omit<PunchLog, '_id'>): Promise<string> {
  const db = await getDatabase();
  const collection = db.collection(PUNCH_LOGS_COLLECTION);
  const result = await collection.insertOne({
    ...log,
    executedAt: log.executedAt || new Date().toISOString(),
  });
  return result.insertedId.toString();
}

export async function getRecentPunchLogs(limit: number = 50, employeeId?: number): Promise<PunchLog[]> {
  const db = await getDatabase();
  const collection = db.collection(PUNCH_LOGS_COLLECTION);
  
  const filter = employeeId ? { employeeId } : {};
  const docs = await collection
    .find(filter)
    .sort({ executedAt: -1 })
    .limit(limit)
    .toArray();

  return docs.map((doc) => ({
    ...doc,
    _id: doc._id.toString(),
  })) as PunchLog[];
}
