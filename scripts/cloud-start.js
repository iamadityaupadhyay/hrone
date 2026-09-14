const { spawn } = require('child_process');

console.log('====================================================');
console.log('       Launching HROne Autonomous Cloud Service     ');
console.log('====================================================');

const port = process.env.PORT || 10000;
console.log(`[Launcher] Starting Next.js Web Dashboard on 0.0.0.0:${port}...`);
const web = spawn(`npx next start -H 0.0.0.0 -p ${port}`, {
  stdio: 'inherit',
  env: { ...process.env, PORT: String(port) },
  shell: true,
});

web.on('exit', (code) => {
  console.log(`[Launcher] Web server exited with code ${code}`);
  if (code !== 0) process.exit(code || 1);
});

// 2. Launch 24/7 Scheduler & WhatsApp Bot
console.log('[Launcher] Starting Autonomous Scheduler & WhatsApp Bot...');
const worker = spawn('npm', ['run', 'worker'], {
  stdio: 'inherit',
  env: { ...process.env },
  shell: true,
});

worker.on('exit', (code) => {
  console.log(`[Launcher] Worker process exited with code ${code}`);
});

const shutdown = () => {
  console.log('[Launcher] Gracefully shutting down services...');
  try {
    web.kill('SIGTERM');
    worker.kill('SIGTERM');
  } catch {
    // ignore
  }
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
