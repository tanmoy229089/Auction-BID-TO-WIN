// Usage: node scripts/hash-password.js "your-new-password"
// Prints ADMIN_PASSWORD_SALT and ADMIN_PASSWORD_HASH to paste into your .env file.

const crypto = require('crypto');
const { hashPassword } = require('../lib/auth');

const password = process.argv[2];
if (!password) {
  console.error('Usage: node scripts/hash-password.js "your-new-password"');
  process.exit(1);
}

const salt = crypto.randomBytes(16).toString('hex');
const hash = hashPassword(password, salt);

console.log('\nAdd these two lines to your .env file:\n');
console.log(`ADMIN_PASSWORD_SALT=${salt}`);
console.log(`ADMIN_PASSWORD_HASH=${hash}`);
console.log('\nThen restart the server for the new password to take effect.\n');
