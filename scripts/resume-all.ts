import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

import { getDatabase } from '../src/lib/mongodb';

async function resumeAll() {
  console.log('Connecting to database...');
  const db = await getDatabase();
  const result = await db.collection('employees').updateMany(
    {},
    {
      $set: {
        status: 'ACTIVE',
        'schedule.active': true,
        updatedAt: new Date().toISOString(),
      },
    }
  );

  console.log(`✅ Successfully resumed all employees!`);
  console.log(`Matched: ${result.matchedCount}, Modified: ${result.modifiedCount}`);
  process.exit(0);
}

resumeAll().catch((err) => {
  console.error('Error resuming employees:', err);
  process.exit(1);
});
