const filters = document.getElementById('mail-filters');
const status = document.getElementById('mail-status');
const list = document.getElementById('mail-list');
const detail = document.getElementById('mail-detail');
const more = document.getElementById('mail-more');
let page = '';
let activeQuery = '';
let latestList = 0;
let latestMessage = 0;

function element(tag, text) {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
}

async function api(path, method = 'GET', data) {
  const response = await fetch('/api/admin/mail' + path, {
    method, headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)
  });
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.error), {status:response.status});
  return result;
}

function showError(error) {
  status.textContent = error.message;
  if (error.status === 401) {
    filters.hidden = detail.hidden = more.hidden = true;
    list.replaceChildren();
    const login = element('a', 'Sign in to the admin dashboard');
    login.href = '/admin';
    status.append(' ', login);
  }
}

async function load(append = false) {
  const sequence = ++latestList;
  if (!append) {
    page = '';
    activeQuery = new URLSearchParams(new FormData(filters)).toString();
  }
  more.disabled = true;
  status.textContent = 'Loading mail…';
  try {
    const params = new URLSearchParams(activeQuery);
    if (append && page) params.set('page', page);
    const result = await api('?' + params);
    if (sequence !== latestList) return;
    if (!append) list.replaceChildren();
    for (const message of result.messages) {
      const button = element('button', '');
      button.type = 'button';
      button.className = 'mail-list-item';
      button.append(element('strong', (message.unread ? 'Unread · ' : '') + (message.subject || '(No subject)')));
      button.append(element('span', message.from || 'Unknown sender'));
      button.addEventListener('click', () => openMessage(message.id));
      list.append(button);
    }
    page = result.next;
    more.hidden = !page;
    filters.hidden = false;
    status.textContent = list.children.length ? '' : 'No messages match this view.';
  } catch (error) {
    if (sequence === latestList) showError(error);
  } finally {
    if (sequence === latestList) more.disabled = false;
  }
}

async function openMessage(id) {
  const sequence = ++latestMessage;
  status.textContent = 'Opening message…';
  try {
    const message = await api('/' + encodeURIComponent(id));
    if (sequence !== latestMessage) return;
    const heading = element('h3', message.subject || '(No subject)');
    heading.tabIndex = -1;
    const sender = element('p', message.from || 'Unknown sender');
    const body = element('p', message.text || message.snippet || 'Open in Gmail to view the full message.');
    body.className = 'mail-text';
    const actions = element('div', '');
    actions.className = 'actions';
    const reply = element('a', 'Open in Gmail');
    reply.className = 'button outline';
    reply.href = 'https://mail.google.com/mail/?authuser=Shatakshidigitechpvtltd%40gmail.com#all/' + encodeURIComponent(message.thread || message.id);
    reply.target = '_blank';
    reply.rel = 'noopener noreferrer';
    actions.append(reply);
    const updateButtons = [];
    for (const [action, label] of [[message.unread ? 'read' : 'unread',message.unread ? 'Mark as read' : 'Mark unread'],['archive','Archive']]) {
      const button = element('button', label);
      updateButtons.push(button);
      button.type = 'button';
      button.className = 'button outline';
      button.addEventListener('click', async () => {
        for (const item of updateButtons) item.disabled = true;
        try {
          await api('/' + encodeURIComponent(id), 'PATCH', {action});
          if (sequence === latestMessage) {
            detail.hidden = true;
            detail.replaceChildren();
          }
          await load();
        } catch (error) {
          showError(error);
        } finally {
          for (const item of updateButtons) item.disabled = false;
        }
      });
      actions.append(button);
    }
    detail.replaceChildren(heading,sender,body,actions);
    detail.hidden = false;
    heading.focus();
    status.textContent = '';
  } catch (error) {
    if (sequence === latestMessage) showError(error);
  }
}

filters.addEventListener('submit', event => {event.preventDefault(); load();});
document.getElementById('mail-refresh').addEventListener('click', () => load());
more.addEventListener('click', () => load(true));
load();
