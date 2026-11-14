import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

import { getDatabase } from '../src/lib/mongodb';

async function migrateSubscriptions() {
  console.log('Connecting to MongoDB...');
  const db = await getDatabase();
  const employees = await db.collection('employees').find({}).toArray();

  console.log(`Found ${employees.length} employees to evaluate/migrate.`);

  let compedCount = 0;
  let trialCount = 0;
  let untouchedCount = 0;

  const now = new Date();
  const trialExpiry = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

  for (const emp of employees) {
    const isSuperAdmin = Boolean(
      emp.isSuperAdmin ||
      (emp.name && emp.name.toLowerCase().includes('aditya')) ||
      emp.role === 'SUPER_ADMIN'
    );

    if (isSuperAdmin) {
      await db.collection('employees').updateOne(
        { _id: emp._id },
        {
          $set: {
            isSuperAdmin: true,
            subscription: {
              plan: 'PRO_149',
              status: 'LIFETIME_FREE',
              validUntil: '2099-12-31T23:59:59.000Z',
              activatedAt: now.toISOString(),
              amountPaid: 0,
              isComped: true,
            },
            updatedAt: now.toISOString(),
          },
        }
      );
      compedCount++;
    } else if (!emp.subscription || !emp.subscription.validUntil) {
      // Grant 7-day Pro Free Trial
      await db.collection('employees').updateOne(
        { _id: emp._id },
        {
          $set: {
            subscription: {
              plan: 'PRO_149',
              status: 'TRIAL',
              validUntil: trialExpiry,
              activatedAt: now.toISOString(),
              amountPaid: 0,
              isComped: false,
            },
            updatedAt: now.toISOString(),
          },
        }
      );
      trialCount++;
    } else {
      untouchedCount++;
    }
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`✅ Subscription Migration Complete!`);
  console.log(`👑 Super Admin / VIP Lifetime Free: ${compedCount}`);
  console.log(`⏳ 7-Day Pro Free Trial Granted:     ${trialCount}`);
  console.log(`🟢 Existing Subscriptions Kept:     ${untouchedCount}`);
  console.log(`👥 Total Evaluated:                 ${employees.length}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  process.exit(0);
}

migrateSubscriptions().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
