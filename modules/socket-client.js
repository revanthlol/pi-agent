// pi-agent/modules/socket-client.js
// Socket.IO connection management, events, and heartbeat

const io = require('socket.io-client');
const printer = require('./printer');

// ==================== SOCKET INITIALIZATION ====================
function initSocket(cloudServer, logger) {
  logger.info('📡 Connecting to cloud...');

  const socket = io(cloudServer, {
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: Infinity
  });

  return socket;
}

// ==================== SOCKET EVENT HANDLERS ====================
function setupEventHandlers(socket, kioskId, hostname, state, logger) {
  
  socket.on('connect', async () => {
    logger.success('Connected to Cloud Hub!');

    try {
      state.printerName = await printer.detectPrinter(process.env.PRINTER_NAME || 'auto', logger);
    } catch (e) {
      logger.warn(`Could not detect printer: ${e.message}`);
    }

    socket.emit('register', {
      kiosk_id: kioskId,
      hostname: hostname,
      printer_name: state.printerName || 'unknown'
    });

    logger.success('Registered with cloud');
  });

  socket.on('disconnect', () => {
    logger.warn('Disconnected from Cloud. Reconnecting...');
  });

  socket.on('reconnect', (attemptNumber) => {
    logger.success(`Reconnected after ${attemptNumber} attempts`);
  });

  socket.on('ping', () => {
    socket.emit('pong', {
      status: 'alive',
      uptime: process.uptime(),
      current_job: state.currentJob,
      pending_count: state.pendingJobs.size,
      poll_count: state.pollCount,
      jobs_fetched_today: state.jobsFetchedToday,
      conversions_today: state.conversionsToday
    });
  });

  socket.on('update_config', (data) => {
    logger.info(`⚙️  Config update received: ${JSON.stringify(data)}`);
  });
}

// ==================== HEARTBEAT ====================
function startHeartbeat(socket, kioskId, heartbeatInterval, state, logger) {
  let lastPrinterStatus = 'unknown';

  const heartbeatId = setInterval(async () => {
    if (!socket.connected) return;

    // Check printer status
    const printerStatusResult = await printer.checkPrinterStatus(state.printerName, logger);

    // Log only if status changed
    if (printerStatusResult.status !== lastPrinterStatus) {
      logger.info(`🖨️  Printer status: ${printerStatusResult.status} (${printerStatusResult.detail || 'ok'})`);
      lastPrinterStatus = printerStatusResult.status;
    }

    socket.emit('heartbeat', {
      kiosk_id: kioskId,
      uptime: process.uptime(),
      printer_status: state.printerName ? 'ready' : 'no_printer',
      printer_ipp_status: printerStatusResult.status,
      printer_ipp_detail: printerStatusResult.detail,
      current_job: state.currentJob,
      pending_jobs: state.pendingJobs.size,
      memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      poll_count: state.pollCount,
      jobs_fetched_today: state.jobsFetchedToday,
      conversions_today: state.conversionsToday,
      last_poll: state.lastPollTime
    });
  }, heartbeatInterval);

  return heartbeatId;
}

// ==================== STATUS LOG ====================
function startStatusLog(state, logger) {
  const logId = setInterval(() => {
    logger.info(
      `💚 Agent alive | ` +
      `Uptime: ${Math.floor(process.uptime())}s | ` +
      `Polls: ${state.pollCount} | ` +
      `Fetched: ${state.jobsFetchedToday} | ` +
      `Conversions: ${state.conversionsToday} | ` +
      `Pending: ${state.pendingJobs.size}`
    );
  }, 60000);

  return logId;
}

// ==================== DAILY RESET ====================
function startDailyReset(state, logger) {
  const resetId = setInterval(() => {
    const now = new Date();
    if (now.getHours() === 0 && now.getMinutes() === 0) {
      state.jobsFetchedToday = 0;
      state.conversionsToday = 0;
      state.pollCount = 0;
      logger.info('📊 Daily counters reset');
    }
  }, 60000);

  return resetId;
}

module.exports = {
  initSocket,
  setupEventHandlers,
  startHeartbeat,
  startStatusLog,
  startDailyReset
};
