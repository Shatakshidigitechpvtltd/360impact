import { mkdirSync, writeFileSync } from 'node:fs';
import { legacyRedirects } from './redirects.mjs';

const value = process.env.BACKEND_ORIGIN?.trim() || '';
let origin;
try {
  origin = new URL(value);
} catch {
  throw new Error('Set BACKEND_ORIGIN to your deployed Node.js HTTPS origin.');
}
if (origin.protocol !== 'https:' || ![origin.origin, origin.origin + '/'].includes(value) ||
    ['360degreeimpact.in', 'www.360degreeimpact.in', 'localhost'].includes(origin.hostname)) {
  throw new Error('BACKEND_ORIGIN must be a separate HTTPS host without a path, query, or credentials.');
}

const rules = [...legacyRedirects].map(([from, to]) => `${from} ${to} 301!`);
rules.push(`/* ${origin.origin}/:splat 200!`);
const output = new URL('./netlify-dist/', import.meta.url);
mkdirSync(output, {recursive:true});
writeFileSync(new URL('_redirects', output), rules.join('\n') + '\n');
