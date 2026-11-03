export interface ScheduleConfig {
  checkInMin: string; // e.g. "09:30"
  checkInMax: string; // e.g. "09:55"
  checkOutMin: string; // e.g. "19:00"
  checkOutMax: string; // e.g. "19:30"
  updatedAt?: string;
  updatedBy?: string;
}

export const DEFAULT_SCHEDULE_CONFIG: ScheduleConfig = {
  checkInMin: '09:30',
  checkInMax: '09:55',
  checkOutMin: '19:00',
  checkOutMax: '19:30',
};
