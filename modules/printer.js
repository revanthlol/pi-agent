// pi-agent/modules/printer.js
// Printer detection, status checking, and print execution via CUPS

const { exec } = require('child_process');
const { PrinterError } = require('./errors');

// ==================== PRINTER DETECTION ====================
async function detectPrinter(printerName, logger) {
  return new Promise((resolve, reject) => {
    if (printerName !== 'auto') {
      logger.success(`Using configured printer: ${printerName}`);
      return resolve(printerName);
    }

    exec('lpstat -p -d', (error, stdout, stderr) => {
      if (error) {
        logger.warn('No printers detected via CUPS');
        logger.warn('Please check: lpstat -p -d');
        return reject(new PrinterError('No printers available', null));
      }

      const lines = stdout.split('\n');
      let defaultPrinter = null;
      const availablePrinters = [];

      lines.forEach(line => {
        if (line.startsWith('system default destination:')) {
          defaultPrinter = line.split(':')[1].trim();
        } else if (line.startsWith('printer ')) {
          const match = line.match(/printer\s+(\S+)/);
          if (match) availablePrinters.push(match[1]);
        }
      });

      if (defaultPrinter) {
        logger.success(`Auto-detected default: ${defaultPrinter}`);
        return resolve(defaultPrinter);
      }

      if (availablePrinters.length > 0) {
        const firstPrinter = availablePrinters[0];
        logger.success(`Using first available: ${firstPrinter}`);
        return resolve(firstPrinter);
      }

      reject(new PrinterError('No printers found', null));
    });
  });
}

// ==================== PRINTER STATUS CHECK ====================
async function checkPrinterStatus(printerName, logger) {
  return new Promise((resolve) => {
    if (!printerName) {
      return resolve({ status: 'unknown', detail: 'no_printer_configured' });
    }

    exec(`lpstat -p ${printerName} 2>&1`, { timeout: 5000 }, (error, stdout) => {
      if (error && !stdout) {
        logger.warn(`lpstat failed: ${error.message}`);
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

// ==================== PRINT EXECUTION ====================
async function printDocument(printerName, filePath, pages, logger) {
  return new Promise((resolve, reject) => {
    logger.info(`\n🖨️  Printing Job`);
    logger.info(`   File: ${filePath.split('/').pop()}`);
    logger.info(`   Pages: ${pages}`);

    const cmd = `lp -d ${printerName} "${filePath}"`;

    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        logger.error(`Print failed: ${stderr || error.message}`);
        reject(new PrinterError(`Print command failed: ${stderr || error.message}`, printerName));
      } else {
        logger.success('Print job sent to CUPS');
        logger.info(stdout.trim());
        resolve({ success: true, pages });
      }
    });
  });
}

module.exports = {
  detectPrinter,
  checkPrinterStatus,
  printDocument
};
