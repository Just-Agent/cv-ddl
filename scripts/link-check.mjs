import fs from 'node:fs';

const items = JSON.parse(fs.readFileSync(new URL('../data/items.json', import.meta.url), 'utf8'));
const strict = process.env.STRICT_LINK_CHECK === 'true';
const allowedStatuses = new Set([200, 201, 202, 204, 301, 302, 303, 307, 308, 401, 403, 405, 429]);
let failures = 0;

async function check(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    let response = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: controller.signal });
    if (response.status === 405) {
      response = await fetch(url, { method: 'GET', redirect: 'follow', signal: controller.signal });
    }
    return response.status;
  } finally {
    clearTimeout(timeout);
  }
}

for (const item of items) {
  if (!item.url || item.url === '#' || item.url.startsWith('mailto:')) continue;
  try {
    const status = await check(item.url);
    if (!allowedStatuses.has(status)) {
      console.warn(`warn ${item.id}: ${status} ${item.url}`);
      if (strict) failures++;
    } else {
      console.log(`ok ${item.id}: ${status}`);
    }
  } catch (error) {
    console.warn(`warn ${item.id}: ${error.message} ${item.url}`);
    if (strict) failures++;
  }
}

if (failures > 0) process.exit(1);
