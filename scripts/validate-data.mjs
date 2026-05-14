import fs from 'node:fs';

const items = JSON.parse(fs.readFileSync(new URL('../data/items.json', import.meta.url), 'utf8'));
const required = ['id', 'title', 'deadline', 'status', 'url'];
const statuses = new Set(['upcoming', 'ongoing', 'ended', 'open', 'closed']);
let errors = 0;

if (!Array.isArray(items)) {
  console.error('data/items.json must be an array');
  process.exit(1);
}

const ids = new Set();
for (const [index, item] of items.entries()) {
  for (const key of required) {
    if (!item[key]) {
      console.error(`item ${index} missing required field: ${key}`);
      errors++;
    }
  }
  if (item.id) {
    if (ids.has(item.id)) {
      console.error(`duplicate id: ${item.id}`);
      errors++;
    }
    ids.add(item.id);
  }
  if (item.deadline && Number.isNaN(Date.parse(item.deadline))) {
    console.error(`invalid deadline for ${item.id}: ${item.deadline}`);
    errors++;
  }
  if (item.status && !statuses.has(item.status)) {
    console.error(`invalid status for ${item.id}: ${item.status}`);
    errors++;
  }
  if (item.url && item.url !== '#') {
    try { new URL(item.url); } catch {
      console.error(`invalid url for ${item.id}: ${item.url}`);
      errors++;
    }
  }
}

if (errors > 0) process.exit(1);
console.log(`validated ${items.length} DDL items`);
