const login = document.getElementById('login');
const signIn = document.getElementById('admin-signin');
const layout = document.getElementById('admin-layout');
const dashboardHeader = layout.querySelector('.admin-header');
const inbox = document.getElementById('inbox');
const status = document.getElementById('status');
const list = document.getElementById('items');
const previous = document.getElementById('previous');
const next = document.getElementById('next');
const tabs = [...document.querySelectorAll('[data-kind]')];
const overview = document.getElementById('overview');
const adminNav = document.getElementById('admin-nav');
const menuToggle = document.getElementById('admin-menu-toggle');
const logout = document.getElementById('logout');
const notifications = document.getElementById('admin-notifications');
const notificationCount = document.getElementById('notification-count');
const notificationStatus = document.getElementById('notification-status');
const notificationButtons = [...notifications.querySelectorAll('[data-notification]')];
const chart = document.getElementById('admin-chart');
const pipelineChart = document.getElementById('pipeline-chart');
const pipelineDonut = document.getElementById('pipeline-donut');
const trendChart = document.getElementById('admin-trend');
const serviceChart = document.getElementById('service-chart');
const overviewStatus = document.getElementById('overview-status');
const filterForm = document.getElementById('admin-filters');
const filterQuery = document.getElementById('filter-query');
const filterStatus = document.getElementById('filter-status');
const filterFollowUp = document.getElementById('filter-follow-up');
const dueView = document.getElementById('admin-due');
const tablePanel = document.getElementById('table-panel');
const tableBody = document.getElementById('admin-table-body');
const options = {enquiry:['new','in-progress','closed'],feedback:['new','published','archived']};
let kind = 'enquiry';
let page = 1;
let hasNextPage = false;
let latestLoad = 0;
let latestOverview = 0;
let filters = {};
let currentItems = [];
let latestNotifications = 0;
let notificationTimer;

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
  latestOverview++;
  latestNotifications++;
  clearInterval(notificationTimer);
  kind = 'enquiry';
  page = 1;
  filters = {};
  currentItems = [];
  hasNextPage = false;
  login.hidden = false;
  login.before(status);
  layout.hidden = true;
  signIn.hidden = false;
  inbox.hidden = true;
  overview.hidden = true;
  adminNav.hidden = true;
  menuToggle.hidden = true;
  menuToggle.setAttribute('aria-expanded', 'false');
  logout.hidden = true;
  notifications.hidden = true;
  notifications.open = false;
  notificationCount.hidden = true;
  chart.replaceChildren();
  pipelineChart.replaceChildren();
  pipelineDonut.replaceChildren();
  trendChart.replaceChildren();
  serviceChart.replaceChildren();
  list.replaceChildren();
  tableBody.replaceChildren();
}

function element(tag, content) {
  const node = document.createElement(tag);
  node.textContent = content;
  return node;
}

function showAdminView(target, focusTarget = false) {
  const isInbox = inbox.contains(target);
  const wasInboxHidden = inbox.hidden;
  overview.hidden = isInbox;
  inbox.hidden = !isInbox;
  menuToggle.setAttribute('aria-expanded', 'false');
  if (target === tablePanel) tablePanel.open = true;
  for (const link of adminNav.querySelectorAll('a[href^="#"]')) {
    const active = link.hash === '#' + target.id;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  }
  syncAdminSelection();
  if (!isInbox) loadOverview();
  else if (wasInboxHidden) markVisibleNotifications();
  if (focusTarget) {
    target.tabIndex = -1;
    target.focus();
  }
}

async function refreshNotifications() {
  if (notifications.hidden || document.hidden) return;
  const sequence = ++latestNotifications;
  try {
    const counts = await api('notifications');
    if (sequence !== latestNotifications) return;
    let total = 0;
    for (const button of notificationButtons) {
      const count = counts[button.dataset.notification];
      button.querySelector('span').textContent = count.toLocaleString();
      button.disabled = count === 0;
      total += count;
    }
    notificationCount.textContent = total > 99 ? '99+' : String(total);
    notificationCount.hidden = total === 0;
    notifications.querySelector('summary').setAttribute('aria-label', total ? 'Notifications, ' + total + ' unread' : 'Notifications');
    notificationStatus.textContent = total ? '' : 'You’re all caught up.';
  } catch (error) {
    if (sequence !== latestNotifications) return;
    if (error.status === 401) showLogin();
    else notificationStatus.textContent = 'Could not refresh notifications.';
  }
}

async function markVisibleNotifications() {
  if (inbox.hidden || document.hidden || !currentItems.length) return;
  const category = filters.follow_up === 'due' ? 'due' : kind;
  const items = currentItems.map(({id, follow_up}) => category === 'due' ? {id, follow_up} : {id});
  try {
    await api('notifications/read', 'POST', {category, items});
    refreshNotifications();
  } catch (error) {
    if (!notifications.hidden && error.status !== 401) notificationStatus.textContent = 'Could not mark notifications as read.';
  }
}

function syncAdminSelection() {
  const due = !inbox.hidden && filters.follow_up === 'due';
  for (const tab of tabs) {
    const active = !inbox.hidden && !due && tab.dataset.kind === kind;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-pressed', String(active));
  }
  dueView.classList.toggle('active', due);
  dueView.setAttribute('aria-pressed', String(due));
}

function renderBreakdown(list, entries, showBars = true) {
  const max = Math.max(1, ...entries.map(entry => entry.count));
  list.replaceChildren(...entries.map(({label, count}) => {
    const row = element('li', '');
    row.append(element('span', label), element('strong', count.toLocaleString()));
    if (showBars) {
      const bar = element('progress', '');
      bar.max = max;
      bar.value = count;
      bar.setAttribute('aria-hidden', 'true');
      row.append(bar);
    }
    return row;
  }));
}

function svgNode(tag, attributes) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  return node;
}

function renderTrend(activity, formatter) {
  const max = Math.max(1, ...activity.map(day => day.count));
  const svg = svgNode('svg', {viewBox:'0 0 420 158', role:'img',
    'aria-label':activity.map(({day,count}) => day + ': ' + count).join(', ')});
  for (const y of [20, 45, 70, 95, 120]) {
    svg.append(svgNode('line', {x1:22,y1:y,x2:398,y2:y,class:'admin-trend-grid'}));
  }
  const points = activity.map(({count}, index) => [22 + index * 376 / 6, 120 - 100 * count / max]);
  svg.append(svgNode('polyline', {points:points.map(point => point.join(',')).join(' '),class:'admin-trend-line'}));
  for (const [index, [x,y]] of points.entries()) {
    const {day, count} = activity[index];
    const dot = svgNode('circle', {cx:x,cy:y,r:4,class:'admin-trend-dot'});
    const title = svgNode('title', {});
    title.textContent = day + ': ' + count;
    dot.append(title);
    const label = svgNode('text', {x,y:143,'text-anchor':'middle'});
    label.textContent = formatter.format(new Date(day + 'T00:00:00Z'));
    svg.append(dot,label);
  }
  trendChart.replaceChildren(svg);
}

function renderPipeline(entries) {
  const total = entries.reduce((sum, entry) => sum + entry.count, 0);
  const svg = svgNode('svg', {viewBox:'0 0 120 120'});
  const ring = {cx:60,cy:60,r:44,pathLength:100,fill:'none','stroke-width':13};
  svg.append(svgNode('circle', {...ring,class:'admin-donut-track'}));
  let offset = 0;
  for (const [index, {count}] of entries.entries()) {
    if (!count) continue;
    const share = count / total * 100;
    svg.append(svgNode('circle', {...ring,class:'admin-donut-segment stage-' + index,
      'stroke-dasharray':share + ' ' + (100 - share),'stroke-dashoffset':-offset,transform:'rotate(-90 60 60)'}));
    offset += share;
  }
  const label = element('strong', total.toLocaleString());
  pipelineDonut.replaceChildren(svg,label);
  renderBreakdown(pipelineChart, entries, false);
}

function renderAnalyst(totals, activity, services) {
  const current = activity.reduce((sum, day) => sum + day.count, 0);
  const previous = activity.reduce((sum, day) => sum + day.previous, 0);
  const percentage = (value, total) => new Intl.NumberFormat(undefined, {
    style:'percent', maximumFractionDigits:1
  }).format(value / total);
  const change = previous ? ' (' + (current > previous ? '+' : '') + percentage(current - previous, previous) + ')' : '';
  const [top] = services;
  const insights = {
    weekly: current.toLocaleString() + ' vs ' + previous.toLocaleString() + ' enquiries' + change,
    closure: totals.total ? percentage(totals.closed, totals.total) + ' of all enquiries are closed' : 'No enquiries yet.',
    service: top ? top.service + ' · ' + top.count.toLocaleString() + ' enquiries' : 'No service enquiries yet.',
    due: totals.due.toLocaleString() + ' open leads due or overdue'
  };
  for (const [key, value] of Object.entries(insights)) {
    document.getElementById('analyst-' + key).textContent = value;
  }
}

async function loadOverview() {
  const sequence = ++latestOverview;
  try {
    const {totals, activity, services} = await api('overview');
    if (sequence !== latestOverview) return;
    for (const [key, value] of Object.entries(totals)) {
      document.getElementById('metric-' + key).textContent = value.toLocaleString();
    }
    document.getElementById('mailbox-count').textContent = totals.new.toLocaleString();
    const maximum = Math.max(1, ...activity.flatMap(day => [day.count, day.previous]));
    const formatter = new Intl.DateTimeFormat(undefined, {weekday:'short', timeZone:'UTC'});
    chart.replaceChildren(...activity.map(({day, count, previous}) => {
      const column = element('li', '');
      const bars = element('span', '');
      bars.className = 'admin-chart-pair';
      bars.setAttribute('aria-hidden', 'true');
      for (const value of [count, previous]) {
        const bar = element('span', '');
        bar.className = 'admin-chart-bar';
        bar.style.setProperty('--fill', (100 * value / maximum) + '%');
        bars.append(bar);
      }
      column.title = day + ': ' + count + ' enquiries, ' + previous + ' on the same day last week';
      column.setAttribute('aria-label', column.title);
      column.append(element('strong', count), bars, element('span', formatter.format(new Date(day + 'T00:00:00Z'))));
      return column;
    }));
    renderTrend(activity, formatter);
    renderPipeline([{label:'New',count:totals.new},{label:'In progress',count:totals.progress},{label:'Closed',count:totals.closed}]);
    renderBreakdown(serviceChart, services.map(({service, count}) => ({label:service,count})));
    if (!services.length) serviceChart.append(element('li', 'No service enquiries yet.'));
    renderAnalyst(totals, activity, services);
    overviewStatus.textContent = '';
  } catch (error) {
    if (sequence !== latestOverview) return;
    if (error.status === 401) showLogin();
    else overviewStatus.textContent = error.message;
  }
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
      refreshNotifications();
      updateTableRow(item);
      if (sequence === latestLoad && (filters.status || filters.follow_up)) {
        await load();
      } else if (!adminNav.hidden) {
        loadOverview();
      }
      if (card.isConnected) status.textContent = 'Status saved.';
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
      item.follow_up = date.value;
      refreshNotifications();
      updateTableRow(item);
      result.textContent = 'Lead details saved.';
      if (sequence === latestLoad && filters.follow_up) await load();
      else if (!adminNav.hidden) loadOverview();
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

function tableValues(item) {
  return [item.name, item.service || '—', item.status.replace('-', ' '), item.follow_up || '—'];
}

function updateTableRow(item) {
  const row = tableBody.querySelector('[data-submission-id="' + item.id + '"]');
  if (row) row.replaceChildren(...tableValues(item).map(value => element('td', value)));
}

async function load(targetKind = kind, targetPage = page, targetFilters = filters) {
  const sequence = ++latestLoad;
  status.textContent = 'Loading…';
  previous.disabled = true;
  next.disabled = true;
  try {
    const query = new URLSearchParams({kind:targetKind, page:targetPage, ...targetFilters});
    const result = await api('submissions?' + query);
    if (sequence !== latestLoad) return;
    kind = targetKind;
    page = targetPage;
    filters = targetFilters;
    currentItems = result.items;
    hasNextPage = result.more;
    const firstLoad = adminNav.hidden;
    login.hidden = true;
    dashboardHeader.after(status);
    signIn.hidden = true;
    layout.hidden = false;
    adminNav.hidden = false;
    menuToggle.hidden = false;
    logout.hidden = false;
    notifications.hidden = false;
    if (firstLoad) {
      refreshNotifications();
      notificationTimer = setInterval(refreshNotifications, 30000);
    }
    document.getElementById('inbox-title').textContent = kind === 'enquiry' ? 'Enquiries' : 'Client feedback';
    filterQuery.value = filters.q || '';
    filterStatus.replaceChildren(new Option('All statuses', ''), ...options[kind].map(value => new Option(value.replace('-', ' '), value)));
    filterStatus.value = filters.status || '';
    document.getElementById('filter-follow-up-label').hidden = kind !== 'enquiry';
    filterFollowUp.value = filters.follow_up || '';
    document.getElementById('unread-view').hidden = !filters.unread;
    if (firstLoad) {
      const target = document.getElementById(location.hash.slice(1));
      showAdminView(target && (overview.contains(target) || inbox.contains(target)) ? target : overview);
      if (overview.hidden) loadOverview();
    } else if (!overview.hidden) {
      loadOverview();
    }
    list.replaceChildren(...result.items.map(render));
    tableBody.replaceChildren(...result.items.map(item => {
      const row = element('tr', '');
      row.dataset.submissionId = item.id;
      row.append(...tableValues(item).map(value => element('td', value)));
      return row;
    }));
    if (!result.items.length) {
      const row = element('tr', '');
      const cell = element('td', 'No results to display.');
      cell.colSpan = 4;
      row.append(cell);
      tableBody.append(row);
    }
    if (!result.items.length) list.append(element('p',Object.values(filters).some(Boolean) ? 'No submissions match these filters.' : 'No submissions yet.'));
    previous.disabled = page <= 1;
    next.disabled = !hasNextPage;
    next.textContent = filters.unread ? 'Next unread' : 'Next';
    document.getElementById('page').textContent = 'Page ' + page;
    syncAdminSelection();
    status.textContent = '';
    if (!firstLoad) markVisibleNotifications();
    return true;
  } catch (error) {
    if (sequence !== latestLoad) return;
    if (error.status === 401 || adminNav.hidden) showLogin();
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

logout.addEventListener('click', async () => {
  try {
    await api('logout','POST');
    showLogin();
    status.textContent = 'Signed out.';
    login.querySelector('input').focus();
  } catch (error) {
    if (error.status === 401) showLogin();
    status.textContent = error.message;
  }
});

for (const tab of tabs) tab.addEventListener('click', async () => {
  if (await load(tab.dataset.kind, 1, {})) showAdminView(document.getElementById('inbox-title'), true);
});
dueView.addEventListener('click', async () => {
  if (await load('enquiry', 1, {follow_up:'due'})) showAdminView(document.getElementById('inbox-title'), true);
});
filterForm.addEventListener('submit', event => {
  event.preventDefault();
  load(kind, 1, {q:filterQuery.value.trim(),status:filterStatus.value,follow_up:filterFollowUp.value});
});
document.getElementById('filter-clear').addEventListener('click', () => load(kind, 1, {}));
document.getElementById('admin-density').addEventListener('click', event => {
  const compact = document.body.classList.toggle('admin-compact');
  event.currentTarget.setAttribute('aria-pressed', String(compact));
});
document.getElementById('admin-search-form').addEventListener('click', () => showAdminView(filterQuery, true));
menuToggle.addEventListener('click', () => {
  menuToggle.setAttribute('aria-expanded', String(menuToggle.getAttribute('aria-expanded') !== 'true'));
});
adminNav.addEventListener('click', event => {
  const link = event.target.closest('a[href^="#"]');
  if (!link) return;
  const target = document.getElementById(link.hash.slice(1));
  if (!target) return;
  event.preventDefault();
  showAdminView(target, true);
});
previous.addEventListener('click', () => load(kind, page - 1));
next.addEventListener('click', () => load(kind, filters.unread ? 1 : page + 1));
for (const button of notificationButtons) button.addEventListener('click', async () => {
  const category = button.dataset.notification;
  const unreadFilters = category === 'due' ? {follow_up:'due', unread:'1'} : {unread:'1'};
  notifications.open = false;
  if (await load(category === 'feedback' ? 'feedback' : 'enquiry', 1, unreadFilters)) {
    showAdminView(document.getElementById('inbox-title'), true);
    refreshNotifications();
  }
});
document.getElementById('notification-show-all').addEventListener('click', () => {
  const {unread, ...allFilters} = filters;
  load(kind, 1, allFilters);
});
notifications.addEventListener('toggle', () => { if (notifications.open) refreshNotifications(); });
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    refreshNotifications();
    markVisibleNotifications();
  }
});
load();
