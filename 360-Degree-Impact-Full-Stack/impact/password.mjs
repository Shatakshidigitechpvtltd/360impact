import { randomBytes, scryptSync } from 'node:crypto';
import { readFileSync } from 'node:fs';

const password = readFileSync(0, 'utf8').replace(/\r?\n$/, '');
if (password.length < 16 || password.length > 512) throw new Error('Use a unique password between 16 and 512 characters.');
const salt = randomBytes(16).toString('hex');
console.log(salt + ':' + scryptSync(password, salt, 64).toString('hex'));
