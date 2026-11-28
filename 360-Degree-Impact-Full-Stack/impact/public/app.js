async function request(path, method, data) {
  const response = await fetch(path, {
    method,
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify(data)
  });
  if (response.ok) return response.json();
  const result = await response.json().catch(() => null);
  throw new Error(result?.error || 'Request failed. Please try again.');
}

function connectForm(id, path, confirmation) {
  const form = document.getElementById(id);
  if (!form) return;
  const status = form.querySelector('[role=status]');
  const submit = form.querySelector('button');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    submit.disabled = true;
    status.textContent = 'Sending…';
    try {
      await request(path, 'POST', Object.fromEntries(new FormData(form)));
      form.reset();
      status.textContent = confirmation;
    } catch (error) {
      status.textContent = error.message || 'Please try again.';
    } finally {
      submit.disabled = false;
    }
  });
}

connectForm('enquiry', '/api/enquiries', 'Thanks. Your enquiry has been received.');
connectForm('feedback', '/api/feedback', 'Thanks. Your feedback is awaiting review.');
connectForm('chat-demo', '/api/enquiries', 'Thanks. Your demo request has been received.');

const instagramCopy = document.getElementById('copy-instagram-link');
if (instagramCopy && navigator.clipboard) {
  instagramCopy.hidden = false;
  instagramCopy.addEventListener('click', async () => {
    const status = document.getElementById('instagram-copy-status');
    try {
      await navigator.clipboard.writeText('https://360degreeimpact.in/');
      status.textContent = 'Website link copied.';
    } catch {
      status.textContent = 'Copy this link: https://360degreeimpact.in/';
    }
  });
}

const chat = document.getElementById('site-chat');
const chatLauncher = document.getElementById('chat-open');
if (chat && typeof chat.showModal === 'function') {
  const log = document.getElementById('chat-log');
  const question = document.getElementById('chat-question');
  const compose = document.getElementById('chat-compose');
  const screens = [...chat.querySelectorAll('[data-chat-screen]')];
  const serviceList = document.getElementById('chat-services');
  const serviceStatus = document.getElementById('chat-services-status');
  const demoSelect = document.querySelector('#chat-demo select');
  const recentQuestions = [];
  const topics = [
    [/^number$|\b(phone|contact number|mobile number|call us|call you|call the team)\b/i, 'You can reach the team at +91 91674 85843.', 'tel:+919167485843', 'Call +91 91674 85843'],
    [/\b(office|address|location|where are you)\b/i, 'Our contact page lists the Dahisar East, Mumbai office address and work email.', '/contact', 'View contact details'],
    [/\b(about us|about 360|company|who are you)\b/i, '360° Impact helps businesses send customer alerts, run campaigns and handle conversations across messaging, email and voice.', '/about', 'About 360° Impact'],
    [/\b(faq|help guide|resources)\b/i, 'Find answers about choosing channels, requesting a demo and preparing your messaging project.', '/faq', 'Read frequently asked questions'],
    [/\b(demo|contact|quote|pricing|price|cost|enquir\w*|sales|human|email address)\b/i, 'Tell us which services you need. Our team can follow up by email.', '/contact', 'Open enquiry form'],
  ];
  let catalogPromise;
  let faqPromise;
  const normalize = value => value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim();

  function loadChatFaq() {
    faqPromise ??= request('/assets/chat-faq.json', 'GET').then(groups => {
      const entries = new Map();
      for (const group of groups) {
        for (const question of group.questions) entries.set(normalize(question), group);
      }
      return entries;
    }).catch(() => {
      faqPromise = undefined;
      return new Map();
    });
    return faqPromise;
  }

  function loadCatalog() {
    catalogPromise ??= fetch('/services').then(async response => {
      if (!response.ok) throw new Error('Services unavailable');
      const page = new DOMParser().parseFromString(await response.text(), 'text/html');
      const cards = [...page.querySelectorAll('article[data-chat-keywords]')];
      if (!cards.length) throw new Error('Service catalog unavailable');
      return cards.map(card => {
        const link = card.querySelector('.service-title');
        const name = link.textContent.trim();
        return {
          name,
          description: card.querySelector('p').textContent.trim(),
          href: link.getAttribute('href'),
          keywords: [name, ...card.dataset.chatKeywords.split('|')].map(normalize)
        };
      });
    }).catch(error => {
      catalogPromise = undefined;
      throw error;
    });
    return catalogPromise;
  }

  function replyWithLink(response, reply, href, label) {
    response.textContent = reply;
    const link = document.createElement('a');
    link.href = href;
    link.textContent = label;
    response.append(link);
  }

  function serviceChoices(list, catalog) {
    for (const service of catalog) {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = service.name;
      button.dataset.chatTopic = service.name;
      item.append(button);
      list.append(item);
    }
  }

  async function showChatView(name) {
    for (const screen of screens) screen.hidden = screen.dataset.chatScreen !== name;
    compose.hidden = name === 'demo';
    const active = screens.find(screen => screen.dataset.chatScreen === name);
    active.querySelector('h3').focus();
    if (name === 'questions') log.scrollTop = log.scrollHeight;
    if (name === 'services' && !serviceList.children.length) {
      serviceStatus.textContent = 'Loading services…';
      try {
        const catalog = await loadCatalog();
        if (!serviceList.children.length) serviceChoices(serviceList, catalog);
        serviceStatus.textContent = '';
      } catch {
        replyWithLink(serviceStatus, 'Services are temporarily unavailable in chat.', '/services', 'Open Services page');
      }
    }
    if (name === 'demo' && demoSelect.options.length === 2) {
      try {
        const catalog = await loadCatalog();
        if (demoSelect.options.length !== 2) return;
        for (const service of catalog) {
          const option = document.createElement('option');
          option.textContent = service.name;
          demoSelect.add(option, demoSelect.options.length - 1);
        }
      } catch {
        replyWithLink(active.querySelector('[role=status]'), 'Service options could not load.', '/contact', 'Open full enquiry form');
      }
    }
  }

  async function answerChat(value) {
    const text = value.trim();
    if (!text) return;
    const prompt = document.createElement('p');
    prompt.className = 'chat-message chat-question';
    prompt.textContent = text;
    const response = document.createElement('div');
    response.className = 'chat-message';
    log.append(prompt, response);
    log.scrollTop = log.scrollHeight;
    const queryText = normalize(text);
    const faq = (await loadChatFaq()).get(queryText);
    if (faq) {
      replyWithLink(response, faq.answer, '/contact?service=' + encodeURIComponent(faq.service), `Enquire about ${faq.service}`);
      log.scrollTop = log.scrollHeight;
      return;
    }
    const topic = topics.find(([pattern]) => pattern.test(text));
    if (topic) {
      replyWithLink(response, ...topic.slice(1));
      log.scrollTop = log.scrollHeight;
      return;
    }
    try {
      const catalog = await loadCatalog();
      const query = ` ${queryText} `;
      if (/\b(all services|service list|our services|services list|what services|sari services|sabhi services|saari services)\b/i.test(text) || queryText === 'services') {
        response.textContent = 'Choose a service to see what it does.';
        const list = document.createElement('ul');
        list.className = 'chat-service-list';
        serviceChoices(list, catalog);
        response.append(list);
        response.scrollIntoView({block:'start'});
        return;
      }
      let bestMatch;
      let bestLength = 0;
      for (const service of catalog) {
        for (const keyword of service.keywords) {
          if (keyword.length > bestLength && query.includes(` ${keyword} `)) {
            bestMatch = service;
            bestLength = keyword.length;
          }
        }
      }
      if (bestMatch) {
        replyWithLink(response, `${bestMatch.name} — ${bestMatch.description}`, bestMatch.href, `Enquire about ${bestMatch.name}`);
      } else {
        offerAiReply(response, text);
      }
    } catch {
      replyWithLink(response, 'I couldn’t load the service details right now. You can try again or open the Services page.', '/services', 'Open Services');
    }
    log.scrollTop = log.scrollHeight;
  }

  function offerAiReply(response, questionText) {
    replyWithLink(response, 'I couldn’t find a saved answer. You can ask Google Gemini using this question and any earlier AI questions in this chat. Please keep personal details, OTPs and confidential information out of chat.', '/services', 'Browse all services');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chat-suggestion';
    button.textContent = 'Ask Gemini';
    button.addEventListener('click', async () => {
      response.textContent = 'Checking with Gemini…';
      question.focus();
      try {
        const result = await request('/api/chat', 'POST', {question:questionText, context:recentQuestions.slice(-3)});
        recentQuestions.push(questionText);
        if (recentQuestions.length > 3) recentQuestions.shift();
        replyWithLink(response, result.answer, '/contact', 'Send an enquiry');
      } catch (error) {
        replyWithLink(response, error.message || 'AI chat is temporarily unavailable.', '/contact', 'Send an enquiry');
      }
      log.scrollTop = log.scrollHeight;
    }, {once:true});
    response.append(button);
  }

  chatLauncher.addEventListener('click', () => chat.showModal());
  chat.addEventListener('click', event => {
    const view = event.target.closest('[data-chat-view]');
    if (view) showChatView(view.dataset.chatView);
    const topic = event.target.closest('[data-chat-topic]');
    if (topic) {
      showChatView('questions');
      answerChat(topic.dataset.chatTopic);
    }
  });
  compose.addEventListener('submit', event => {
    event.preventDefault();
    if (!question.value.trim()) return;
    showChatView('questions');
    answerChat(question.value);
    question.value = '';
    question.focus();
  });
  chatLauncher.hidden = false;
  if (location.hash === '#chat-open') chat.showModal();
}

const siteMenuToggle = document.getElementById('site-menu-toggle');
const siteNavigation = document.getElementById('site-navigation');
const compactNavigation = matchMedia('(max-width: 1024px)');

function toggleSiteMenu(open) {
  siteMenuToggle.setAttribute('aria-expanded', String(open));
  if (!open) {
    for (const menu of siteNavigation.querySelectorAll('details[open]')) menu.open = false;
  }
}

if (siteMenuToggle && siteNavigation) {
  siteMenuToggle.hidden = false;
  siteMenuToggle.addEventListener('click', () => toggleSiteMenu(siteMenuToggle.getAttribute('aria-expanded') !== 'true'));
  compactNavigation.addEventListener('change', () => toggleSiteMenu(false));
}

document.addEventListener('click', event => {
  const menu = document.querySelector('.nav-menu[open]');
  if (menu && (!menu.contains(event.target) || event.target.closest('a'))) menu.open = false;
  if (compactNavigation.matches && siteMenuToggle?.getAttribute('aria-expanded') === 'true' &&
    !siteMenuToggle.contains(event.target) && (!siteNavigation.contains(event.target) || event.target.closest('a'))) {
    toggleSiteMenu(false);
  }
});

document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  const menu = document.querySelector('.nav-menu[open]');
  if (menu) {
    menu.open = false;
    if (menu.contains(document.activeElement)) menu.querySelector('summary').focus();
  } else if (compactNavigation.matches && siteMenuToggle?.getAttribute('aria-expanded') === 'true') {
    toggleSiteMenu(false);
    siteMenuToggle.focus();
  }
});

const reviews = document.getElementById('reviews-list');
if (reviews) request('/api/reviews','GET').then(items => {
  reviews.replaceChildren();
  if (!items.length) {
    reviews.textContent = 'Published client feedback will appear here.';
    return;
  }
  for (const item of items) {
    const card = document.createElement('article');
    const title = document.createElement('h3');
    const rating = document.createElement('p');
    const comment = document.createElement('p');
    title.textContent = [item.name,item.company].filter(Boolean).join(' · ');
    rating.textContent = item.rating + ' out of 5';
    comment.textContent = item.message;
    card.append(title,rating,comment);
    reviews.append(card);
  }
}).catch(() => { reviews.textContent = 'Feedback is temporarily unavailable.'; });

const hero = document.querySelector('.animated-hero');
if (hero) {
  const heroWord = document.getElementById('hero-word');
  const heroIcon = document.getElementById('hero-icon');
  const iconGlyph = heroIcon.querySelector('span');
  const heroPalettes = [...hero.querySelectorAll('.hero-palettes span')];
  const heroPrimary = hero.querySelector('.hero-primary');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const heroStates = [
    {word:'Message', glyph:'•••', tint:'#e9c22e'},
    {word:'Engage', glyph:'✦', tint:'#f2772f'},
    {word:'Verify', glyph:'✓', tint:'#3fb874'},
    {word:'Automate', glyph:'↻', tint:'#c564c4'}
  ];
  const heroClock = hero.animate([{}, {}], {duration:7000, iterations:Infinity});
  const clamp = value => Math.max(0, Math.min(1, value));
  let frame;
  let displayedState = -1;

  function drawHero() {
    const time = Number(heroClock.currentTime ?? 0);
    const still = reducedMotion.matches;
    const index = still ? 1 : Math.floor(time / 1750) % heroStates.length;
    const slotTime = time % 1750;
    const enter = delay => still ? 1 : 1 - (1 - clamp((slotTime - delay) / 500)) ** 3;
    const leave = still ? 0 : clamp((slotTime - 1330) / 420) ** 3;
    const wordProgress = enter(0);
    const iconProgress = enter(60);
    const cyclePhase = 2 * Math.PI * time / 5600;
    if (index !== displayedState) {
      const {word, glyph, tint} = heroStates[index];
      heroWord.textContent = word;
      iconGlyph.textContent = glyph;
      heroIcon.style.setProperty('--icon', tint);
      displayedState = index;
    }
    heroWord.style.opacity = wordProgress * (1 - leave);
    heroWord.style.transform = `translateY(${.32 * (1 - wordProgress) - .16 * leave}em) scale(${.96 + .04 * wordProgress})`;
    heroWord.style.filter = `blur(${10 * (1 - wordProgress) + 8 * leave}px)`;
    heroIcon.style.opacity = iconProgress * (1 - leave);
    const bob = still ? 0 : Math.sin(cyclePhase);
    heroIcon.style.transform = `translateY(${.28 * (1 - iconProgress) - .16 * leave + .028 * bob}em) scale(${.7 + .3 * iconProgress}) rotate(${-14 * (1 - iconProgress) + 3 * bob}deg)`;

    // Keep the lower palette opaque while the incoming one fades over it.
    const crossfade = !still && time >= 385 && (slotTime < 385 || slotTime >= 1365);
    const incoming = slotTime < 385 ? index : (index + 1) % heroStates.length;
    const outgoing = (incoming + heroStates.length - 1) % heroStates.length;
    const blend = (slotTime < 385 ? slotTime + 385 : slotTime - 1365) / 770;
    for (const [i, layer] of heroPalettes.entries()) {
      layer.style.zIndex = crossfade && i === incoming ? 1 : 0;
      layer.style.opacity = crossfade ? (i === incoming ? blend : Number(i === outgoing)) : Number(i === index);
      layer.style.transform = still ? 'none' : `translate(${2.2 * Math.sin(cyclePhase)}%, ${1.6 * Math.cos(cyclePhase)}%) scale(1.08)`;
    }
    heroPrimary.classList.toggle('hero-highlight', !still && index === 3 && slotTime > 500 && slotTime < 1330);
    if (!still && !document.hidden) frame = requestAnimationFrame(drawHero);
  }

  function syncHeroClock() {
    cancelAnimationFrame(frame);
    if (document.hidden || reducedMotion.matches) heroClock.pause();
    else heroClock.play();
    drawHero();
  }

  document.addEventListener('visibilitychange', syncHeroClock);
  reducedMotion.addEventListener('change', syncHeroClock);
  syncHeroClock();
}
