import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

import { upsertEmployee } from '../src/lib/db/employees';
import { refreshHROneToken } from '../src/lib/hrone/token';
import { EmployeeProfile } from '../src/lib/types/employee';

async function seed() {
  console.log('Seeding initial profile for Aditya Upadhyay...');

  const aditya: Omit<EmployeeProfile, '_id'> = {
    employeeId: 2357,
    name: 'Aditya Upadhyay',
    username: 'E1885',
    companyDomainCode: 'uharvest',
    jwtToken: '',
    refreshToken: process.env.INITIAL_REFRESH_TOKEN || process.env.REFRESH_TOKEN || '',
    latitude: '28.5004327',
    longitude: '77.4150811',
    geoAccuracy: '12.126',
    geoLocation: '210-211, altF, Sector 142, Noida, Uttar Pradesh 201304, India',
    schedule: {
      active: true,
      checkInMin: '09:00',
      checkInMax: '10:00',
      checkOutMin: '18:00',
      checkOutMax: '20:00',
      workingDays: [1, 2, 3, 4, 5],
    },
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const id = await upsertEmployee(aditya);
  console.log('Upserted Aditya into MongoDB with ID:', id);

  console.log('Testing immediate token refresh to verify sliding token...');
  const refreshResult = await refreshHROneToken({ ...aditya, _id: id });
  if (refreshResult.success) {
    console.log('✅ Token refresh test succeeded!');
    console.log('Access token expires at:', refreshResult.tokenExpiry);
    console.log('Sliding refresh token:', refreshResult.refreshToken);
  } else {
    console.error('❌ Token refresh test failed:', refreshResult.error);
  }

  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed error:', err);
  process.exit(1);
});
