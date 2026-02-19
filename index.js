// pi-agent/index.js - V5 with Document Conversion
require('dotenv').config();
const io = require('socket.io-client');
const axios = require('axios');
const fs = require('fs');
const { exec, execFile } = require('child_process');  // ← FIXED: Added execFile
const path = require('path');
const { PDFDocument } = require('pdf-lib');
const qrcode = require('qrcode-terminal');

// ==================== CONFIG ====================
const CLOUD_SERVER = process.env.CLOUD_URL || 'https://justpri.duckdns.org';
const PRINTER_NAME = process.env.PRINTER_NAME || 'auto';
const KIOSK_ID = process.env.KIOSK_ID || `kiosk_${require('os').hostname()}`;
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://qr-wifi-printer.vercel.app';
const TEMP_DIR = './print-queue';
const HEARTBEAT_INTERVAL = 30000;
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL) || 5000;
const CONVERSION_TIMEOUT = 60000; // 60 seconds for conversion

// ==================== SETUP ====================
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR);

console.log(`
╔════════════════════════════════════════╗
║   DirectPrint Agent V5 Starting...     ║
║   Model: Pull-Based + Conversion       ║
║   Kiosk ID: ${KIOSK_ID.padEnd(26)}║
║   Cloud: ${CLOUD_SERVER.padEnd(30)}║
╚════════════════════════════════════════╝
`);

// Check conversion tools on startup
checkConversionTools();

// ==================== GENERATE QR CODE ====================
const qrUrl = `${FRONTEND_URL}?kiosk_id=${KIOSK_ID}`;

console.log('\n📱 Scan this QR code to connect:\n');
qrcode.generate(qrUrl, { small: true });
console.log(`\n🔗 Or visit: ${FRONTEND_URL}?kiosk_id=${KIOSK_ID}\n`);

// ==================== SOCKET CONNECTION ====================
const socket = io(CLOUD_SERVER, {
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: Infinity
});

// ==================== STATE ====================
let currentJob = null;
let printerName = null;
const pendingJobs = new Map();
let isPolling = false;
let pollCount = 0;
let jobsFetchedToday = 0;
let conversionsToday = 0;
let lastPollTime = null;
let lastPrinterStatus = 'unknown'; 

// ==================== CONVERSION TOOLS CHECK ====================
function checkConversionTools() {
  console.log('🔧 Checking conversion tools...\n');
  
  // Check LibreOffice
  exec('libreoffice --version', (error, stdout) => {
    if (error) {
      console.warn('⚠ LibreOffice not found - document conversion disabled');
      console.warn('   Install: sudo apt install libreoffice-writer');
    } else {
      console.log(`✓ LibreOffice: ${stdout.trim()}`);
    }
  });
  
  // Check ImageMagick
  exec('convert --version', (error, stdout) => {
    if (error) {
      // Try magick command (v7)
      exec('magick --version', (error2, stdout2) => {
        if (error2) {
          console.warn('⚠ ImageMagick not found - image conversion disabled');
          console.warn('   Install: sudo apt install imagemagick');
        } else {
          console.log(`✓ ImageMagick: ${stdout2.split('\n')[0]}`);
        }
      });
    } else {
      console.log(`✓ ImageMagick: ${stdout.split('\n')[0]}`);
    }
  });
  
  console.log('');
}

// ==================== FILE TYPE DETECTION ====================
function getFileType(filename) {
  const ext = path.extname(filename).toLowerCase();
  
  if (ext === '.pdf') return 'pdf';
  if (['.doc', '.docx', '.rtf', '.odt', '.txt', '.md'].includes(ext)) return 'document';
  if (['.png', '.jpg', '.jpeg'].includes(ext)) return 'image';
  
  return 'unknown';
}

// ==================== DOCUMENT CONVERSION ====================
async function convertDocumentToPDF(inputPath) {
  return new Promise((resolve, reject) => {
    const outputDir = path.dirname(inputPath);
    const baseName = path.basename(inputPath, path.extname(inputPath));
    const outputPath = path.join(outputDir, `${baseName}.pdf`);
    
    console.log(`   🔄 Converting document to PDF...`);
    
    const cmd = `libreoffice --headless --convert-to pdf --outdir "${outputDir}" "${inputPath}"`;
    
    exec(cmd, { timeout: CONVERSION_TIMEOUT }, (error, stdout, stderr) => {
      if (error) {
        console.error(`   ✗ Conversion failed: ${stderr}`);
        reject(new Error(`LibreOffice conversion failed: ${stderr || error.message}`));
      } else {
        if (fs.existsSync(outputPath)) {
          const outputSize = fs.statSync(outputPath).size;
          console.log(`   ✓ Converted to PDF (${(outputSize / 1024).toFixed(1)} KB)`);
          resolve(outputPath);
        } else {
          reject(new Error('PDF output file not created'));
        }
      }
    });
  });
}

// ==================== IMAGE CONVERSION ====================
/**
 * Convert image (PNG/JPG/JPEG) → A4 PDF using ImageMagick
 * Works with both ImageMagick v6 (convert) and v7 (magick)
 * Auto-detects correct command path
 */
async function convertImageToPDF(inputPath) {
  return new Promise((resolve, reject) => {
    console.log(`   🔄 Converting image to PDF...`);
    console.log(`   Input: ${inputPath}`);

    // Validate input file exists
    if (!fs.existsSync(inputPath)) {
      return reject(new Error("Input image does not exist"));
    }

    const ext = path.extname(inputPath).toLowerCase();
    if (![".png", ".jpg", ".jpeg"].includes(ext)) {
      return reject(new Error(`Unsupported image format: ${ext}`));
    }

    const outputPath = inputPath.replace(ext, ".pdf");

    // ImageMagick command arguments (same for both v6 and v7)
    const args = [
      inputPath,
      "-resize", "1240x1754>",      // Fit to A4 at 150 DPI, don't upscale
      "-gravity", "center",          // Center the image
      "-background", "white",        // White background
      "-extent", "1240x1754",        // A4 canvas at 150 DPI
      "-units", "PixelsPerInch",
      "-density", "150",             // 150 DPI for good print quality
      outputPath
    ];

    // Try ImageMagick v7 first (magick command)
    const tryMagickV7 = () => {
      console.log(`   🔍 Trying ImageMagick v7 (magick)...`);
      
      exec(`which magick`, (whichError) => {
        if (whichError) {
          console.log(`   ⚠ ImageMagick v7 not found, trying v6...`);
          return tryMagickV6();
        }

        // Found magick, use it
        execFile('magick', args, { timeout: CONVERSION_TIMEOUT }, (error, stdout, stderr) => {
          if (stderr && stderr.trim()) {
            console.warn(`   ⚠ ImageMagick stderr: ${stderr.trim()}`);
          }

          if (error) {
            console.error(`   ✗ ImageMagick v7 failed: ${error.message}`);
            return tryMagickV6();
          }

          if (!fs.existsSync(outputPath)) {
            console.error(`   ✗ PDF output not created`);
            return tryMagickV6();
          }

          const outputSize = fs.statSync(outputPath).size;
          console.log(`   ✓ Converted to PDF (${(outputSize / 1024).toFixed(1)} KB)`);
          resolve(outputPath);
        });
      });
    };

    // Try ImageMagick v6 (convert command)
    const tryMagickV6 = () => {
      console.log(`   🔍 Trying ImageMagick v6 (convert)...`);
      
      exec(`which convert`, (whichError) => {
        if (whichError) {
          return reject(new Error(
            'ImageMagick not found. Install with: sudo apt install imagemagick'
          ));
        }

        // Found convert, use it
        execFile('convert', args, { timeout: CONVERSION_TIMEOUT }, (error, stdout, stderr) => {
          if (stderr && stderr.trim()) {
            console.warn(`   ⚠ ImageMagick stderr: ${stderr.trim()}`);
          }

          if (error) {
            console.error(`   ✗ ImageMagick v6 failed: ${error.message}`);
            return reject(new Error(`Image conversion failed: ${error.message}`));
          }

          if (!fs.existsSync(outputPath)) {
            return reject(new Error('PDF output not created by ImageMagick'));
          }

          const outputSize = fs.statSync(outputPath).size;
          console.log(`   ✓ Converted to PDF (${(outputSize / 1024).toFixed(1)} KB)`);
          resolve(outputPath);
        });
      });
    };

    // Start conversion
    tryMagickV7();
  });
}

// ==================== PRINTER DETECTION ====================
async function detectPrinter() {
  return new Promise((resolve, reject) => {
    if (PRINTER_NAME !== 'auto') {
      console.log(`✓ Using configured printer: ${PRINTER_NAME}`);
      return resolve(PRINTER_NAME);
    }

    exec('lpstat -p -d', (error, stdout, stderr) => {
      if (error) {
        console.error('✗ CUPS not found. Install CUPS: sudo apt install cups');
        return reject('CUPS_NOT_INSTALLED');
      }

      const lines = stdout.split('\n');
      const defaultMatch = lines.find(l => l.startsWith('system default destination:'));
      
      if (defaultMatch) {
        const name = defaultMatch.split(':')[1].trim();
        console.log(`✓ Auto-detected printer: ${name}`);
        resolve(name);
      } else {
        const printerLine = lines.find(l => l.startsWith('printer'));
        if (printerLine) {
          const name = printerLine.split(' ')[1];
          console.log(`✓ Using first available: ${name}`);
          resolve(name);
        } else {
          console.warn('⚠ No printer found');
          reject('NO_PRINTER_FOUND');
        }
      }
    });
  });
}

// ==================== PDF OPERATIONS ====================
async function countPDFPages(filePath) {
  try {
    const dataBuffer = fs.readFileSync(filePath);
    const pdfDoc = await PDFDocument.load(dataBuffer);
    return pdfDoc.getPageCount();
  } catch (e) {
    console.error('⚠ Page count failed:', e.message);
    return 1;
  }
}

// ==================== POLLING FOR JOBS ====================
async function pollForJobs() {
  if (isPolling) return;
  
  if (!socket.connected) {
    if (pollCount % 12 === 0) {
      console.log('⚠ Not connected to cloud, skipping poll');
    }
    pollCount++;
    return;
  }
  
  isPolling = true;
  lastPollTime = new Date();
  
  try {
    const response = await axios.get(`${CLOUD_SERVER}/api/jobs/poll`, {
      params: { kiosk_id: KIOSK_ID },
      timeout: 10000
    });
    
    if (response.data.jobs && response.data.jobs.length > 0) {
      for (const job of response.data.jobs) {
        console.log(`[Poll] New job received: ${job.job_id}`);
        await handlePolledJob(job);
        jobsFetchedToday++;
      }
    } else {
      if (pollCount % 60 === 0) {
        console.log(`[Poll] No jobs available (checked ${pollCount} times)`);
      }
    }
    
    pollCount++;
    
  } catch (error) {
    if (error.response?.status === 400) {
      console.error('[Poll] Bad request - check kiosk_id');
    } else if (error.code === 'ECONNREFUSED') {
      if (pollCount % 12 === 0) {
        console.error('[Poll] Cannot reach server');
      }
    } else if (error.response?.status !== 404) {
      console.error('[Poll] Error:', error.message);
    }
    pollCount++;
  } finally {
    isPolling = false;
  }
}

async function handlePolledJob(job) {
  const { job_id, filename, pages, file_data } = job;
  
  console.log(`\n📄 Processing Job`);
  console.log(`   ID: ${job_id}`);
  console.log(`   File: ${filename}`);
  console.log(`   Expected Pages: ${pages}`);
  
  const tempFile = path.join(TEMP_DIR, `${job_id}_${filename}`);
  
  try {
    // Decode and save file
    const fileBuffer = Buffer.from(file_data, 'base64');
    fs.writeFileSync(tempFile, fileBuffer);
    console.log(`   ✓ File saved locally (${(fileBuffer.length / 1024).toFixed(1)} KB)`);
    
    // Detect file type
    const fileType = getFileType(filename);
    console.log(`   📋 File type: ${fileType}`);
    
    let pdfPath = tempFile;
    
    // Convert to PDF if needed
    if (fileType === 'document') {
      try {
        pdfPath = await convertDocumentToPDF(tempFile);
        conversionsToday++;
      } catch (convError) {
        throw new Error(`Document conversion failed: ${convError.message}`);
      }
    } else if (fileType === 'image') {
      try {
        pdfPath = await convertImageToPDF(tempFile);
        conversionsToday++;
      } catch (convError) {
        throw new Error(`Image conversion failed: ${convError.message}`);
      }
    } else if (fileType === 'pdf') {
      console.log('   ✓ PDF file, no conversion needed');
    } else {
      throw new Error(`Unsupported file type: ${path.extname(filename)}`);
    }
    
    // Verify and count pages
    const actualPages = await countPDFPages(pdfPath);
    console.log(`   ✓ Verified: ${actualPages} pages`);
    
    // Add to local queue
    pendingJobs.set(job_id, {
      job_id,
      filename,
      pages: actualPages,
      filePath: pdfPath,
      originalPath: tempFile,
      receivedAt: new Date(),
      converted: pdfPath !== tempFile
    });
    
    // Execute immediately if not printing
    if (!currentJob) {
      executePrint(job_id);
    } else {
      console.log(`   ⏳ Queued (current job: ${currentJob})`);
    }
    
  } catch (e) {
    console.error('✗ Job processing error:', e.message);
    
    if (socket.connected) {
      socket.emit('print_complete', { 
        job_id,
        success: false,
        error: e.message 
      });
    }
    
    // Cleanup
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    pendingJobs.delete(job_id);
  }
}

async function executePrint(job_id) {
  const pending = pendingJobs.get(job_id);
  
  if (!pending) {
    console.error(`✗ Job ${job_id} not found in pending queue`);
    return;
  }
  
  const { filename, filePath, pages, originalPath, converted } = pending;
  
  console.log(`\n🖨️  Printing Job ${job_id}`);
  console.log(`   File: ${filename}`);
  if (converted) {
    console.log(`   ✓ Converted to PDF`);
  }
  
  currentJob = job_id;
  
  if (socket.connected) {
    socket.emit('print_started', { job_id });
  }
  
  try {
    if (!printerName) {
      printerName = await detectPrinter();
    }
    
    const printCommand = `lp -d ${printerName} "${filePath}"`;
    
    exec(printCommand, (error, stdout, stderr) => {
      if (error) {
        console.error('✗ Print failed:', stderr || error.message);
        
        if (socket.connected) {
          socket.emit('print_complete', { 
            job_id,
            success: false,
            error: stderr || error.message
          });
        }
      } else {
        console.log('✓ Print job sent to CUPS');
        console.log(stdout.trim());
        
        if (socket.connected) {
          socket.emit('print_complete', { 
            job_id,
            success: true,
            pages_printed: pages
          });
        }
        
        console.log(`✓ Job ${job_id} completed\n`);
      }
      
      // Cleanup
      currentJob = null;
      pendingJobs.delete(job_id);
      
      setTimeout(() => {
        // Delete both original and converted files
        try {
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
          if (originalPath && originalPath !== filePath && fs.existsSync(originalPath)) {
            fs.unlinkSync(originalPath);
          }
          console.log(`   🗑️  Cleaned up temp files`);
        } catch (cleanupError) {
          console.warn(`   ⚠ Cleanup error: ${cleanupError.message}`);
        }
      }, 5000);
      
      // Check if more jobs are waiting
      if (pendingJobs.size > 0) {
        const nextJobId = pendingJobs.keys().next().value;
        console.log(`   → Processing next job: ${nextJobId}`);
        executePrint(nextJobId);
      }
    });
    
  } catch (e) {
    console.error('✗ Print execution error:', e.message);
    
    if (socket.connected) {
      socket.emit('print_complete', { 
        job_id,
        success: false,
        error: e.message
      });
    }
    
    currentJob = null;
    pendingJobs.delete(job_id);
  }
}

// ==================== SOCKET EVENTS ====================
socket.on('connect', async () => {
  console.log('✓ Connected to Cloud Hub!');
  
  try {
    printerName = await detectPrinter();
  } catch (e) {
    console.warn('⚠ Could not detect printer:', e);
  }
  
  socket.emit('register', { 
    kiosk_id: KIOSK_ID,
    hostname: require('os').hostname(),
    printer_name: printerName || 'unknown'
  });
  
  console.log('✓ Registered with cloud');
  console.log(`🔄 Polling enabled (every ${POLL_INTERVAL/1000}s)`);
  console.log('🚀 Agent ready and listening for jobs!\n');
});

socket.on('disconnect', () => {
  console.log('⚠ Disconnected from Cloud. Reconnecting...');
});

socket.on('reconnect', (attemptNumber) => {
  console.log(`✓ Reconnected after ${attemptNumber} attempts`);
});

socket.on('ping', () => {
  socket.emit('pong', { 
    status: 'alive', 
    uptime: process.uptime(),
    current_job: currentJob,
    pending_count: pendingJobs.size,
    poll_count: pollCount,
    jobs_fetched_today: jobsFetchedToday,
    conversions_today: conversionsToday
  });
});

socket.on('update_config', (data) => {
  console.log('⚙️  Config update received:', data);
});

// ==================== START POLLING ====================
setInterval(pollForJobs, POLL_INTERVAL);
console.log(`📡 Connecting to cloud...`);

setTimeout(() => {
  console.log('🔄 Starting job polling...');
  pollForJobs();
}, 2000);


// ==================== PRINTER STATUS CHECK ====================
/**
 * Check printer status via lpstat (CUPS)
 * Returns: { status: 'healthy'|'error'|'unknown', detail: string|null }
 */
function checkPrinterStatus(printerName) {
  return new Promise((resolve) => {
    if (!printerName) {
      return resolve({ status: 'unknown', detail: 'no_printer_configured' });
    }

    exec(`lpstat -p ${printerName} 2>&1`, { timeout: 5000 }, (error, stdout) => {
      if (error && !stdout) {
        console.warn(`   ⚠ lpstat failed: ${error.message}`);
        return resolve({ status: 'unknown', detail: 'cups_unavailable' });
      }

      const output = (stdout || '').toLowerCase();

      // Hard errors
      if (output.includes('out of paper') || output.includes('media empty') || output.includes('no media')) {
        return resolve({ status: 'error', detail: 'media-empty' });
      }
      if (output.includes('out of ink') || output.includes('toner empty') || output.includes('ink empty')) {
        return resolve({ status: 'error', detail: 'toner-empty' });
      }
      if (output.includes('cover open') || output.includes('door open')) {
        return resolve({ status: 'error', detail: 'cover-open' });
      }
      if (output.includes('stopped') && !output.includes('idle')) {
        return resolve({ status: 'error', detail: 'stopped' });
      }
      if (output.includes('not connected') || output.includes('offline')) {
        return resolve({ status: 'error', detail: 'offline' });
      }

      // Healthy states
      if (output.includes('idle') || output.includes('processing')) {
        return resolve({ status: 'healthy', detail: null });
      }

      // Unknown/unsupported
      return resolve({ status: 'unknown', detail: 'ipp_unsupported' });
    });
  });
}


// ==================== HEARTBEAT ====================
setInterval(async () => {
  if (!socket.connected) return;

  // Check printer status on every heartbeat
  const printerStatusResult = await checkPrinterStatus(printerName);

  // Log only if status changed (avoid spam)
  if (printerStatusResult.status !== lastPrinterStatus) {
    console.log(`🖨️  Printer status: ${printerStatusResult.status} (${printerStatusResult.detail || 'ok'})`);
    lastPrinterStatus = printerStatusResult.status;
  }

  socket.emit('heartbeat', {
    kiosk_id: KIOSK_ID,
    uptime: process.uptime(),
    printer_status: printerName ? 'ready' : 'no_printer',
    printer_ipp_status: printerStatusResult.status,        // ← NEW
    printer_ipp_detail: printerStatusResult.detail,        // ← NEW
    current_job: currentJob,
    pending_jobs: pendingJobs.size,
    memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    poll_count: pollCount,
    jobs_fetched_today: jobsFetchedToday,
    conversions_today: conversionsToday,
    last_poll: lastPollTime
  });
}, HEARTBEAT_INTERVAL);


// Status log
setInterval(() => {
  if (socket.connected) {
    console.log(`💚 Agent alive | Uptime: ${Math.floor(process.uptime())}s | Polls: ${pollCount} | Fetched: ${jobsFetchedToday} | Conversions: ${conversionsToday} | Pending: ${pendingJobs.size}`);
  }
}, 60000);

// Reset daily counter at midnight
setInterval(() => {
  const now = new Date();
  if (now.getHours() === 0 && now.getMinutes() === 0) {
    jobsFetchedToday = 0;
    conversionsToday = 0;
    pollCount = 0;
    console.log('📊 Daily counters reset');
  }
}, 60000);

// ==================== CLEANUP OLD FILES ====================
setInterval(() => {
  const now = Date.now();
  const files = fs.readdirSync(TEMP_DIR);
  
  files.forEach(file => {
    const filePath = path.join(TEMP_DIR, file);
    try {
      const stats = fs.statSync(filePath);
      const ageMinutes = (now - stats.mtimeMs) / 1000 / 60;
      
      if (ageMinutes > 30) {
        fs.unlinkSync(filePath);
        console.log(`🗑️  Cleaned up old file: ${file}`);
      }
    } catch (e) {
      // File might have been deleted already
    }
  });
}, 300000);

// ==================== GRACEFUL SHUTDOWN ====================
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down agent...');
  
  if (currentJob) {
    console.log(`⚠ Warning: Job ${currentJob} was in progress`);
  }
  
  if (pendingJobs.size > 0) {
    console.log(`⚠ Warning: ${pendingJobs.size} job(s) in queue`);
  }
  
  socket.disconnect();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Received SIGTERM, shutting down...');
  socket.disconnect();
  process.exit(0);
});