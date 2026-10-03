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
 * Check if a given date ("YYYY-MM-DD") is an official holiday.
 * Checks employee-specific calendar first, then falls back to company-wide calendar.
 */
export async function isHolidayToday(
  employeeId?: number,
  dateStr?: string,
  employeeProfile?: EmployeeProfile
): Promise<{ isHoliday: boolean; holidayName?: string }> {
  const targetDate = dateStr || new Date().toISOString().split('T')[0];
  const db = await getDatabase();
  const collection = db.collection(HOLIDAYS_COLLECTION);

  // 1. Try finding an official holiday specifically for this employee
  if (employeeId) {
    const doc = await collection.findOne({ employeeId, date: targetDate });
    if (doc) {
      return {
        isHoliday: true,
        holidayName: doc.holidayName || 'Official Holiday',
      };
    }
  }

  // 2. Fallback: Check if ANY employee in the company has an official (non-restricted) holiday on this date
  const companyDoc = await collection.findOne({
    date: targetDate,
    isRestrictedHoliday: { $ne: true },
  });
  if (companyDoc) {
    return {
      isHoliday: true,
      holidayName: companyDoc.holidayName || 'Official Holiday',
    };
  }

  // 3. Fallback: If DB is empty and employee profile was passed, try on-demand sync from HROne API
  if (employeeProfile) {
    try {
      const count = await collection.countDocuments();
      if (count === 0) {
        await syncEmployeeHolidays(employeeProfile);
        const retryDoc = await collection.findOne({
          date: targetDate,
          isRestrictedHoliday: { $ne: true },
        });
        if (retryDoc) {
          return {
            isHoliday: true,
            holidayName: retryDoc.holidayName || 'Official Holiday',
          };
        }
      }
    } catch {
      // Ignore background sync errors during fallback
    }
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

/**
 * Sync holiday calendars for active employees to ensure company-wide holiday calendar is always up to date
 */
export async function syncAllActiveEmployeesHolidays(
  employees: EmployeeProfile[],
  year?: number
): Promise<{ totalSynced: number; errors: string[] }> {
  const currentYear = year || new Date().getFullYear();
  let totalSynced = 0;
  const errors: string[] = [];

  for (const emp of employees) {
    if (emp.status !== 'ACTIVE') continue;
    try {
      const res = await syncEmployeeHolidays(emp, currentYear);
      if (res.success) {
        totalSynced += res.count;
      } else if (res.error) {
        errors.push(`${emp.name}: ${res.error}`);
      }
    } catch (err) {
      errors.push(`${emp.name}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  return { totalSynced, errors };
}
