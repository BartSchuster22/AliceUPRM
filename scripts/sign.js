#!/usr/bin/env node
const { createHash, createHmac } = require('node:crypto');

const [method, path, body, fullKey] = process.argv.slice(2);
if (!method || !path || body === undefined || !fullKey) {
  console.error('usage: sign.js METHOD PATH BODY KEY_PREFIX.KEY_BODY');
  process.exit(1);
}
const [keyPrefix] = fullKey.split('.');
const keyHash = createHash('sha256').update(fullKey).digest('hex');
const ts = Math.floor(Date.now() / 1000);
const canonical = [
  ts.toString(),
  method.toUpperCase(),
  path,
  createHash('sha256').update(body).digest('hex'),
].join('\n');
const sig = createHmac('sha256', keyHash).update(canonical).digest('hex');
console.log(`UPRM-HMAC ${keyPrefix}:${ts}:${sig}`);
