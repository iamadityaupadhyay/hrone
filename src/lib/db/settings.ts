import { getDatabase } from '@/lib/mongodb';
import { DEFAULT_SCHEDULE_CONFIG, ScheduleConfig } from '@/lib/config/schedule';
import { setSubscriptionEnforcedState } from '@/lib/subscription';

export interface SubscriptionSettings {
  enforced: boolean;
  trialDaysDefault: number;
  updatedAt?: string;
  updatedBy?: string;
}

export async function getSubscriptionSettings(): Promise<SubscriptionSettings> {
  try {
    const db = await getDatabase();
    const doc = await db.collection('settings').findOne({ _id: 'subscription_settings' as unknown as import('mongodb').ObjectId });
    if (doc) {
      const isEnforced = Boolean(doc.enforced);
      setSubscriptionEnforcedState(isEnforced);
      return {
        enforced: isEnforced,
        trialDaysDefault: doc.trialDaysDefault || 7,
        updatedAt: doc.updatedAt,
        updatedBy: doc.updatedBy,
      };
    }
  } catch (err) {
    console.warn('[SubscriptionSettings] Error reading subscription settings from DB:', err);
  }
  setSubscriptionEnforcedState(false);
  return { enforced: false, trialDaysDefault: 7 };
}

export async function updateSubscriptionSettings(
  settings: Partial<SubscriptionSettings>
): Promise<SubscriptionSettings> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  const updateData: Record<string, unknown> = { updatedAt: now };

  if (typeof settings.enforced === 'boolean') {
    updateData.enforced = settings.enforced;
    setSubscriptionEnforcedState(settings.enforced);
  }
  if (typeof settings.trialDaysDefault === 'number') {
    updateData.trialDaysDefault = settings.trialDaysDefault;
  }
  if (settings.updatedBy) {
    updateData.updatedBy = settings.updatedBy;
  }

  await db.collection('settings').updateOne(
    { _id: 'subscription_settings' as unknown as import('mongodb').ObjectId },
    { $set: updateData },
    { upsert: true }
  );

  return {
    enforced: typeof settings.enforced === 'boolean' ? settings.enforced : false,
    trialDaysDefault: settings.trialDaysDefault || 7,
    updatedAt: now,
  };
}

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

