import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const CRAWL_TIMEOUT_MS = Number(process.env.CRAWL_TIMEOUT_MS) || 20000;
const REACHABILITY_TIMEOUT_MS = Number(process.env.REACHABILITY_TIMEOUT_MS) || Math.min(7000, CRAWL_TIMEOUT_MS);
const USER_AGENT = 'Just-DDL-Crawler/1.0 (+https://just-agent.github.io/just-ddl/)';

function extractTitle(html) {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return match ? match[1].trim().slice(0, 200) : null;
}

function fetchViaPowerShell(url) {
  if (process.platform !== 'win32') return null;
  const timeoutSec = Math.max(15, Math.ceil(CRAWL_TIMEOUT_MS / 1000) + 5);
  const escapedUrl = url.replace(/'/g, "''");
  const script = "$ProgressPreference='SilentlyContinue'; [Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false); (Invoke-WebRequest -Uri '" + escapedUrl + "' -UseBasicParsing -TimeoutSec " + timeoutSec + " -Headers @{ 'User-Agent'='Mozilla/5.0'; 'Accept-Language'='en-US,en;q=0.9' }).Content";
  for (const command of ['pwsh', 'powershell']) {
    const result = spawnSync(command, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], {
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
      timeout: (timeoutSec + 5) * 1000
    });
    if (result.status === 0 && result.stdout && result.stdout.trim().length > 1000) {
      return result.stdout;
    }
  }
  return null;
}

async function fetchSourcePage(source) {
  const report = {
    sourceId: source.id,
    source: source.name,
    url: source.url,
    items: [],
    reachable: false,
    httpStatus: null,
    finalUrl: null,
    title: null,
    contentLength: null,
    fetchedAt: new Date().toISOString(),
    note: 'Source reachability check only; curated data/items.json preserved until item parser is implemented.',
    error: null
  };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REACHABILITY_TIMEOUT_MS);
    const res = await fetch(source.url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT }
    });
    clearTimeout(timer);
    report.httpStatus = res.status;
    report.finalUrl = res.url;
    const text = await res.text();
    report.contentLength = text.length;
    report.title = extractTitle(text);
    report.reachable = res.status >= 200 && res.status < 400;
    report.note = report.reachable
      ? 'Source reachable. Curated data/items.json preserved until item parser is implemented.'
      : `Source returned HTTP ${res.status}. Curated data/items.json preserved.`;
  } catch (err) {
    report.error = err.name === 'AbortError' ? `Timeout after ${REACHABILITY_TIMEOUT_MS}ms` : err.message;
    report.note = `Source fetch failed: ${report.error}. Curated data/items.json preserved.`;
  }
  return report;
}

const CVPR_2026_WORKSHOPS_URL = 'https://cvpr.thecvf.com/Conferences/2026/Workshops';
const CVPR_2077AI_URL = 'https://www.2077ai.com/challenge-pages/challenges.html';
const ECCV_EBMV_2026_URL = 'https://eventbasemultimodalvision.github.io/';
const ECCV_EMR_2026_URL = 'https://emr-workshop.github.io/';
const CVPR_WORKSHOPS_MIN_ITEMS = 12;
const CV_MAX_FUTURE_DAYS = Number(process.env.CV_MAX_FUTURE_DAYS) || 700;

const CV_MONTHS = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12
};

function cvDecode(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function cvStripHtml(value) {
  return cvDecode(value)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cvSlug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 90);
}

function cvIsoDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day, 23, 59, 59));
  return date.toISOString().replace('.000Z', 'Z');
}

function cvParseNamedDate(value, fallbackYear = 2026) {
  const text = cvStripHtml(value).replace(/[(),]/g, ' ').replace(/\s+/g, ' ');
  let match = text.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (match) return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]), label: match[0] };
  match = text.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(\d{1,2})(?:\s*[-–]\s*\d{1,2})?,?\s*(20\d{2})?\b/i);
  if (!match) return null;
  const month = CV_MONTHS[match[1].replace('.', '').toLowerCase()];
  if (!month) return null;
  return { year: Number(match[3] || fallbackYear), month, day: Number(match[2]), label: match[0] };
}

function cvIsFutureWithin(iso) {
  const days = (new Date(iso).getTime() - Date.now()) / 86400000;
  return days >= -7 && days <= CV_MAX_FUTURE_DAYS;
}

function cvBuildItem({ idPrefix, title, deadline, dateRange, url, tags, source, stage, description, location }) {
  return {
    id: idPrefix + '-' + cvSlug(title + '-' + dateRange),
    title,
    deadline,
    dateRange,
    location: location || 'Online',
    isOnline: true,
    tags: tags.slice(0, 6),
    url,
    status: 'upcoming',
    description,
    stage,
    source,
    type: 'challenge'
  };
}

async function cvFetchHtml(url, report) {
  let text;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CRAWL_TIMEOUT_MS);
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html', 'Accept-Language': 'en-US,en;q=0.9' }
    });
    clearTimeout(timer);
    report.httpStatus = res.status;
    report.finalUrl = res.url;
    text = await res.text();
    report.reachable = res.status >= 200 && res.status < 400;
  } catch (fetchErr) {
    const fallbackText = fetchViaPowerShell(url);
    if (!fallbackText) throw fetchErr;
    text = fallbackText;
    report.httpStatus = 200;
    report.finalUrl = url;
    report.reachable = true;
    report.note += ' Windows PowerShell fallback was used.';
  }
  report.contentLength = text.length;
  report.title = (text.match(/<title[^>]*>([^<]+)<\/title>/i) || [])[1] || null;
  return text;
}

async function parseCvpr2026WorkshopItems() {
  const report = {
    sourceId: 'cvpr-2026-workshops',
    source: 'CVPR 2026 Workshops',
    url: CVPR_2026_WORKSHOPS_URL,
    items: [],
    reachable: false,
    httpStatus: null,
    finalUrl: null,
    title: null,
    contentLength: null,
    fetchedAt: new Date().toISOString(),
    note: 'CVPR 2026 official workshop/challenge table parser.',
    error: null,
    parsedItemCount: 0,
    invalidItemCount: 0,
    parserHealthy: false
  };
  try {
    const text = await cvFetchHtml(CVPR_2026_WORKSHOPS_URL, report);
    if (!report.reachable) return report;
    const includeRe = /(challenge|challenges|competition|benchmark|ntire|ug2|datacv|mobile ai|embodied reasoning|gigabrain|pvuw|visual arts|agriculture-vision|vizwiz|cvml|image matching|subtle visual|ai4rwc|world models|cv4animals)/i;
    const seen = new Set();
    for (const match of text.matchAll(/<tr[\s\S]*?<\/tr>/gi)) {
      const row = match[0];
      const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(cell => cell[1]);
      if (cells.length < 4) {
        report.invalidItemCount += 1;
        continue;
      }
      const titleLink = cells[0].match(/<a[^>]+href=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/a>/i);
      const title = cvStripHtml(titleLink ? titleLink[2] : cells[0]);
      const href = titleLink ? titleLink[1] : CVPR_2026_WORKSHOPS_URL;
      const acronym = cvStripHtml(cells[1]);
      const when = cvStripHtml(cells[3]);
      const dayMatch = when.match(/\b(Wed|Thu)\b/i);
      if (!title || !dayMatch || !includeRe.test(title + ' ' + acronym)) continue;
      const day = /^wed/i.test(dayMatch[1]) ? 3 : 4;
      const deadline = cvIsoDate(2026, 6, day);
      if (!cvIsFutureWithin(deadline)) continue;
      const id = cvSlug('cvpr-2026-' + (acronym || title));
      if (!id || seen.has(id)) continue;
      seen.add(id);
      report.items.push(cvBuildItem({
        idPrefix: 'cvpr2026',
        title: 'CVPR 2026 - ' + title,
        deadline,
        dateRange: 'June ' + day + ', 2026 (' + when + ')',
        url: new URL(href, CVPR_2026_WORKSHOPS_URL).href,
        tags: ['CVPR 2026', 'challenge', 'workshop', acronym].filter(Boolean),
        source: 'CVPR 2026 Workshops',
        stage: 'Workshop / challenge session',
        description: 'Parsed from the official CVPR 2026 workshops table.',
        location: 'Denver, CO / Online'
      }));
    }
    report.items.sort((a, b) => new Date(a.deadline) - new Date(b.deadline) || a.title.localeCompare(b.title));
    report.parsedItemCount = report.items.length;
    report.parserHealthy = report.parsedItemCount >= CVPR_WORKSHOPS_MIN_ITEMS;
    report.note = 'Parsed ' + report.parsedItemCount + ' CVPR workshop/challenge items; rejected ' + report.invalidItemCount + ' non-table rows.';
  } catch (err) {
    report.error = err.name === 'AbortError' ? 'Timeout after ' + CRAWL_TIMEOUT_MS + 'ms' : err.message;
    report.note = 'CVPR workshop parser failed: ' + report.error;
  }
  return report;
}

async function cvpr2026WorkshopsAdapter() {
  return parseCvpr2026WorkshopItems();
}

async function parse2077AiItems() {
  const report = {
    sourceId: 'cvpr-2077ai-challenges',
    source: '2077AI CVPR 2026 Challenges',
    url: CVPR_2077AI_URL,
    items: [],
    reachable: false,
    httpStatus: null,
    finalUrl: null,
    title: null,
    contentLength: null,
    fetchedAt: new Date().toISOString(),
    note: '2077AI CVPR 2026 challenge dates parser.',
    error: null,
    parsedItemCount: 0,
    invalidItemCount: 0
  };
  try {
    const html = await cvFetchHtml(CVPR_2077AI_URL, report);
    if (!report.reachable) return report;
    const text = cvStripHtml(html);
    const specs = [
      { title: '2077AI DataMFM Challenge', re: /DataMFM Challenge\s+Two-track[\s\S]{0,700}?Deadline\s+([A-Za-z]+\s+\d{1,2},\s*2026)/i, stage: 'Submission deadline' },
      { title: '2077AI Rising Star Award', re: /Rising Star Award\s+Recognizes[\s\S]{0,700}?Deadline\s+([A-Za-z]+\s+\d{1,2},\s*2026)/i, stage: 'Award application deadline' }
    ];
    for (const spec of specs) {
      const match = text.match(spec.re);
      const parsed = match ? cvParseNamedDate(match[1], 2026) : null;
      if (!parsed) {
        report.invalidItemCount += 1;
        continue;
      }
      const deadline = cvIsoDate(parsed.year, parsed.month, parsed.day);
      if (!cvIsFutureWithin(deadline)) continue;
      report.items.push(cvBuildItem({
        idPrefix: 'cvpr2077ai',
        title: spec.title,
        deadline,
        dateRange: match[1],
        url: CVPR_2077AI_URL,
        tags: ['CVPR 2026', 'challenge', '2077AI'],
        source: '2077AI CVPR 2026 Challenges',
        stage: spec.stage,
        description: 'Parsed from the official 2077AI CVPR 2026 challenge page.'
      }));
    }
    report.parsedItemCount = report.items.length;
    report.note = 'Parsed ' + report.parsedItemCount + ' items from 2077AI challenge page.';
  } catch (err) {
    report.error = err.name === 'AbortError' ? 'Timeout after ' + CRAWL_TIMEOUT_MS + 'ms' : err.message;
    report.note = '2077AI parser failed: ' + report.error;
  }
  return report;
}

async function cvpr2077AiAdapter() {
  return parse2077AiItems();
}

function cvExtractDateStageItems(text, sourceUrl, sourceName, idPrefix, tags, specs, description) {
  const items = [];
  for (const spec of specs) {
    const re = new RegExp(spec.pattern, 'i');
    const match = text.match(re);
    const parsed = match ? cvParseNamedDate(match[1], 2026) : null;
    if (!parsed) continue;
    const deadline = cvIsoDate(parsed.year, parsed.month, parsed.day);
    if (!cvIsFutureWithin(deadline)) continue;
    items.push(cvBuildItem({
      idPrefix,
      title: sourceName + ' - ' + spec.stage,
      deadline,
      dateRange: match[1],
      url: sourceUrl,
      tags,
      source: sourceName,
      stage: spec.stage,
      description
    }));
  }
  return items;
}

async function parseEccvEbmvItems() {
  const report = {
    sourceId: 'eccv-ebmv-2026',
    source: 'EBMV @ ECCV 2026',
    url: ECCV_EBMV_2026_URL,
    items: [],
    reachable: false,
    httpStatus: null,
    finalUrl: null,
    title: null,
    contentLength: null,
    fetchedAt: new Date().toISOString(),
    note: 'EBMV ECCV 2026 important dates parser.',
    error: null,
    parsedItemCount: 0,
    invalidItemCount: 0
  };
  try {
    const html = await cvFetchHtml(ECCV_EBMV_2026_URL, report);
    if (!report.reachable) return report;
    const text = cvStripHtml(html);
    report.items = cvExtractDateStageItems(text, ECCV_EBMV_2026_URL, 'EBMV @ ECCV 2026', 'eccv-ebmv-2026', ['ECCV 2026', 'challenge', 'event-based vision'], [
      { stage: 'Challenge submission deadline', pattern: 'Challenge Submission Deadline\\s+([A-Za-z]+\\s+\\d{1,2},\\s*2026)' },
      { stage: 'Challenge results announcement', pattern: 'Challenge Results Announcement\\s+([A-Za-z]+\\s+\\d{1,2},\\s*2026)' },
      { stage: 'Technical report deadline', pattern: 'Technical Report Deadline\\s+([A-Za-z]+\\s+\\d{1,2},\\s*2026)' },
      { stage: 'Workshop paper deadline', pattern: 'Regular Workshop Paper Deadline\\s+([A-Za-z]+\\s+\\d{1,2},\\s*2026)' },
      { stage: 'Camera-ready deadline', pattern: 'Camera-ready Deadline\\s+([A-Za-z]+\\s+\\d{1,2},\\s*2026)' }
    ], 'Parsed from the EBMV @ ECCV 2026 official workshop page.');
    report.parsedItemCount = report.items.length;
    report.note = 'Parsed ' + report.parsedItemCount + ' EBMV ECCV items.';
  } catch (err) {
    report.error = err.name === 'AbortError' ? 'Timeout after ' + CRAWL_TIMEOUT_MS + 'ms' : err.message;
    report.note = 'EBMV ECCV parser failed: ' + report.error;
  }
  return report;
}

async function eccvEbmv2026Adapter() {
  return parseEccvEbmvItems();
}

async function parseEccvEmrItems() {
  const report = {
    sourceId: 'eccv-emr-2026',
    source: 'EMR Workshop @ ECCV 2026',
    url: ECCV_EMR_2026_URL,
    items: [],
    reachable: false,
    httpStatus: null,
    finalUrl: null,
    title: null,
    contentLength: null,
    fetchedAt: new Date().toISOString(),
    note: 'EMR ECCV 2026 important dates parser.',
    error: null,
    parsedItemCount: 0,
    invalidItemCount: 0
  };
  try {
    const html = await cvFetchHtml(ECCV_EMR_2026_URL, report);
    if (!report.reachable) return report;
    const text = cvStripHtml(html);
    report.items = cvExtractDateStageItems(text, ECCV_EMR_2026_URL, 'EMR @ ECCV 2026', 'eccv-emr-2026', ['ECCV 2026', 'challenge', 'embodied AI'], [
      { stage: 'Full paper submission deadline', pattern: 'Full Paper Submission Deadline:?\\s+([A-Za-z]+\\s+\\d{1,2},\\s*2026)' },
      { stage: 'Extended abstract submission', pattern: 'Extended Abstracts Submission\\s+([A-Za-z]+\\s+\\d{1,2},\\s*2026)' },
      { stage: 'Notification', pattern: 'Notification\\s+([A-Za-z]+\\s+\\d{1,2},\\s*2026)' },
      { stage: 'Final version', pattern: 'Final Version\\s+([A-Za-z]+\\s+\\d{1,2},\\s*2026)' }
    ], 'Parsed from the EMR Workshop @ ECCV 2026 official page.');
    report.parsedItemCount = report.items.length;
    report.note = 'Parsed ' + report.parsedItemCount + ' EMR ECCV items.';
  } catch (err) {
    report.error = err.name === 'AbortError' ? 'Timeout after ' + CRAWL_TIMEOUT_MS + 'ms' : err.message;
    report.note = 'EMR ECCV parser failed: ' + report.error;
  }
  return report;
}

async function eccvEmr2026Adapter() {
  return parseEccvEmrItems();
}
async function iccvAdapter() {
  return fetchSourcePage({ id: "iccv", name: "ICCV", url: "https://iccv.thecvf.com" });
}

const adapters = [cvpr2026WorkshopsAdapter, cvpr2077AiAdapter, eccvEbmv2026Adapter, eccvEmr2026Adapter, iccvAdapter];
const existingItemsUrl = new URL('../data/items.json', import.meta.url);
const existingItems = JSON.parse(fs.readFileSync(existingItemsUrl, 'utf8'));
let previousParsedItemCount = null;
try {
  const previousReport = JSON.parse(fs.readFileSync(new URL('../data/crawl-report.json', import.meta.url), 'utf8'));
  previousParsedItemCount = previousReport.parsedItemCount ?? null;
} catch {}
const reports = await Promise.all(adapters.map(adapter => adapter()));

const harvestedItems = reports.flatMap(report => report.items);
const parsedItemCount = reports.reduce((s, r) => s + (r.parsedItemCount || 0), 0);
const parserHealthy = reports.every(r => r.parserHealthy !== false);
const parserDropOk = previousParsedItemCount === null || parsedItemCount >= Math.floor(previousParsedItemCount * 0.5);
if (harvestedItems.length >= CVPR_WORKSHOPS_MIN_ITEMS && parserHealthy && parserDropOk) {
  fs.writeFileSync(existingItemsUrl, JSON.stringify(harvestedItems, null, 2) + '\n', 'utf8');
  console.log('crawler wrote ' + harvestedItems.length + ' fetched items');
} else {
  console.log('parser emitted ' + harvestedItems.length + ' items (health gate failed or threshold not met); preserving ' + existingItems.length + ' curated items in data/items.json');
}

const reachableCount = reports.filter(r => r.reachable).length;
console.log('reachability: ' + reachableCount + '/' + reports.length + ' sources reachable');
if (parsedItemCount > 0) console.log('parsedItemCount: ' + parsedItemCount);

fs.writeFileSync(new URL('../data/crawl-report.json', import.meta.url), JSON.stringify({
  topicId: "cv-ddl",
  generatedAt: new Date().toISOString(),
  adapterCount: reports.length,
  reachableCount,
  parsedItemCount,
  previousParsedItemCount,
  parserHealthy,
  parserDropOk,
  adapters: reports
}, null, 2) + '\n', 'utf8');
