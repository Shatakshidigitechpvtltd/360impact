import { legacyRedirects } from './redirects.mjs';

const value = process.env.BACKEND_ORIGIN?.trim() || '';
let backend;
try {
  backend = new URL(value);
} catch {
  throw new Error('Set BACKEND_ORIGIN in Vercel to the deployed Node.js HTTPS origin.');
}
if (backend.protocol !== 'https:' || ![backend.origin, backend.origin + '/'].includes(value) ||
    ['360degreeimpact.in','www.360degreeimpact.in','localhost'].includes(backend.hostname) ||
    [process.env.VERCEL_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL].includes(backend.hostname)) {
  throw new Error('BACKEND_ORIGIN must be a separate HTTPS host without a path, query, or credentials.');
}

export const config = {
  framework: null,
  buildCommand: "node -e \"const fs=require('node:fs'); fs.mkdirSync('vercel-dist',{recursive:true}); fs.copyFileSync('public/robots.txt','vercel-dist/robots.txt')\"",
  outputDirectory: 'vercel-dist',
  redirects: [...legacyRedirects].map(([source, destination]) => ({source,destination,permanent:true})),
  rewrites: [{source:'/:path*',destination:backend.origin + '/:path*'}]
};
