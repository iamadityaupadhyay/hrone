import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

import { getDatabase } from '../src/lib/mongodb';
import { executePunch, generateRandomPunchTime, getISTPunchTime } from '../src/lib/hrone/punch';
import { EmployeeProfile } from '../src/lib/types/employee';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const istNow = getISTPunchTime();
  const [todayDateStr, currentIstTime] = istNow.split('T');

  console.log('====================================================');
  console.log(` Starting Batch Check-In at ${todayDateStr} ${currentIstTime} IST `);
  console.log('====================================================');

  const db = await getDatabase();
  const collection = db.collection<EmployeeProfile>('employees');

  const allActive = await collection
    .find({
      status: 'ACTIVE',
      'schedule.active': true,
    })
    .toArray();

  const pendingEmployees = allActive.filter((emp) => {
    const tp = emp.todayPunch;
    if (tp && tp.date === todayDateStr && tp.checkInStatus === 'SUCCESS') {
      return false;
    }
    return true;
  });

  console.log(`Found ${pendingEmployees.length} active employees pending check-in for today (${todayDateStr}).\n`);

  if (pendingEmployees.length === 0) {
    console.log('All active employees are already checked in for today.');
    process.exit(0);
  }

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < pendingEmployees.length; i++) {
    const emp = pendingEmployees[i];
    const progress = `[${i + 1}/${pendingEmployees.length}]`;
    console.log(`${progress} Punching IN for ${emp.name} (${emp.employeeId})...`);

    // Ensure today's planned times exist
    let todayPunch = emp.todayPunch;
    if (!todayPunch || todayPunch.date !== todayDateStr) {
      const plannedIn = generateRandomPunchTime(
        emp.schedule.checkInMin || '09:30',
        emp.schedule.checkInMax || '09:55'
      );
      const plannedOut = generateRandomPunchTime(
        emp.schedule.checkOutMin || '19:00',
        emp.schedule.checkOutMax || '19:30'
      );

      todayPunch = {
        date: todayDateStr,
        plannedCheckIn: plannedIn,
        plannedCheckOut: plannedOut,
        checkInStatus: 'PENDING',
        checkOutStatus: 'PENDING',
      };

      await collection.updateOne(
        { employeeId: emp.employeeId },
        { $set: { todayPunch, updatedAt: new Date().toISOString() } }
      );
    }

    try {
      const res = await executePunch(emp, 'CHECK_IN', 'AUTOMATED');
      if (res.success) {
        successCount++;
        console.log(`   ✅ SUCCESS: Punch recorded at ${res.punchTime}`);
      } else {
        failCount++;
        console.warn(`   ❌ FAILED: ${res.error || 'Unknown error'} (HTTP ${res.httpStatus})`);
      }
    } catch (err: unknown) {
      failCount++;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`   ❌ ERROR: ${msg}`);
    }

    if (i < pendingEmployees.length - 1) {
      await sleep(600); // 600ms safety throttle
    }
  }

  console.log('\n====================================================');
  console.log('            Batch Check-In Finished                 ');
  console.log(` Total: ${pendingEmployees.length} | Succeeded: ${successCount} | Failed: ${failCount} `);
  console.log('====================================================');

  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal batch checkin error:', err);
  process.exit(1);
});
