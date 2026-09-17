import { getDatabase } from '@/lib/mongodb';
import { fetchHROneHolidays, HolidayRecord } from '@/lib/hrone/holidays';
import { EmployeeProfile } from '@/lib/types/employee';

export const HOLIDAYS_COLLECTION = 'holidays';

/**
 * Save / Upsert holiday records into MongoDB for a given employee & year
 */
export async function saveHolidays(employeeId: number, year: number, holidays: HolidayRecord[]): Promise<number> {
  if (!holidays.length) return 0;
  const db = await getDatabase();
  const collection = db.collection(HOLIDAYS_COLLECTION);

  let savedCount = 0;
  for (const h of holidays) {
    await collection.updateOne(
      { employeeId, date: h.date },
      {
        $set: {
          employeeId,
          year,
          date: h.date,
          holidayName: h.holidayName,
          isRestrictedHoliday: h.isRestrictedHoliday || false,
          description: h.description,
          raw: h.raw,
          updatedAt: new Date().toISOString(),
        },
      },
      { upsert: true }
    );
    savedCount++;
  }

  return savedCount;
}

/**
 * Get all saved holiday records for an employee
 */
export async function getEmployeeHolidays(employeeId: number, year?: number): Promise<HolidayRecord[]> {
  const db = await getDatabase();
  const collection = db.collection(HOLIDAYS_COLLECTION);
  const query: Record<string, unknown> = { employeeId };
  if (year) query.year = year;

  const docs = await collection.find(query).sort({ date: 1 }).toArray();
  return docs.map((doc) => ({
    employeeId: doc.employeeId,
    year: doc.year,
    date: doc.date,
    holidayName: doc.holidayName,
    isRestrictedHoliday: doc.isRestrictedHoliday,
    description: doc.description,
    raw: doc.raw,
    updatedAt: doc.updatedAt,
  }));
}

/**
 * Check if a given date ("YYYY-MM-DD") is a holiday for an employee
 */
export async function isHolidayToday(
  employeeId: number,
  dateStr?: string
): Promise<{ isHoliday: boolean; holidayName?: string }> {
  const targetDate = dateStr || new Date().toISOString().split('T')[0];
  const db = await getDatabase();
  const collection = db.collection(HOLIDAYS_COLLECTION);

  const doc = await collection.findOne({ employeeId, date: targetDate });
  if (doc) {
    return {
      isHoliday: true,
      holidayName: doc.holidayName || 'Official Holiday',
    };
  }

  return { isHoliday: false };
}

/**
 * Sync holiday calendar from HROne API to DB for an employee
 */
export async function syncEmployeeHolidays(
  employee: EmployeeProfile,
  year?: number
): Promise<{ success: boolean; count: number; error?: string }> {
  const currentYear = year || new Date().getFullYear();
  const res = await fetchHROneHolidays(employee, currentYear);

  if (!res.success) {
    return { success: false, count: 0, error: res.error };
  }

  const savedCount = await saveHolidays(employee.employeeId, currentYear, res.holidays);
  return { success: true, count: savedCount };
}
