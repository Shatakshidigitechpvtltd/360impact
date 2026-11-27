import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isIP } from 'node:net';
import { generateChatAnswer, safeChatText } from './chat.mjs';
import { listMail, mailConfigured, readMail, updateMail } from './mail.mjs';

const configuredOrigin = process.env.PUBLIC_ORIGIN || '';
const bindHost = process.env.HOST || '127.0.0.1';
const origin = configuredOrigin ? new URL(configuredOrigin) : null;
if (origin && (origin.origin !== configuredOrigin || !['http:', 'https:'].includes(origin.protocol))) {
  throw new Error('Set PUBLIC_ORIGIN to the exact website origin without a trailing slash.');
}
const secure = origin?.protocol === 'https:';
if (process.env.NODE_ENV === 'production' && !secure) throw new Error('Set PUBLIC_ORIGIN to your HTTPS website origin.');
const passwordHash = process.env.ADMIN_PASSWORD_HASH || '';
const geminiKey = process.env.GEMINI_API_KEY?.trim();
if (passwordHash && !/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(passwordHash)) throw new Error('Invalid ADMIN_PASSWORD_HASH format.');

const dataFile = process.env.DATA_FILE ? resolve(process.env.DATA_FILE) : fileURLToPath(new URL('./data/impact.sqlite', import.meta.url));
mkdirSync(dirname(dataFile), { recursive: true });
const db = new DatabaseSync(dataFile);
db.exec(`
  PRAGMA journal_mode=WAL;
  PRAGMA busy_timeout=5000;
  CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY, kind TEXT NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL,
    company TEXT NOT NULL, service TEXT NOT NULL, message TEXT NOT NULL,
    rating INTEGER, status TEXT NOT NULL DEFAULT 'new', created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, expires INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS notification_reads (
    submission_id INTEGER NOT NULL,
    event TEXT NOT NULL,
    PRIMARY KEY (submission_id, event)
  );
  CREATE TABLE IF NOT EXISTS limits (
    bucket TEXT NOT NULL, client TEXT NOT NULL, slot INTEGER NOT NULL, hits INTEGER NOT NULL,
    PRIMARY KEY (bucket, client, slot)
  );
`);
db.exec('BEGIN IMMEDIATE');
try {
  const columns = new Set(db.prepare('PRAGMA table_info(submissions)').all().map(column => column.name));
  for (const column of ['notes', 'follow_up']) {
    if (!columns.has(column)) db.exec("ALTER TABLE submissions ADD COLUMN " + column + " TEXT NOT NULL DEFAULT ''");
  }
  db.exec('COMMIT');
} catch (error) {
  db.exec('ROLLBACK');
  throw error;
}
const scryptAsync = promisify(scrypt);
const assets = new Map([
  ['/admin', ['admin.html','text/html']], ['/admin/mail', ['admin-mail.html','text/html']],
  ['/admin-mail.js',['admin-mail.js','text/javascript']],
  ['/app.js',['app.js','text/javascript']], ['/admin.js',['admin.js','text/javascript']],
  ['/style.css',['style.css','text/css']], ['/hero.webp',['hero.webp','image/webp']],
  ['/assets/logo-color.png',['assets/logo-color.png','image/png']], ['/assets/logo-white.png',['assets/logo-white.png','image/png']],
  ['/assets/chat-faq.json',['assets/chat-faq.json','application/json']],
  ['/robots.txt',['robots.txt','text/plain']]
]);
const pages = new Map([
  ['/', ['home', 'Business Communications']],
  ['/services', ['services', 'Services']],
  ['/about', ['about', 'About']],
  ['/expertise', ['expertise', 'Expertise']],
  ['/sectors', ['sectors', 'Sectors']],
  ['/resources', ['resources', 'Resources']],
  ['/faq', ['faq', 'Frequently Asked Questions']],
  ['/feedback', ['reviews', 'Client Feedback']],
  ['/feedback/new', ['feedback', 'Leave Feedback']],
  ['/contact', ['contact', 'Request a Demo']]
]);
const sectionTitles = {
  '/about': {approach:'Our approach'},
  '/services': {messaging:'Messaging channels',voice:'Voice and call handling',automation:'Automation, APIs and setup'},
  '/expertise': {messaging:'Messaging and automation',voice:'Voice and call routing',integration:'Integration and verification'},
  '/sectors': {retail:'Retail and ecommerce',education:'Education and training',professional:'Professional services'},
  '/resources': {channels:'Choose a channel',templates:'Message templates',integration:'Integration brief'}
};
for (const [parent, sections] of Object.entries(sectionTitles)) {
  for (const [section, title] of Object.entries(sections)) {
    pages.set(parent + '/' + section, [pages.get(parent)[0], title, section, parent]);
  }
}

function renderPage(path, service) {
  const [name, title, section, parent] = pages.get(path);
  let content = readFileSync(new URL(`./public/pages/${name}.html`, import.meta.url), 'utf8');
  if (section) {
    const container = name === 'about' || name === 'services' ? 'section' : 'article';
    const blocks = content.matchAll(new RegExp(`<${container}\\b[^>]*>(?:(?!<${container}\\b)[\\s\\S])*?</${container}>`, 'g'));
    const block = [...blocks].find(([markup]) => markup.includes(`id="${section}"`));
    if (block) {
      const inner = block[0].replace(new RegExp(`^<${container}[^>]*>|</${container}>$`, 'g'), '')
        .replace(/<h2([^>]*)>([\s\S]*?)<\/h2>/, '<h1$1>$2</h1>');
      content = `<section class="wrap section interior-page"><p><a href="${parent}">Back to ${parent.slice(1)}</a></p>${inner}</section>`;
    }
  }
  if (name === 'contact' && services.includes(service)) {
    const label = service.replaceAll('&', '&amp;');
    content = content.replace(`<option>${label}</option>`, `<option selected>${label}</option>`);
  }
  const template = readFileSync(new URL('./public/index.html', import.meta.url), 'utf8');
  return template.replace('<title>360° Impact | Business Communications</title>', `<title>360° Impact | ${title}</title>`)
    .replace(`href="${path}">`, `href="${path}" aria-current="page">`)
    .replace('<!-- page-content -->', () => content);
}
const services = ['Bulk SMS','WhatsApp Business API','Missed Call Services','Email Campaigns','Voice Calls','IVR & Cloud Telephony','WhatsApp Chatbots & Automation','OTP & Verification APIs','RCS Business Messaging','API & CRM Integrations','DLT Registration & Template Support','Multiple channels'];
const statuses = { enquiry: ['new','in-progress','closed'], feedback: ['new','published','archived'] };
const dueCondition = "kind='enquiry' AND status!='closed' AND follow_up!='' AND follow_up<=date('now','+05:30')";
const notificationTypes = {
  enquiry: {condition:"kind='enquiry'", event:"'enquiry'"},
  feedback: {condition:"kind='feedback'", event:"'feedback'"},
  due: {condition:dueCondition, event:"'due:' || follow_up"}
};

function unreadCondition(type) {
  return `(${type.condition}) AND NOT EXISTS (
    SELECT 1 FROM notification_reads AS read
    WHERE read.submission_id=submissions.id AND read.event=(${type.event})
  )`;
}
const hash = value => createHash('sha256').update(value).digest('hex');
const cookieName = secure ? '__Host-impact_session' : 'impact_session';
const cookiePattern = new RegExp('(?:^|;\\s*)' + cookieName + '=([a-f0-9]{64})(?:;|$)');
const sessionKey = token => hash(passwordHash + ':' + token);

function json(res, status, body) {
  res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
  res.end(JSON.stringify(body));
}

async function body(req) {
  if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    req.resume();
    throw { status:415, message:'Send JSON.' };
  }
  if (Number(req.headers['content-length']) > 16000) {
    req.resume();
    throw {status:413, message:'Submission is too large.'};
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req.iterator({destroyOnReturn:false})) {
    size += chunk.length;
    if (size > 16000) {
      req.resume();
      throw { status:413, message:'Submission is too large.' };
    }
    chunks.push(chunk);
  }
  try {
    const data = JSON.parse(Buffer.concat(chunks));
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error();
    return data;
  } catch {
    throw { status:400, message:'Invalid submission.' };
  }
}

function rateLimit(req, bucket, maximum, global = false) {
  const slot = Math.floor(Date.now() / 600000);
  const forwarded = process.env.TRUST_PROXY === '1' ? req.headers['x-forwarded-for']?.split(',').at(-1)?.trim() : '';
  const client = global ? 'global' : hash(isIP(forwarded || '') ? forwarded : req.socket.remoteAddress || 'unknown');
  db.prepare('DELETE FROM limits WHERE slot < ?').run(slot - 1);
  const {hits} = db.prepare(`INSERT INTO limits VALUES (?, ?, ?, 1)
    ON CONFLICT DO UPDATE SET hits=hits+1 RETURNING hits`).get(bucket, client, slot);
  if (hits > maximum) throw {
    status:429,
    message:'Too many requests. Please try again later.',
    retryAfter:Math.ceil(((slot + 1) * 600000 - Date.now()) / 1000)
  };
}

function tokenFrom(req) {
  const match = (req.headers.cookie || '').match(cookiePattern);
  return match ? sessionKey(match[1]) : '';
}

function sessionCookie(value, age) {
  return `${cookieName}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${secure ? '; Secure' : ''}`;
}

function field(data, name, limit, min = 0) {
  const value = Object.hasOwn(data, name) && typeof data[name] === 'string' ? data[name].trim() : '';
  if (value.length < min || value.length > limit) throw {status:400, message:`Check the ${name} field.`};
  return value;
}

async function route(req, res) {
  if (!configuredOrigin && ['127.0.0.1','::1','localhost'].includes(bindHost) &&
    !/^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/i.test(req.headers.host || '')) {
    req.resume();
    return json(res, 421, {error:'Unexpected host.'});
  }
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const method = req.method;
  if (['GET','HEAD'].includes(method) && pages.has(path)) {
    rateLimit(req, 'public-pages', 90);
    const contents = renderPage(path, url.searchParams.get('service'));
    res.writeHead(200, {'Content-Type':'text/html; charset=utf-8','Content-Length':Buffer.byteLength(contents),'Cache-Control':'no-cache'});
    return res.end(method === 'HEAD' ? undefined : contents);
  }
  if (['GET','HEAD'].includes(method) && assets.has(path)) {
    if (path === '/assets/chat-faq.json') rateLimit(req, 'public-data', 45);
    if (path === '/hero.webp' || path.startsWith('/assets/logo-')) rateLimit(req, 'public-images', 180);
    const [file, mime] = assets.get(path);
    const contents = readFileSync(new URL('./public/' + file, import.meta.url));
    res.writeHead(200, {'Content-Type':mime + (mime.startsWith('image/') ? '' : '; charset=utf-8'),'Content-Length':contents.length,'Cache-Control':mime === 'text/html' ? 'no-store' : 'no-cache'});
    return res.end(method === 'HEAD' ? undefined : contents);
  }
  if (['POST','PATCH'].includes(method)) {
    const expected = configuredOrigin || `http://${req.headers.host}`;
    if (req.headers.origin !== expected || req.headers['sec-fetch-site'] === 'cross-site') {
      req.resume();
      return json(res, 403, {error:'Origin rejected.'});
    }
  }
  if (method === 'GET' && path === '/api/reviews') {
    rateLimit(req, 'public-data', 45);
    return json(res, 200, db.prepare("SELECT name, company, message, rating FROM submissions WHERE kind='feedback' AND status='published' ORDER BY id DESC LIMIT 12").all());
  }
  if (method === 'POST' && path === '/api/chat') {
    if (!geminiKey) return json(res, 503, {error:'AI chat is unavailable. You can still use the service list or send an enquiry.'});
    const data = await body(req);
    const question = field(data, 'question', 240, 1);
    if (!safeChatText(question)) return json(res, 400, {error:'Please remove phone numbers, codes and confidential details before using AI chat.'});
    const context = Array.isArray(data.context) ? data.context.slice(-3).filter(value =>
      typeof value === 'string' && value.length <= 240 && safeChatText(value)
    ) : [];
    rateLimit(req, 'chat-client', 5);
    rateLimit(req, 'chat-global', 20, true);
    try {
      return json(res, 200, {answer:await generateChatAnswer(geminiKey, question, context)});
    } catch {
      return json(res, 503, {error:'AI chat is temporarily unavailable. Please try again later or send an enquiry.'});
    }
  }
  if (method === 'POST' && ['/api/enquiries','/api/feedback'].includes(path)) {
    rateLimit(req, 'submit', 12);
    const data = await body(req);
    if (data.website) return json(res, 201, {ok:true});
    const kind = path === '/api/feedback' ? 'feedback' : 'enquiry';
    const name = field(data, 'name', 100, 2);
    const email = field(data, 'email', 254, 5);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(res, 400, {error:'Enter a valid email address.'});
    const company = field(data, 'company', 120);
    const message = field(data, 'message', 2500, 10);
    const service = kind === 'enquiry' ? field(data, 'service', 80, 1) : '';
    const rating = kind === 'feedback' && (typeof data.rating === 'number' || typeof data.rating === 'string')
      ? Number(data.rating) : null;
    if (kind === 'enquiry' && !services.includes(service)) return json(res, 400, {error:'Select a listed service.'});
    if (kind === 'feedback' && (!Number.isInteger(rating) || rating < 1 || rating > 5 || data.consent !== 'yes')) {
      return json(res, 400, {error:'Select a rating and confirm publication consent.'});
    }
    db.prepare('INSERT INTO submissions (kind,name,email,company,service,message,rating) VALUES (?,?,?,?,?,?,?)')
      .run(kind,name,email,company,service,message,rating);
    return json(res, 201, {ok:true});
  }
  if (method === 'POST' && path === '/api/admin/login') {
    if (!passwordHash) return json(res, 503, {error:'Admin setup is required. See the README.'});
    rateLimit(req, 'login', 8);
    rateLimit(req, 'login-global', 60, true);
    const data = await body(req);
    const [salt, digest] = passwordHash.split(':');
    if (typeof data.password !== 'string' || !data.password.length || data.password.length > 512) {
      return json(res, 400, {error:'Enter a valid password.'});
    }
    const supplied = await scryptAsync(data.password, salt, 64);
    if (!timingSafeEqual(Buffer.from(digest,'hex'), supplied)) return json(res, 401, {error:'Invalid password.'});
    const token = randomBytes(32).toString('hex');
    db.prepare('DELETE FROM sessions WHERE expires < ? OR token = ?').run(Date.now(), tokenFrom(req));
    db.prepare('INSERT INTO sessions VALUES (?,?)').run(sessionKey(token), Date.now() + 8 * 3600000);
    res.setHeader('Set-Cookie', sessionCookie(token, 28800));
    return json(res, 200, {ok:true});
  }
  if (path.startsWith('/api/admin/')) {
    const token = tokenFrom(req);
    if (method === 'POST' && path === '/api/admin/logout') {
      if (token) db.prepare('DELETE FROM sessions WHERE token=?').run(token);
      res.setHeader('Set-Cookie', sessionCookie('', 0));
      return json(res, 200, {ok:true});
    }
    if (!passwordHash || !db.prepare('SELECT 1 FROM sessions WHERE token=? AND expires>?').get(token, Date.now())) return json(res, 401, {error:'Sign in to continue.'});
    if (path === '/api/admin/mail' || path.startsWith('/api/admin/mail/')) {
      if (!mailConfigured) return json(res, 503, {error:'Gmail is not connected. Configure Google OAuth to access the mailbox.'});
      rateLimit(req, 'mail', 90, true);
      try {
        if (method === 'GET' && path === '/api/admin/mail') {
          const query = url.searchParams.get('q') || '';
          const view = url.searchParams.get('view') || 'inbox';
          const page = url.searchParams.get('page') || '';
          if (query.length > 200 || page.length > 512 || !['inbox','unread','all'].includes(view)) {
            return json(res, 400, {error:'Invalid mail filters.'});
          }
          return json(res, 200, await listMail({query,view,page}));
        }
        const match = path.match(/^\/api\/admin\/mail\/([a-f0-9]{1,64})$/i);
        if (match && method === 'GET') return json(res, 200, await readMail(match[1]));
        if (match && method === 'PATCH') {
          const {action} = await body(req);
          if (!['read','unread','archive'].includes(action)) return json(res, 400, {error:'Invalid mail action.'});
          return json(res, 200, await updateMail(match[1],action));
        }
      } catch (error) {
        if (error.status) throw error;
        return json(res, 502, {error:'Gmail is unavailable. Check the Google authorization and try again.'});
      }
      return json(res, 404, {error:'Mail route not found.'});
    }
    if (method === 'GET' && path === '/api/admin/notifications') {
      const counts = Object.fromEntries(Object.entries(notificationTypes).map(([category, type]) => [
        category, db.prepare('SELECT count(*) AS count FROM submissions WHERE ' + unreadCondition(type)).get().count
      ]));
      return json(res, 200, counts);
    }
    if (method === 'POST' && path === '/api/admin/notifications/read') {
      const {category, items} = await body(req);
      if (!Object.hasOwn(notificationTypes, category) || !Array.isArray(items) || items.length > 25 ||
        items.some(item => !item || !Number.isSafeInteger(item.id) || item.id < 1 ||
          (category === 'due' && (typeof item.follow_up !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(item.follow_up))))) {
        return json(res, 400, {error:'Invalid notification selection.'});
      }
      const {condition,event} = notificationTypes[category];
      const statement = db.prepare(`INSERT OR IGNORE INTO notification_reads (submission_id,event)
        SELECT id,${event} FROM submissions WHERE id=? AND (${condition})${category === 'due' ? ' AND follow_up=?' : ''}`);
      db.exec('BEGIN');
      try {
        for (const item of items) {
          if (category === 'due') statement.run(item.id, item.follow_up);
          else statement.run(item.id);
        }
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
      return json(res, 200, {ok:true});
    }
    if (method === 'GET' && path === '/api/admin/overview') {
      const totals = db.prepare(`SELECT
        count(*) FILTER (WHERE kind='enquiry') AS total,
        count(*) FILTER (WHERE kind='enquiry' AND status='new') AS new,
        count(*) FILTER (WHERE kind='enquiry' AND status='in-progress') AS progress,
        count(*) FILTER (WHERE kind='enquiry' AND status='closed') AS closed,
        count(*) FILTER (WHERE kind='enquiry' AND status!='closed' AND follow_up!='' AND follow_up<=date('now','+05:30')) AS due,
        count(*) FILTER (WHERE kind='feedback' AND status='new') AS feedback
        FROM submissions`).get();
      const activity = db.prepare(`
        WITH RECURSIVE days(day) AS (
          VALUES(date('now','-6 days'))
          UNION ALL SELECT date(day,'+1 day') FROM days WHERE day < date('now')
        ),
        activity AS (
          SELECT date(created) AS day, count(*) AS count FROM submissions
          WHERE kind='enquiry' AND created >= date('now','-13 days') GROUP BY date(created)
        )
        SELECT days.day, coalesce(current.count,0) AS count, coalesce(previous.count,0) AS previous
        FROM days
        LEFT JOIN activity AS current ON current.day=days.day
        LEFT JOIN activity AS previous ON previous.day=date(days.day,'-7 days')
        ORDER BY days.day`).all();
      const services = db.prepare(`SELECT service, count(*) AS count FROM submissions
        WHERE kind='enquiry' AND service!='' GROUP BY service ORDER BY count DESC, service LIMIT 6`).all();
      return json(res, 200, {totals, activity, services});
    }
    if (method === 'GET' && path === '/api/admin/submissions') {
      const kind = url.searchParams.get('kind');
      const page = Number(url.searchParams.get('page') || 1);
      if (!Object.hasOwn(statuses, kind) || !Number.isSafeInteger(page) || page < 1 || page > 1000000) return json(res, 400, {error:'Invalid view.'});
      const query = (url.searchParams.get('q') || '').trim();
      const stage = url.searchParams.get('status') || '';
      const followUp = url.searchParams.get('follow_up') || '';
      const unread = url.searchParams.get('unread') || '';
      if (query.length > 100 || (stage && !statuses[kind].includes(stage)) ||
        (unread && unread !== '1') || (followUp && (kind !== 'enquiry' || !['due','upcoming','unscheduled'].includes(followUp)))) {
        return json(res, 400, {error:'Invalid filters.'});
      }
      const rows = db.prepare(`SELECT * FROM submissions WHERE kind=?
        AND (?='' OR status=?)
        AND (?='' OR instr(lower(name),lower(?))>0 OR instr(lower(email),lower(?))>0
          OR instr(lower(company),lower(?))>0 OR instr(lower(service),lower(?))>0)
        AND CASE ?
          WHEN 'due' THEN status!='closed' AND follow_up!='' AND follow_up<=date('now','+05:30')
          WHEN 'upcoming' THEN status!='closed' AND follow_up>date('now','+05:30')
          WHEN 'unscheduled' THEN status!='closed' AND follow_up=''
          ELSE 1 END
        ${unread ? 'AND ' + unreadCondition(notificationTypes[followUp === 'due' ? 'due' : kind]) : ''}
        ORDER BY id DESC LIMIT 26 OFFSET ?`)
        .all(kind,stage,stage,query,query,query,query,query,followUp,(page-1)*25);
      return json(res, 200, {items:rows.slice(0,25), more:rows.length>25});
    }
    const match = path.match(/^\/api\/admin\/submissions\/(\d{1,14})$/);
    if (method === 'PATCH' && match) {
      const id = Number(match[1]);
      const current = db.prepare('SELECT kind FROM submissions WHERE id=?').get(id);
      if (!current) return json(res, 404, {error:'Submission not found.'});
      const data = await body(req);
      const hasStatus = Object.hasOwn(data, 'status');
      const hasNotes = Object.hasOwn(data, 'notes');
      const hasFollowUp = Object.hasOwn(data, 'follow_up');
      if ((!hasStatus && !hasNotes && !hasFollowUp) || (current.kind !== 'enquiry' && (hasNotes || hasFollowUp))) {
        return json(res, 400, {error:'Invalid submission update.'});
      }
      if (hasStatus && !statuses[current.kind].includes(data.status)) return json(res, 400, {error:'Invalid status.'});
      if ((hasNotes && typeof data.notes !== 'string') || (hasFollowUp && typeof data.follow_up !== 'string')) {
        return json(res, 400, {error:'Enter valid lead details.'});
      }
      const notes = hasNotes ? field(data, 'notes', 3000) : null;
      const followUp = hasFollowUp ? field(data, 'follow_up', 10) : null;
      if (followUp) {
        const date = new Date(followUp + 'T00:00:00Z');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(followUp) || followUp.startsWith('0000') ||
          !Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== followUp) {
          return json(res, 400, {error:'Enter a valid follow-up date.'});
        }
      }
      db.prepare('UPDATE submissions SET status=COALESCE(?,status), notes=COALESCE(?,notes), follow_up=COALESCE(?,follow_up) WHERE id=?')
        .run(hasStatus ? data.status : null, notes, followUp, id);
      return json(res, 200, {ok:true});
    }
  }
  return json(res, 404, {error:'Page not found.'});
}

const server = createServer({requestTimeout:15000, headersTimeout:10000, maxHeaderSize:16384}, (req,res) => {
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('Cross-Origin-Resource-Policy','same-origin');
  res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  if (secure) res.setHeader('Strict-Transport-Security','max-age=31536000');
  route(req,res).catch(error => {
    if (!error.status) console.error(error);
    if (!res.headersSent && !res.destroyed) {
      if (error.retryAfter) res.setHeader('Retry-After', error.retryAfter);
      json(res,error.status || 500,{error:error.status ? error.message : 'Something went wrong. Try again.'});
    }
  });
});
server.listen(Number(process.env.PORT || 3000),bindHost, () => console.log('360° Impact server ready'));
