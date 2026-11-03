import { getDatabase } from '@/lib/mongodb';
import { DEFAULT_SCHEDULE_CONFIG, ScheduleConfig } from '@/lib/config/schedule';

export async function getSystemScheduleConfig(): Promise<ScheduleConfig> {
  try {
    const db = await getDatabase();
    const doc = await db.collection('settings').findOne({ _id: 'schedule_config' as unknown as import('mongodb').ObjectId });
    if (doc) {
      return {
        checkInMin: doc.checkInMin || DEFAULT_SCHEDULE_CONFIG.checkInMin,
        checkInMax: doc.checkInMax || DEFAULT_SCHEDULE_CONFIG.checkInMax,
        checkOutMin: doc.checkOutMin || DEFAULT_SCHEDULE_CONFIG.checkOutMin,
        checkOutMax: doc.checkOutMax || DEFAULT_SCHEDULE_CONFIG.checkOutMax,
        updatedAt: doc.updatedAt,
        updatedBy: doc.updatedBy,
      };
    }
  } catch (err) {
    console.warn('[ScheduleConfig] Error reading system schedule config from DB:', err);
  }
  return DEFAULT_SCHEDULE_CONFIG;
}

