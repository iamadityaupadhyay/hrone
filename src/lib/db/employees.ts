import { getDatabase } from '@/lib/mongodb';
import { EmployeeProfile, TodayPunchState } from '@/lib/types/employee';
import { ObjectId } from 'mongodb';

export const EMPLOYEES_COLLECTION = 'employees';

export async function getAllEmployees(): Promise<EmployeeProfile[]> {
  const db = await getDatabase();
  const collection = db.collection(EMPLOYEES_COLLECTION);
  const docs = await collection.find({}).sort({ name: 1 }).toArray();

  return docs.map((doc) => ({
    ...doc,
    _id: doc._id.toString(),
  })) as EmployeeProfile[];
}

export async function getEmployeeById(id: string): Promise<EmployeeProfile | null> {
  const db = await getDatabase();
  const collection = db.collection(EMPLOYEES_COLLECTION);
  
  let filter: Record<string, unknown> = {};
  if (ObjectId.isValid(id)) {
    filter = { _id: new ObjectId(id) };
  } else if (!isNaN(Number(id))) {
    filter = { employeeId: Number(id) };
  } else {
    filter = { username: id };
  }

  const doc = await collection.findOne(filter);
  if (!doc) return null;

  return {
    ...doc,
    _id: doc._id.toString(),
  } as EmployeeProfile;
}

export async function getEmployeeByEmployeeId(employeeId: number): Promise<EmployeeProfile | null> {
  const db = await getDatabase();
  const collection = db.collection(EMPLOYEES_COLLECTION);
  const doc = await collection.findOne({ employeeId });
  if (!doc) return null;

  return {
    ...doc,
    _id: doc._id.toString(),
  } as EmployeeProfile;
}

export async function upsertEmployee(profile: Omit<EmployeeProfile, '_id'> & { _id?: string }): Promise<string> {
  const db = await getDatabase();
  const collection = db.collection(EMPLOYEES_COLLECTION);

  const now = new Date().toISOString();
  const { _id, ...dataWithoutId } = profile;

  if (_id && ObjectId.isValid(_id)) {
    await collection.updateOne(
      { _id: new ObjectId(_id) },
      {
        $set: {
          ...dataWithoutId,
          updatedAt: now,
        },
      }
    );
    return _id;
  }

  // Check if exists by employeeId
  const existing = await collection.findOne({ employeeId: profile.employeeId });
  if (existing) {
    await collection.updateOne(
      { employeeId: profile.employeeId },
      {
        $set: {
          ...dataWithoutId,
          updatedAt: now,
        },
      }
    );
    return existing._id.toString();
  }

  const insertResult = await collection.insertOne({
    ...dataWithoutId,
    createdAt: dataWithoutId.createdAt || now,
    updatedAt: now,
  });

  return insertResult.insertedId.toString();
}

export async function updateEmployeeTokens(
  employeeId: number,
  jwtToken: string,
  refreshToken: string,
  tokenExpiry?: string,
  refreshTokenExpiry?: string
): Promise<void> {
  const db = await getDatabase();
  const collection = db.collection(EMPLOYEES_COLLECTION);

  await collection.updateOne(
    { employeeId },
    {
      $set: {
        jwtToken,
        refreshToken,
        tokenExpiry,
        refreshTokenExpiry,
        status: 'ACTIVE',
        lastTokenRefresh: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    }
  );
}

export async function updateEmployeePunchState(
  employeeId: number,
  punchType: 'CHECK_IN' | 'CHECK_OUT',
  success: boolean,
  punchTimeIso: string
): Promise<void> {
  const db = await getDatabase();
  const collection = db.collection(EMPLOYEES_COLLECTION);

  const now = new Date().toISOString();
  const todayStr = punchTimeIso.split('T')[0];

  const existingDoc = await collection.findOne({ employeeId });
  const existingToday =
    existingDoc?.todayPunch && existingDoc.todayPunch.date === todayStr
      ? existingDoc.todayPunch
      : {};

  const todayPunch: TodayPunchState = {
    date: todayStr,
    plannedCheckIn: existingToday.plannedCheckIn,
    plannedCheckOut: existingToday.plannedCheckOut,
    checkedInAt: punchType === 'CHECK_IN' ? now : existingToday.checkedInAt,
    checkedOutAt: punchType === 'CHECK_OUT' ? now : existingToday.checkedOutAt,
    checkInStatus:
      punchType === 'CHECK_IN'
        ? (success ? 'SUCCESS' : 'FAILED')
        : (existingToday.checkInStatus || 'PENDING'),
    checkOutStatus:
      punchType === 'CHECK_OUT'
        ? (success ? 'SUCCESS' : 'FAILED')
        : (existingToday.checkOutStatus || 'PENDING'),
  };

  const updateFields: Record<string, unknown> = {
    updatedAt: now,
    todayPunch,
  };

  if (punchType === 'CHECK_IN') {
    updateFields.lastCheckIn = now;
  } else {
    updateFields.lastCheckOut = now;
  }

  await collection.updateOne({ employeeId }, { $set: updateFields });
}

export async function deleteEmployee(id: string): Promise<boolean> {
  const db = await getDatabase();
  const collection = db.collection(EMPLOYEES_COLLECTION);

  const filter = ObjectId.isValid(id) ? { _id: new ObjectId(id) } : { employeeId: Number(id) };
  const res = await collection.deleteOne(filter);
  return res.deletedCount > 0;
}
