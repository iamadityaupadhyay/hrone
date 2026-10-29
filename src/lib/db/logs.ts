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

export async function getPaginatedPunchLogs(options: {
  page?: number;
  limit?: number;
  employeeId?: number;
  status?: 'all' | 'success' | 'failed';
  punchType?: 'all' | 'CHECK_IN' | 'CHECK_OUT';
  search?: string;
  date?: string; // YYYY-MM-DD (IST)
}): Promise<{ logs: PunchLog[]; total: number; page: number; totalPages: number }> {
  const db = await getDatabase();
  const collection = db.collection(PUNCH_LOGS_COLLECTION);
  const page = Math.max(1, options.page || 1);
  const limit = Math.max(1, Math.min(100, options.limit || 20));
  const skip = (page - 1) * limit;

  const query: Record<string, unknown> = {};
  const andConditions: Record<string, unknown>[] = [];

  if (options.employeeId) query.employeeId = options.employeeId;
  if (options.status === 'success') query.success = true;
  if (options.status === 'failed') query.success = false;
  if (options.punchType && options.punchType !== 'all' && options.punchType.toUpperCase() !== 'ALL') {
    query.punchType = options.punchType;
  }

  if (options.date && /^\d{4}-\d{2}-\d{2}$/.test(options.date.trim())) {
    const d = options.date.trim();
    const startIso = new Date(`${d}T00:00:00+05:30`).toISOString();
    const endIso = new Date(`${d}T23:59:59.999+05:30`).toISOString();
    andConditions.push({
      $or: [
        { punchTime: { $regex: `^${d}` } },
        { executedAt: { $gte: startIso, $lte: endIso } },
      ],
    });
  }

  if (options.search && options.search.trim()) {
    const s = options.search.trim();
    andConditions.push({
      $or: [
        { employeeName: { $regex: s, $options: 'i' } },
        { error: { $regex: s, $options: 'i' } },
        { punchTime: { $regex: s, $options: 'i' } },
      ],
    });
  }

  if (andConditions.length > 0) {
    query.$and = andConditions;
  }

  const [total, docs] = await Promise.all([
    collection.countDocuments(query),
    collection.find(query).sort({ executedAt: -1 }).skip(skip).limit(limit).toArray(),
  ]);

  const logs = docs.map((doc) => ({
    ...doc,
    _id: doc._id.toString(),
  })) as PunchLog[];

  return {
    logs,
    total,
    page,
    totalPages: Math.ceil(total / limit) || 1,
  };
}
