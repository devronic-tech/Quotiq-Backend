const crypto = require('crypto');

/**
 * Generate a unique client code e.g. CLI-8K2XFQ91
 */
function generateClientCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // exclude ambiguous chars 0, O, 1, I
  let code = 'CLI-';
  for (let i = 0; i < 8; i++) {
    const randomIndex = crypto.randomInt(0, chars.length);
    code += chars[randomIndex];
  }
  return code;
}

module.exports = { generateClientCode };
