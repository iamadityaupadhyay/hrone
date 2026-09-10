export interface EmployeeSchedule {
  active: boolean;
  checkInMin: string; // "09:00"
  checkInMax: string; // "10:00"
  checkOutMin: string; // "18:00"
  checkOutMax: string; // "20:00"
  workingDays: number[]; // [1, 2, 3, 4, 5] -> Mon to Fri
}

export interface TodayPunchState {
  date: string; // "YYYY-MM-DD"
  plannedCheckIn?: string; // e.g. "09:24"
  plannedCheckOut?: string; // e.g. "18:41"
  checkedInAt?: string; // ISO string
  checkedOutAt?: string; // ISO string
  checkInStatus?: 'PENDING' | 'SUCCESS' | 'FAILED';
  checkOutStatus?: 'PENDING' | 'SUCCESS' | 'FAILED';
  error?: string;
}

export interface EmployeeProfile {
  _id?: string;
  employeeId: number; // e.g. 2357
  name: string; // e.g. "Aditya Upadhyay"
  username: string; // e.g. "E1885" or phone
  companyDomainCode: string; // e.g. "uharvest"
  jwtToken: string;
  refreshToken: string;
  tokenExpiry?: string; // ISO string
  refreshTokenExpiry?: string; // ISO string
  latitude: string; // e.g. "28.5004327"
  longitude: string; // e.g. "77.4150811"
  geoAccuracy: string; // e.g. "12.126"
  geoLocation: string; // e.g. "210-211, altF, Sector 142, Noida, Uttar Pradesh 201304, India"
  schedule: EmployeeSchedule;
  status: 'ACTIVE' | 'PAUSED' | 'NEEDS_REAUTH';
  lastTokenRefresh?: string;
  lastCheckIn?: string;
  lastCheckOut?: string;
  todayPunch?: TodayPunchState;
  createdAt: string;
  updatedAt: string;
}

export interface PunchLog {
  _id?: string;
  employeeId: number;
  employeeName: string;
  punchType: 'CHECK_IN' | 'CHECK_OUT';
  punchTime: string; // formatted e.g. "2026-09-10T09:24"
  scheduledTime?: string;
  executedAt: string; // ISO string
  success: boolean;
  httpStatus?: number;
  responsePayload?: unknown;
  error?: string;
  triggerType: 'AUTOMATED' | 'MANUAL';
}
