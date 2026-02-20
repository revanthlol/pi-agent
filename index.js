// pi-agent/index.js - V6 Modular Architecture
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode-terminal');

// ==================== MODULES ====================
const logger = require('./modules/logger');
const utils = require('./modules/utils');
const jobHandler = require('./modules/job-handler');
const socketClient = require('./modules/socket-client');

// ==================== CONFIG ====================
const CONFIG = {
  cloudServer: process.env.CLOUD_URL || 'https://justpri.duckdns.org',
  printerName: process.env.PRINTER_NAME || 'auto',
  kioskId: process.env.KIOSK_ID || `kiosk_${require('os').hostname()}`,
  frontendUrl: process.env.FRONTEND_URL || 'https://qr-wifi-printer.vercel.app',
  tempDir: './print-queue',
  heartbeatInterval: 30000,
  pollInterval: parseInt(process.env.POLL_INTERVAL) || 5000
};

// ==================== STATE ====================
const STATE = {
  currentJob: null,
  printerName: null,
  pendingJobs: new Map(),
  pollCount: 0,
  jobsFetchedToday: 0,
  conversionsToday: 0,
  lastPollTime: null
};

// ==================== SETUP ====================
if (!fs.existsSync(CONFIG.tempDir)) {
  fs.mkdirSync(CONFIG.tempDir);
}

console.log(`
╔════════════════════════════════════════╗
║   DirectPrint Agent V6 Starting...     ║
║   Model: Pull-Based + Modular          ║
║   Kiosk ID: ${CONFIG.kioskId.padEnd(26)}║
║   Cloud: ${CONFIG.cloudServer.padEnd(30)}║
╚════════════════════════════════════════╝
`);

// ==================== INIT ====================
async function initialize() {
  // Check conversion tools
  await utils.checkConversionTools(logger);

  // Generate QR code
  const qrUrl = `${CONFIG.frontendUrl}?kiosk_id=${CONFIG.kioskId}`;
  console.log('\n📱 Scan this QR code to connect:\n');
  qrcode.generate(qrUrl, { small: true });
  console.log(`\n🔗 Or visit: ${CONFIG.frontendUrl}?kiosk_id=${CONFIG.kioskId}\n`);

  // Initialize socket connection
  const socket = socketClient.initSocket(CONFIG.cloudServer, logger);

  // Setup event handlers
  socketClient.setupEventHandlers(
    socket,
    CONFIG.kioskId,
    require('os').hostname(),
    STATE,
    logger
  );

  // Wait for connection then start services
  socket.on('connect', () => {
    // Start job polling
    jobHandler.startPolling(
      CONFIG.cloudServer,
      CONFIG.kioskId,
      CONFIG.pollInterval,
      STATE,
      socket,
      logger
    );

    logger.success('🚀 Agent ready and listening for jobs!\n');
  });

  // Start heartbeat
  socketClient.startHeartbeat(
    socket,
    CONFIG.kioskId,
    CONFIG.heartbeatInterval,
    STATE,
    logger
  );

  // Start status log
  socketClient.startStatusLog(STATE, logger);

  // Start daily reset
  socketClient.startDailyReset(STATE, logger);

  // Start cleanup interval
  startCleanup();

  // Setup graceful shutdown
  setupGracefulShutdown(socket);
}

// ==================== CLEANUP OLD FILES ====================
function startCleanup() {
  setInterval(() => {
    const now = Date.now();
    const files = fs.readdirSync(CONFIG.tempDir);

    files.forEach(file => {
      const filePath = path.join(CONFIG.tempDir, file);
      try {
        const stats = fs.statSync(filePath);
        const ageMinutes = (now - stats.mtimeMs) / 1000 / 60;

        if (ageMinutes > 30) {
          fs.unlinkSync(filePath);
          logger.info(`🗑️  Cleaned up old file: ${file}`);
        }
      } catch (e) {
        // File might have been deleted already
      }
    });
  }, 300000); // 5 minutes
}

// ==================== GRACEFUL SHUTDOWN ====================
function setupGracefulShutdown(socket) {
  process.on('SIGINT', () => {
    logger.warn('\n👋 Shutting down agent...');

    if (STATE.currentJob) {
      logger.warn(`⚠ Warning: Job ${STATE.currentJob} was in progress`);
    }

    if (STATE.pendingJobs.size > 0) {
      logger.warn(`⚠ Warning: ${STATE.pendingJobs.size} job(s) in queue`);
    }

    socket.disconnect();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    logger.warn('\n🛑 Received SIGTERM, shutting down...');
    socket.disconnect();
    process.exit(0);
  });
}

// ==================== START ====================
initialize().catch(error => {
  logger.error(`Fatal error during initialization: ${error.message}`);
  process.exit(1);
});
