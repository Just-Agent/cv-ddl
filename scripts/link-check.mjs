import fs from 'node:fs';

function readJson(url, fallback) {
  try {
    return JSON.parse(fs.readFileSync(url, 'utf8'));
  } catch {
    return fallback;
  }
}

const items = readJson(new URL('../data/items.json', import.meta.url), []);
const sources = readJson(new URL('../data/sources.json', import.meta.url), []);
const strict = process.env.STRICT_LINK_CHECK === 'true';
const requireDetailUrls = process.env.REQUIRE_DETAIL_URLS === 'true';
const allowProtected = process.env.ALLOW_PROTECTED_STATUS !== 'false';
const sourceUrls = new Set(sources.map((source) => source.url).filter((url) => /^https?:\/\//i.test(url || '')));
const baseAllowedStatuses = [200, 201, 202, 204, 301, 302, 303, 307, 308, 405];
const protectedStatuses = [401, 403, 429];
const allowedStatuses = new Set([...baseAllowedStatuses, ...(allowProtected ? protectedStatuses : [])]);
let failures = 0;

function fail(message) {
  if (strict || requireDetailUrls) {
    console.error(message);
    failures++;
  } else {
    console.warn(message);
  }
}

async function check(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.LINK_CHECK_TIMEOUT_MS || 12000));
  try {
    let response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'user-agent': 'Just-DDL Network link checker (+https://github.com/Just-Agent/just-ddl)' },
    });
    if (response.status === 405) {
      response = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: { 'user-agent': 'Just-DDL Network link checker (+https://github.com/Just-Agent/just-ddl)' },
      });
    }
    return response.status;
  } finally {
    clearTimeout(timeout);
  }
}

async function checkRecord(kind, id, url) {
  if (!url || url === '#') {
    fail('warn ' + kind + ' ' + id + ': missing url');
    return;
  }
  if (!/^https?:\/\//i.test(url)) return;
  if (requireDetailUrls && kind === 'item' && sourceUrls.has(url)) {
    fail('warn item ' + id + ': uses source board URL instead of official detail URL: ' + url);
  }
  try {
    const status = await check(url);
    if (!allowedStatuses.has(status)) {
      fail('warn ' + kind + ' ' + id + ': ' + status + ' ' + url);
    } else {
      console.log('ok ' + kind + ' ' + id + ': ' + status);
    }
  } catch (error) {
    fail('warn ' + kind + ' ' + id + ': ' + error.message + ' ' + url);
  }
}

for (const item of items) {
  await checkRecord('item', item.id || item.title || 'unknown', item.url);
}
for (const source of sources) {
  await checkRecord('source', source.id || source.name || 'unknown', source.url);
}

if (failures > 0) process.exit(1);

