const login = document.getElementById('login');
const inbox = document.getElementById('inbox');
const status = document.getElementById('status');
const list = document.getElementById('items');
const previous = document.getElementById('previous');
const next = document.getElementById('next');
const tabs = [...document.querySelectorAll('[data-kind]')];
const options = {enquiry:['new','in-progress','closed'],feedback:['new','published','archived']};
let kind = 'enquiry';
let page = 1;
let hasNextPage = false;
let latestLoad = 0;

async function api(path, method = 'GET', data) {
  const response = await fetch('/api/admin/' + path, {
    method,
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify(data)
  });
  if (response.ok) return response.json();
  const result = await response.json().catch(() => null);
  throw Object.assign(new Error(result?.error || 'Request failed. Please try again.'), {status:response.status});
}

function showLogin() {
  latestLoad++;
  kind = 'enquiry';
  page = 1;
  hasNextPage = false;
  login.hidden = false;
  inbox.hidden = true;
  list.replaceChildren();
}

function element(tag, content) {
  const node = document.createElement(tag);
  node.textContent = content;
  return node;
}

function render(item) {
  const card = element('article','');
  card.className = 'submission';
  card.append(element('h3',[item.name,item.company].filter(Boolean).join(' · ')));
  card.append(element('p',[item.email,item.service,item.rating ? item.rating + ' out of 5' : '', item.created + ' UTC'].filter(Boolean).join(' · ')));
  card.append(element('p',item.message));
  const label = element('label', item.kind === 'enquiry' ? 'Lead stage ' : 'Status ');
  const select = element('select','');
  for (const value of options[item.kind]) {
    const option = element('option',value.replace('-', ' '));
    option.value = value;
    option.selected = value === item.status;
    select.append(option);
  }
  select.addEventListener('change', async () => {
    const sequence = latestLoad;
    select.disabled = true;
    try {
      await api('submissions/' + item.id,'PATCH',{status:select.value});
      item.status = select.value;
      if (sequence === latestLoad) status.textContent = 'Status saved.';
    } catch (error) {
      select.value = item.status;
      if (sequence !== latestLoad) return;
      if (error.status === 401) showLogin();
      status.textContent = error.message;
    } finally {
      select.disabled = false;
    }
  });
  label.append(select);
  card.append(label);
  if (item.kind === 'enquiry') card.append(renderLeadDetails(item));
  return card;
}

function renderLeadDetails(item) {
  const form = element('form', '');
  form.className = 'lead-details';
  form.method = 'post';
  const notesLabel = element('label', 'Internal notes');
  const notes = element('textarea', '');
  notes.rows = 3;
  notes.maxLength = 3000;
  notes.value = item.notes || '';
  notesLabel.append(notes);
  const dateLabel = element('label', 'Follow-up date');
  const date = element('input', '');
  date.type = 'date';
  date.max = '9999-12-31';
  date.value = item.follow_up || '';
  dateLabel.append(date);
  const save = element('button', 'Save follow-up and notes');
  save.className = 'button outline';
  const result = element('p', '');
  result.className = 'form-status';
  result.setAttribute('role', 'status');
  form.append(notesLabel, dateLabel, save, result);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    save.disabled = true;
    const sequence = latestLoad;
    result.textContent = 'Saving…';
    try {
      await api('submissions/' + item.id, 'PATCH', {notes:notes.value, follow_up:date.value});
      result.textContent = 'Lead details saved.';
    } catch (error) {
      if (error.status === 401 && sequence === latestLoad) {
        showLogin();
        status.textContent = error.message;
      }
      result.textContent = error.message;
    } finally {
      save.disabled = false;
    }
  });
  return form;
}

async function load(targetKind = kind, targetPage = page) {
  const sequence = ++latestLoad;
  status.textContent = 'Loading…';
  previous.disabled = true;
  next.disabled = true;
  try {
    const result = await api('submissions?kind=' + targetKind + '&page=' + targetPage);
    if (sequence !== latestLoad) return;
    kind = targetKind;
    page = targetPage;
    hasNextPage = result.more;
    login.hidden = true;
    inbox.hidden = false;
    list.replaceChildren(...result.items.map(render));
    if (!result.items.length) list.append(element('p','No submissions yet.'));
    previous.disabled = page <= 1;
    next.disabled = !hasNextPage;
    document.getElementById('page').textContent = 'Page ' + page;
    for (const tab of tabs) {
      const active = tab.dataset.kind === kind;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-pressed', String(active));
    }
    status.textContent = '';
  } catch (error) {
    if (sequence !== latestLoad) return;
    if (error.status === 401 || inbox.hidden) showLogin();
    status.textContent = error.status === 401 ? '' : error.message;
    previous.disabled = page <= 1;
    next.disabled = !hasNextPage;
  }
}

login.addEventListener('submit', async event => {
  event.preventDefault();
  const button = login.querySelector('button');
  button.disabled = true;
  try {
    await api('login','POST',Object.fromEntries(new FormData(login)));
    login.reset();
    await load();
  } catch (error) { status.textContent = error.message; }
  finally { button.disabled = false; }
});

document.getElementById('logout').addEventListener('click', async () => {
  try {
    await api('logout','POST');
    showLogin();
    status.textContent = 'Signed out.';
  } catch (error) {
    if (error.status === 401) showLogin();
    status.textContent = error.message;
  }
});

for (const tab of tabs) tab.addEventListener('click', () => load(tab.dataset.kind, 1));
previous.addEventListener('click', () => load(kind, page - 1));
next.addEventListener('click', () => load(kind, page + 1));
load();
