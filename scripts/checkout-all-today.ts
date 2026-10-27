import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

import { getDatabase } from '../src/lib/mongodb';
import { executePunch, getISTPunchTime } from '../src/lib/hrone/punch';
import { EmployeeProfile } from '../src/lib/types/employee';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const istNow = getISTPunchTime();
  const [todayDateStr, currentIstTime] = istNow.split('T');

  console.log('====================================================');
  console.log(` Starting Batch Check-Out at ${todayDateStr} ${currentIstTime} IST `);
  console.log('====================================================');

  const db = await getDatabase();
  const collection = db.collection<EmployeeProfile>('employees');

  const employees = await collection
    .find({
      status: 'ACTIVE',
      'schedule.active': true,
      'todayPunch.date': todayDateStr,
      'todayPunch.checkInStatus': 'SUCCESS',
      'todayPunch.checkOutStatus': { $ne: 'SUCCESS' },
    })
    .toArray();

  console.log(`Found ${employees.length} active employees pending check-out for today (${todayDateStr}).\n`);

  if (employees.length === 0) {
    console.log('No employees pending check-out.');
    process.exit(0);
  }

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < employees.length; i++) {
    const emp = employees[i];
    const progress = `[${i + 1}/${employees.length}]`;
    console.log(`${progress} Punching OUT for ${emp.name} (${emp.employeeId})...`);

    try {
      const res = await executePunch(emp, 'CHECK_OUT', 'AUTOMATED');
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

    if (i < employees.length - 1) {
      await sleep(600); // 600ms jitter between requests
    }
  }

  console.log('\n====================================================');
  console.log('            Batch Check-Out Finished                ');
  console.log(` Total: ${employees.length} | Succeeded: ${successCount} | Failed: ${failCount} `);
  console.log('====================================================');

  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal batch checkout error:', err);
  process.exit(1);
});
