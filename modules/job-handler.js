// pi-agent/modules/job-handler.js
// Job polling, downloading, conversion, and print execution

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { JobError } = require('./errors');
const utils = require('./utils');
const printer = require('./printer');

// ==================== JOB POLLING ====================
async function pollForJobs(cloudServer, kioskId, state, socket, logger) {
  if (!socket.connected) {
    logger.debug('Not connected to cloud, skipping poll');
    return;
  }

  if (state.currentJob) {
    logger.debug(`Skipping poll - job ${state.currentJob} in progress`);
    return;
  }

  state.pollCount++;
  state.lastPollTime = new Date().toISOString();

  try {
    const response = await axios.get(`${cloudServer}/api/jobs/poll`, {
      params: { kiosk_id: kioskId },
      timeout: 10000
    });

    if (response.data.jobs && response.data.jobs.length > 0) {
      const jobs = response.data.jobs;
      state.jobsFetchedToday += jobs.length;

      for (const job of jobs) {
        state.pendingJobs.set(job.job_id, job);
      }

      if (!state.currentJob && state.pendingJobs.size > 0) {
        const firstJobId = state.pendingJobs.keys().next().value;
        await processJob(firstJobId, state, socket, logger);
      }
    }
  } catch (error) {
    if (error.code !== 'ECONNABORTED') {
      logger.debug(`Poll error: ${error.message}`);
    }
  }
}

// ==================== JOB PROCESSING ====================
async function processJob(jobId, state, socket, logger) {
  const job = state.pendingJobs.get(jobId);
  if (!job) {
    logger.warn(`Job ${jobId} not found in pending queue`);
    return;
  }

  state.currentJob = jobId;
  const tempDir = './print-queue';

  try {
    logger.info(`\n[Poll] New job received: ${jobId}`);
    logger.info(`📄 Processing Job`);
    logger.info(`   ID: ${jobId}`);
    logger.info(`   File: ${job.filename}`);
    logger.info(`   Expected Pages: ${job.pages}`);

    // Decode base64 file data
    const fileBuffer = Buffer.from(job.file_data, 'base64');
    const originalPath = path.join(tempDir, `${jobId}_${job.filename}`);
    
    fs.writeFileSync(originalPath, fileBuffer);
    logger.info(`   ✓ File saved locally (${(fileBuffer.length / 1024).toFixed(1)} KB)`);

    // Emit job received
    if (socket.connected) {
      socket.emit('job_received', { job_id: jobId });
    }

    // Determine file type and convert if needed
    const fileType = utils.getFileType(job.filename);
    logger.info(`   📋 File type: ${fileType}`);

    let finalPdfPath = originalPath;

    if (fileType === 'document') {
      state.conversionsToday++;
      finalPdfPath = await utils.convertDocumentToPDF(originalPath, logger);
    } else if (fileType === 'image') {
      state.conversionsToday++;
      finalPdfPath = await utils.convertImageToPDF(originalPath, logger);
    } else if (fileType === 'pdf') {
      // Already PDF, just verify
      await utils.verifyPDF(originalPath, job.pages, logger);
    } else {
      throw new JobError(`Unsupported file type: ${fileType}`, jobId);
    }

    // Print the document
    if (socket.connected) {
      socket.emit('print_started', { job_id: jobId });
    }

    logger.info(`   ✓ Converted to PDF`);
    
    const printResult = await printer.printDocument(
      state.printerName,
      finalPdfPath,
      job.pages,
      logger
    );

    // Notify success
    if (socket.connected) {
      socket.emit('print_complete', {
        job_id: jobId,
        success: true,
        pages_printed: printResult.pages
      });
    }

    logger.success(`Job ${jobId} completed\n`);

    // Cleanup files after delay
    setTimeout(() => {
      try {
        if (fs.existsSync(finalPdfPath)) fs.unlinkSync(finalPdfPath);
        if (originalPath !== finalPdfPath && fs.existsSync(originalPath)) {
          fs.unlinkSync(originalPath);
        }
        logger.info('   🗑️  Cleaned up temp files');
      } catch (cleanupError) {
        logger.warn(`Cleanup error: ${cleanupError.message}`);
      }
    }, 5000);

  } catch (error) {
    logger.error(`Print execution error: ${error.message}`);

    // Notify failure
    if (socket.connected) {
      socket.emit('print_complete', {
        job_id: jobId,
        success: false,
        error: error.message
      });
    }

  } finally {
    // Clear current job and process next if any
    state.currentJob = null;
    state.pendingJobs.delete(jobId);

    if (state.pendingJobs.size > 0) {
      const nextJobId = state.pendingJobs.keys().next().value;
      logger.info(`   → Processing next job: ${nextJobId}`);
      await processJob(nextJobId, state, socket, logger);
    }
  }
}

// ==================== START POLLING INTERVAL ====================
function startPolling(cloudServer, kioskId, pollInterval, state, socket, logger) {
  logger.info(`🔄 Polling enabled (every ${pollInterval / 1000}s)`);

  // Initial poll after 2 seconds
  setTimeout(() => {
    logger.info('🔄 Starting job polling...');
    pollForJobs(cloudServer, kioskId, state, socket, logger);
  }, 2000);

  // Set up interval
  const intervalId = setInterval(() => {
    pollForJobs(cloudServer, kioskId, state, socket, logger);
  }, pollInterval);

  return intervalId;
}

module.exports = {
  pollForJobs,
  processJob,
  startPolling
};
