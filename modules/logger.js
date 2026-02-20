// pi-agent/modules/logger.js
// Centralized logging with optional color support

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

class Logger {
  constructor(prefix = '') {
    this.prefix = prefix;
  }

  info(message) {
    console.log(`${this.prefix}${message}`);
  }

  success(message) {
    console.log(`${colors.green}✓${colors.reset} ${message}`);
  }

  warn(message) {
    console.warn(`${colors.yellow}⚠${colors.reset} ${message}`);
  }

  error(message) {
    console.error(`${colors.red}✗${colors.reset} ${message}`);
  }

  debug(message) {
    if (process.env.DEBUG) {
      console.log(`${colors.cyan}[DEBUG]${colors.reset} ${message}`);
    }
  }

  section(title) {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`${title}`);
    console.log(`${'='.repeat(50)}`);

  }
}

// Export singleton
module.exports = new Logger();
