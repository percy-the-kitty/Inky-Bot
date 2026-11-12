
'use strict';

const fs = require('node:fs');

const token = process.env.YAPPER_BOT_TOKEN;
const base = 'https://www.yapper.website/api/bot/v1';

if (!token || !token.startsWith('yb_')) {
  console.error('[Inky] Missing YAPPER_BOT_TOKEN');
  process.exit(1);
}

let cursor = null;
let quit = false;
let failures = 0;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const replies = [
  'Mew...? (What do you want?)',
  'Mrrp! (Oh, hello there!)',
  'Meow~ (You called me?)',
  'Prrrr... (I like you. Maybe.)',
  'Nya! (Pay attention to me!)',
  'Hissss! (You startled me!)',
  'Mrow? (What are you looking at?)',
  'Mew! (I heard you!)',
  'Prrr... (I could use a little attention.)'
];

async function request(method, url, body) {
  const res = await fetch(base + url, {
    method,
    headers: {
      Authorization: 'Bot ' + token,
      'Content-Type': 'application/json'
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(40000)
  });

  const txt = await res.text();
  let data = {};

  try {
    data = JSON.parse(txt);
  } catch {}

  if (!res.ok) {
    const error = new Error(data.error || 'HTTP ' + res.status);
    error.status = res.status;
    error.retry = 1000 * Math.max(
      2,
      Number(res.headers.get('retry-after')) || 3
    );
    throw error;
  }

  return data;
}

async function init() {
  const me = await request('GET', '/me');

  console.log(
    '[Inky] Signed in as',
    me.username || me.display_name || me.id
  );

  try {
    cursor = String(
      fs.readFileSync('yapin-cursor.txt', 'utf8')
    ).trim() || null;
  } catch {}

  if (!cursor) {
    const data = await request('GET', '/events?after=0&wait=0');
    cursor = String(data.last || 0);
  }

  console.log('[Inky] Listening for her name!');
}

function isInkyCalled(message) {
  return /\binky(?:\s+the\s+kitty)?\b|@InkyTheKitty_0823/i.test(message);
}

async function poll() {
  const data = await request(
    'GET',
    '/events?after=' + encodeURIComponent(cursor) +
    '&wait=25&max_age=900'
  );

  for (const event of data.events || []) {
    if (event.type !== 'message') continue;

    const message = event.data || {};

    if (message.author_bot || !message.channel_id) continue;

    const content = String(message.content || '');

    if (!isInkyCalled(content)) continue;

    const reply = replies[
      Math.floor(Math.random() * replies.length)
    ];

    try {
      await request(
        'POST',
        '/channels/' + encodeURIComponent(message.channel_id) +
        '/messages',
        {
          content: reply,
          reply_to: message.id
        }
      );

      console.log('[Inky] Replied to someone who called her!');
    } catch (error) {
      console.error('[Inky] Reply error:', error.message);
    }
  }

  cursor = String(data.last ?? cursor);

  try {
    fs.writeFileSync('yapin-cursor.txt', cursor);
  } catch {}
}

process.on('SIGTERM', () => quit = true);
process.on('SIGINT', () => quit = true);

(async () => {
  while (!quit) {
    try {
      if (cursor === null) await init();

      await poll();
      failures = 0;
    } catch (error) {
      console.error('[Inky] Worker:', error.message);

      if (error.status === 401 || error.status === 403) {
        process.exitCode = 1;
        break;
      }

      failures++;

      await sleep(
        error.status === 429 || error.status === 503
          ? error.retry
          : Math.min(30000, 1500 * 2 ** Math.min(failures, 5))
      );
    }
  }
})().catch(error => {
  console.error('[Inky] Fatal error:', error);
  process.exitCode = 1;
});
