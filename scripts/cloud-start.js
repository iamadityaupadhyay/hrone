const { spawn } = require('child_process');

console.log('====================================================');
console.log('       Launching HROne Autonomous Cloud Service     ');
console.log('====================================================');

const port = process.env.PORT || 10000;
let isShuttingDown = false;
let currentWeb = null;
let currentWorker = null;

// Catch unexpected errors so the launcher master process never dies
process.on('uncaughtException', (err) => {
  console.error('[Launcher Master] Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Launcher Master] Unhandled Rejection:', reason);
});

// 1. Launch Next.js Web Dashboard with memory limits and auto-recovery
function startWebServer() {
  if (isShuttingDown) return;
  console.log(`[Launcher] Starting Next.js Web Dashboard on 0.0.0.0:${port}...`);
  currentWeb = spawn(`npx next start -H 0.0.0.0 -p ${port}`, {
    stdio: 'inherit',
    env: {
      ...process.env,
      PORT: String(port),
      NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --max-old-space-size=220`,
    },
    shell: true,
  });

  currentWeb.on('exit', (code) => {
    console.warn(`[Launcher] Web server exited with code ${code}.`);
    if (!isShuttingDown) {
      console.log('[Launcher] Auto-recovering Web Dashboard in 3 seconds...');
      setTimeout(startWebServer, 3000);
    }
  });
}

// 2. Launch 24/7 Scheduler & WhatsApp Bot with memory limits and auto-recovery
function startWorker() {
  if (isShuttingDown) return;
  console.log('[Launcher] Starting Autonomous Scheduler & WhatsApp Bot...');
  currentWorker = spawn('npx', ['tsx', 'src/worker/scheduler.ts'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      NO_HTTP: '1',
      NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --max-old-space-size=220`,
    },
    shell: true,
  });

  currentWorker.on('exit', (code) => {
    console.warn(`[Launcher] Worker process exited with code ${code}.`);
    if (!isShuttingDown) {
      console.log('[Launcher] Auto-recovering Scheduler & WhatsApp Bot in 3 seconds...');
      setTimeout(startWorker, 3000);
    }
  });
}

// Start both services
startWebServer();
startWorker();

// 3. Keep-Alive Pinger (Pings external URL to keep Render awake when active)
const publicUrl = process.env.RENDER_EXTERNAL_URL || 'https://hrone-99rh.onrender.com';
const PING_INTERVAL = 5 * 60 * 1000; // Every 5 minutes

console.log(`[Keep-Alive] Initializing anti-sleep pinger for ${publicUrl}...`);
setInterval(() => {
  if (isShuttingDown) return;
  try {
    const client = publicUrl.startsWith('https') ? require('https') : require('http');
    client
      .get(publicUrl, (res) => {
        console.log(`[Keep-Alive] Ping ${publicUrl} -> HTTP ${res.statusCode}`);
      })
      .on('error', (err) => {
        console.warn(`[Keep-Alive] Ping notice: ${err.message}`);
      });
  } catch (err) {
    // ignore
  }
}, PING_INTERVAL);

// Graceful shutdown handling
const shutdown = () => {
  isShuttingDown = true;
  console.log('[Launcher] Gracefully shutting down services...');
  try {
    if (currentWeb) currentWeb.kill('SIGTERM');
    if (currentWorker) currentWorker.kill('SIGTERM');
  } catch {
    // ignore
  }
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
