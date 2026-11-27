const account = 'Shatakshidigitechpvtltd@gmail.com';
const root = 'https://gmail.googleapis.com/gmail/v1/users/me';
const config = {
  client_id: process.env.GMAIL_CLIENT_ID,
  client_secret: process.env.GMAIL_CLIENT_SECRET,
  refresh_token: process.env.GMAIL_REFRESH_TOKEN
};
export const mailConfigured = Object.values(config).every(Boolean);
let access;
let refreshing;

async function google(path, token, options = {}) {
  const response = await fetch(root + path, {
    ...options,
    headers:{Authorization:'Bearer ' + token, 'Content-Type':'application/json'},
    signal:AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error('Gmail request failed');
  return response.json();
}

async function getToken() {
  if (access && access.expires > Date.now()) return access.token;
  refreshing ??= (async () => {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method:'POST',
      body:new URLSearchParams({...config, grant_type:'refresh_token'}),
      signal:AbortSignal.timeout(8000)
    });
    if (!response.ok) throw new Error('Gmail authorization failed');
    const data = await response.json();
    const profile = await google('/profile', data.access_token);
    if (profile.emailAddress?.toLowerCase() !== account.toLowerCase()) throw new Error('Incorrect Gmail account');
    access = {token:data.access_token, expires:Date.now() + Math.max(0, Number(data.expires_in) - 60) * 1000};
    return access.token;
  })().finally(() => { refreshing = undefined; });
  return refreshing;
}

function summarize(message) {
  const header = name => message.payload?.headers?.find(item => item.name.toLowerCase() === name)?.value || '';
  return {
    id:message.id, thread:message.threadId, from:header('from'), subject:header('subject'),
    date:Number(message.internalDate), unread:message.labelIds?.includes('UNREAD') ?? false,
    snippet:message.snippet || ''
  };
}

export async function listMail({query, view, page}) {
  const token = await getToken();
  const params = new URLSearchParams({maxResults:'15'});
  if (view !== 'all') params.set('labelIds', view === 'unread' ? 'UNREAD' : 'INBOX');
  if (query) params.set('q', query);
  if (page) params.set('pageToken', page);
  const result = await google('/messages?' + params, token);
  const headers = new URLSearchParams({format:'metadata'});
  for (const label of ['From','Subject']) headers.append('metadataHeaders', label);
  const messages = await Promise.all((result.messages || []).map(async ({id}) =>
    summarize(await google('/messages/' + encodeURIComponent(id) + '?' + headers, token))
  ));
  return {messages, next:result.nextPageToken || ''};
}

function plainText(part) {
  if (part.mimeType === 'text/plain' && !part.filename && part.body?.data) {
    return Buffer.from(part.body.data, 'base64url').toString('utf8').slice(0, 24000);
  }
  return part.parts?.map(plainText).filter(Boolean).join('\n').slice(0, 24000) || '';
}

export async function readMail(id) {
  const message = await google('/messages/' + id + '?format=full', await getToken());
  return {...summarize(message), text:message.payload ? plainText(message.payload) : ''};
}

export async function updateMail(id, action) {
  const labels = action === 'unread' ? {addLabelIds:['UNREAD']} :
    {removeLabelIds:[action === 'archive' ? 'INBOX' : 'UNREAD']};
  return summarize(await google('/messages/' + id + '/modify', await getToken(), {
    method:'POST',body:JSON.stringify(labels)
  }));
}
