// pi-agent/modules/errors.js
// Custom error classes for pi-agent

class AgentError extends Error {
  constructor(message, code = 'AGENT_ERROR') {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }
}

class ConversionError extends AgentError {
  constructor(message, fileType) {
    super(message, 'CONVERSION_ERROR');
    this.fileType = fileType;
  }
}

class PrinterError extends AgentError {
  constructor(message, printerName) {
    super(message, 'PRINTER_ERROR');
    this.printerName = printerName;
  }
}

class JobError extends AgentError {
  constructor(message, jobId) {
    super(message, 'JOB_ERROR');
    this.jobId = jobId;
  }
}

class NetworkError extends AgentError {
  constructor(message) {
    super(message, 'NETWORK_ERROR');
  }
}

module.exports = {
  AgentError,
  ConversionError,
  PrinterError,
  JobError,
  NetworkError
};
