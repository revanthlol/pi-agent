#!/usr/bin/env node
// pi-agent/test-modules.js
// Quick validation that all modules load correctly

console.log('🧪 Testing Pi-Agent Modules...\n');

try {
  // Test logger
  console.log('1️⃣  Testing logger...');
  const logger = require('./modules/logger');
  logger.info('   Logger initialized');
  logger.success('   Logger working!');

  // Test errors
  console.log('\n2️⃣  Testing errors...');
  const { AgentError, ConversionError, PrinterError } = require('./modules/errors');
  const testError = new ConversionError('Test conversion failed', 'pdf');
  console.log(`   ✓ Error classes loaded (code: ${testError.code})`);

  // Test utils
  console.log('\n3️⃣  Testing utils...');
  const utils = require('./modules/utils');
  const fileType = utils.getFileType('test.pdf');
  console.log(`   ✓ File type detection working (pdf = ${fileType})`);

  // Test printer
  console.log('\n4️⃣  Testing printer...');
  const printer = require('./modules/printer');
  console.log('   ✓ Printer module loaded');

  // Test job-handler
  console.log('\n5️⃣  Testing job-handler...');
  const jobHandler = require('./modules/job-handler');
  console.log('   ✓ Job handler module loaded');

  // Test socket-client
  console.log('\n6️⃣  Testing socket-client...');
  const socketClient = require('./modules/socket-client');
  console.log('   ✓ Socket client module loaded');

  console.log('\n✅ All modules loaded successfully!');
  console.log('\n📦 Module Structure:');
  console.log('   - logger.js (centralized logging)');
  console.log('   - errors.js (custom error classes)');
  console.log('   - utils.js (file conversions)');
  console.log('   - printer.js (CUPS operations)');
  console.log('   - job-handler.js (job lifecycle)');
  console.log('   - socket-client.js (socket.io management)');
  console.log('\n🚀 Ready to run: node index.js\n');

} catch (error) {
  console.error('❌ Module test failed:', error.message);
  console.error(error.stack);
  process.exit(1);
}
