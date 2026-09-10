# HROne Auto-Attendance System

Automated attendance automation system for **HROne** with sliding-session token persistence, organic humanized schedule jitter, and a full administrative dashboard.

Built with **Next.js 16**, **TypeScript**, **Tailwind CSS**, and **MongoDB**.

---

## Key Features

- **Perpetual Sliding Sessions**: Automatically calls HROne's OAuth2 token refresh endpoint (`/oauth2/token`) before expiry. Each refresh returns a new sliding refresh token (60-day window), eliminating manual re-logins.
- **Humanized Schedule Jitter**:
  - Morning Check-In: Random minute between **09:00 AM – 10:00 AM** (e.g. 09:14, 09:27, 09:41).
  - Evening Check-Out: Random minute between **06:00 PM – 08:00 PM** (e.g. 18:23, 18:48, 19:35).
  - Skips weekends automatically.
- **1-Click Onboarding**: Add team members by simply pasting their HROne attendance cURL or cookie from browser DevTools. The system auto-extracts `employeeId`, tokens, username, domain, and geolocation.
- **Live Administrative Dashboard**:
  - Employee status cards (Autopilot ON/Paused, token health, today's schedule).
  - Manual trigger controls ("Punch In Now", "Punch Out Now", "Refresh Token").
  - Real-time audit log with HTTP status codes and HROne responses.
- **Autonomous Background Worker**: Runs as a daemon to check schedules every minute and execute punches on time.

---

## Project Structure

```
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── cron/trigger/route.ts   # Automated cron trigger endpoint
│   │   │   ├── employees/              # Employee CRUD & actions
│   │   │   │   ├── route.ts            # List all & 1-click onboard
│   │   │   │   └── [id]/               # Individual employee actions
│   │   │   │       ├── route.ts        # GET, PUT, DELETE
│   │   │   │       ├── punch/route.ts  # Manual punch trigger
│   │   │   │       └── refresh/route.ts# Manual token refresh
│   │   │   └── logs/route.ts           # Punch execution audit logs
│   │   ├── layout.tsx
│   │   └── page.tsx                    # Next.js Web Dashboard UI
│   ├── lib/
│   │   ├── db/
│   │   │   ├── employees.ts            # MongoDB operations for employees
│   │   │   └── logs.ts                 # MongoDB operations for punch logs
│   │   ├── hrone/
│   │   │   ├── parser.ts               # cURL & JWT credential parser
│   │   │   ├── punch.ts                # Attendance request executor
│   │   │   └── token.ts                # Sliding token refresh service
│   │   ├── types/
│   │   │   └── employee.ts             # TypeScript interfaces
│   │   └── mongodb.ts                  # MongoDB Atlas client singleton
│   └── worker/
│       └── scheduler.ts                # Autonomous attendance daemon worker
└── scripts/
    └── seed.ts                         # Initial employee onboarding utility
```

---

## Getting Started

### 1. Environment Variables

Create `.env.local`:

```env
MONGODB_URI="mongodb+srv://<username>:<password>@cluster0.z40goxj.mongodb.net/test?retryWrites=true&w=majority&appName=Cluster0"
MONGODB_DB="test"
CRON_SECRET="your_optional_secret_token"
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to access the dashboard.

### 4. Run the Autonomous Scheduler Worker

To keep attendance marking 100% automated while employees are away:

```bash
npm run worker
```

Or using PM2 for production:

```bash
pm2 start "npm run worker" --name "hrone-worker"
```

---

## Enrolling an Employee

1. Log in to [https://app.hrone.cloud](https://app.hrone.cloud) in Google Chrome.
2. Open **DevTools (F12)** → **Network** tab.
3. Punch attendance once (or refresh the page).
4. Right-click the request to `Attendance/Request` or `oauth2/token` → **Copy as cURL**.
5. On the dashboard, click **"Add / Import Employee"**, paste the cURL, and click **Auto-Detect & Enroll**.
