import fs from 'node:fs';
import path from 'node:path';

const args = new Set(process.argv.slice(2));
const root = process.cwd();
const topicSlug = path.basename(root).replace(/[^a-z0-9-]+/gi, '-').toLowerCase();
const timeoutMs = Number(process.env.CRAWLER_TIMEOUT_MS || 20000);
const maxItemsPerSource = Number(process.env.CRAWLER_LIMIT || 120);
const userAgent = process.env.CRAWLER_USER_AGENT || 'Just-DDL Network crawler (+https://github.com/Just-Agent/just-ddl)';
const sourceSpecificParsers = new Set([
  'sciencedirect-cfp',
  'ieee-comsoc-cfp',
  'ieee-sps-cfp',
  'ieee-access-cfp',
]);

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number.parseInt(dec, 10)));
}

function cleanText(value) {
  return decodeHtml(String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim());
}

function htmlToLines(html) {
  const markedHtmlLinks = String(html || '').replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (match, attrs, inner) => {
    const hrefMatch = attrs.match(/\bhref\s*=\s*["']([^"']+)["']/i) || attrs.match(/\bhref\s*=\s*([^\s>]+)/i);
    const href = hrefMatch ? hrefMatch[1] : '';
    const text = cleanText(inner).replace(/\|/g, ' ');
    if (!text) return ' ';
    return '\n[[LINK|' + href.replace(/\|/g, '%7C') + '|' + text + ']]\n';
  });
  const markedLinks = markedHtmlLinks.replace(/\[([^\]\n]{4,160})\]\((https?:\/\/[^)\s]+|\/[^)\s]+)\)/g, (match, text, href) => {
    return '\n[[LINK|' + href.replace(/\|/g, '%7C') + '|' + cleanText(text).replace(/\|/g, ' ') + ']]\n';
  });
  return decodeHtml(markedLinks
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(br|p|div|li|tr|td|th|h1|h2|h3|h4|h5|section|article)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\r/g, '\n'))
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function parseLinkMarker(line) {
  const match = String(line || '').match(/^\[\[LINK\|([^|]*)\|([\s\S]*)\]\]$/);
  if (!match) return null;
  return { href: match[1], text: cleanText(match[2]) };
}

function resolveUrl(href, baseUrl) {
  try {
    return new URL(href || baseUrl, baseUrl).toString();
  } catch {
    return baseUrl;
  }
}

const monthIndex = new Map([
  ['jan', 1], ['january', 1],
  ['feb', 2], ['february', 2],
  ['mar', 3], ['march', 3],
  ['apr', 4], ['april', 4],
  ['may', 5],
  ['jun', 6], ['june', 6],
  ['jul', 7], ['july', 7],
  ['aug', 8], ['august', 8],
  ['sep', 9], ['sept', 9], ['september', 9],
  ['oct', 10], ['october', 10],
  ['nov', 11], ['november', 11],
  ['dec', 12], ['december', 12],
]);

function pad(value) {
  return String(value).padStart(2, '0');
}

function toDateString(year, month, day) {
  if (!year || !month || !day) return null;
  return String(year).padStart(4, '0') + '-' + pad(month) + '-' + pad(day);
}

function parseDateCandidate(value) {
  const text = cleanText(value)
    .replace(/\b(aoe|utc|gmt|et|est|edt|pst|pdt|cst|cet|deadline|due|submission|manuscript|paper|initial|full|article|date)\b/gi, ' ')
    .replace(/[(),]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  let match = text.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (match) return toDateString(Number(match[1]), Number(match[2]), Number(match[3]));
  match = text.match(/\b(\d{1,2})\s*[- ]\s*([A-Za-z]{3,9})\s*[- ]\s*(20\d{2})\b/);
  if (match) return toDateString(Number(match[3]), monthIndex.get(match[2].toLowerCase()), Number(match[1]));
  match = text.match(/\b([A-Za-z]{3,9})\s+(\d{1,2})\s+(20\d{2})\b/);
  if (match) return toDateString(Number(match[3]), monthIndex.get(match[1].toLowerCase()), Number(match[2]));
  match = text.match(/\b(20\d{2})年\s*(\d{1,2})月\s*(\d{1,2})日?\b/);
  if (match) return toDateString(Number(match[1]), Number(match[2]), Number(match[3]));
  return null;
}

function findAllDates(value) {
  const text = cleanText(value);
  const matches = [];
  const patterns = [
    /\b20\d{2}[-/]\d{1,2}[-/]\d{1,2}\b/g,
    /\b\d{1,2}\s*[- ]\s*[A-Za-z]{3,9}\s*[- ]\s*20\d{2}\b/g,
    /\b[A-Za-z]{3,9}\s+\d{1,2},?\s+20\d{2}\b/g,
    /\b20\d{2}年\s*\d{1,2}月\s*\d{1,2}日?\b/g,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const parsed = parseDateCandidate(match[0]);
      if (parsed) matches.push(parsed);
    }
  }
  return [...new Set(matches)];
}

function statusFromDeadline(dateString) {
  if (!dateString) return 'ongoing';
  const end = new Date(dateString + 'T23:59:59Z').getTime();
  return Number.isFinite(end) && end < Date.now() ? 'ended' : 'upcoming';
}

function slugify(value) {
  return cleanText(value).toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72) || 'item';
}

function inferType() {
  if (topicSlug.includes('journal')) return 'journal';
  if (topicSlug.includes('hackathon')) return 'hackathon';
  if (topicSlug.includes('agent')) return 'competition';
  if (topicSlug.includes('programming')) return 'contest';
  if (topicSlug.includes('holiday')) return 'event';
  return 'conference';
}

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.8,zh-CN;q=0.7,zh;q=0.6',
        'user-agent': userAgent,
      },
    });
    const text = await response.text();
    return { ok: response.ok, status: response.status, finalUrl: response.url, text };
  } finally {
    clearTimeout(timeout);
  }
}

function readerFallbackUrl(url) {
  if (!/^https?:\/\//i.test(url || '')) return null;
  return 'https://r.jina.ai/http://' + url;
}

async function fetchSourceText(source, parserName) {
  const primary = await fetchText(source.url);
  if (primary.ok) return { ...primary, usedFallback: false };
  const fallbackUrl = source.fallbackUrl || (parserName === 'sciencedirect-cfp' ? readerFallbackUrl(source.url) : null);
  if (!fallbackUrl || primary.status !== 403) return { ...primary, usedFallback: false };
  const fallback = await fetchText(fallbackUrl);
  return {
    ...fallback,
    usedFallback: true,
    primaryStatus: primary.status,
    primaryUrl: source.url,
  };
}

function isNoisyTitle(title) {
  return !title
    || title.length < 8
    || /^(home|about|submit|submission|view all|learn more|read more|sign in|search|menu|pdf|rss)$/i.test(title)
    || /^(issn|cite score|impact factor)/i.test(title);
}

function parseScienceDirectCfp(html, source) {
  const lines = htmlToLines(html);
  const candidates = [];
  for (let index = 0; index < lines.length; index++) {
    const link = parseLinkMarker(lines[index]);
    if (!link || isNoisyTitle(link.text)) continue;
    const block = [];
    let deadlineLine = -1;
    for (let cursor = index + 1; cursor < Math.min(lines.length, index + 18); cursor++) {
      block.push(lines[cursor]);
      if (/submission deadline/i.test(lines[cursor])) {
        deadlineLine = cursor;
        break;
      }
    }
    if (deadlineLine === -1) continue;
    const blockText = block.join(' ');
    const deadlineDate = findAllDates(blockText).at(-1);
    if (!deadlineDate) continue;
    const innerLinks = block.map(parseLinkMarker).filter(Boolean);
    const journalLink = innerLinks.find((item) => !/guest editor|view|submit/i.test(item.text));
    candidates.push({
      title: link.text,
      url: resolveUrl(link.href, source.url),
      deadlineDate,
      journal: journalLink ? journalLink.text : undefined,
      publisher: 'Elsevier',
      location: 'ScienceDirect',
      stage: 'Call for Papers',
      cfpType: 'Special Issue',
      tags: ['Elsevier', 'ScienceDirect'],
      description: blockText.replace(/\[\[LINK\|[^\]]+\]\]/g, '').slice(0, 220),
      parserConfidence: 'source-specific',
    });
    index = deadlineLine;
    if (candidates.length >= maxItemsPerSource) break;
  }
  return candidates;
}

function parseComsocCfp(html, source) {
  const lines = htmlToLines(html);
  const candidates = [];
  for (let index = 0; index < lines.length; index++) {
    const link = parseLinkMarker(lines[index]);
    if (!link || isNoisyTitle(link.text)) continue;
    const block = [];
    for (let cursor = index + 1; cursor < Math.min(lines.length, index + 10); cursor++) {
      if (parseLinkMarker(lines[cursor])) break;
      block.push(lines[cursor]);
    }
    const blockText = block.join(' ');
    if (/closed/i.test(blockText)) continue;
    const dates = findAllDates(blockText);
    if (dates.length === 0) continue;
    candidates.push({
      title: link.text,
      url: resolveUrl(link.href, source.url),
      deadlineDate: dates.at(-1),
      publicationDate: dates.length > 1 ? dates[0] : undefined,
      publisher: 'IEEE',
      location: source.name.includes('JSAC') ? 'IEEE JSAC' : 'IEEE ComSoc',
      journal: source.name.replace(/\s+CFP$/i, ''),
      stage: 'Call for Papers',
      cfpType: 'Special Issue',
      tags: ['IEEE', 'ComSoc'],
      description: blockText.slice(0, 220),
      parserConfidence: 'source-specific',
    });
    if (candidates.length >= maxItemsPerSource) break;
  }
  return candidates;
}

function parseSpsCfp(html, source) {
  const lines = htmlToLines(html);
  const candidates = [];
  for (let index = 0; index < lines.length; index++) {
    const link = parseLinkMarker(lines[index]);
    if (!link || isNoisyTitle(link.text)) continue;
    const block = [];
    for (let cursor = index + 1; cursor < Math.min(lines.length, index + 14); cursor++) {
      if (parseLinkMarker(lines[cursor])) break;
      block.push(lines[cursor]);
    }
    const deadlineLine = block.find((line) => /submission deadline|deadline/i.test(line));
    if (!deadlineLine) continue;
    const deadlineDate = findAllDates(deadlineLine).at(-1) || findAllDates(block.join(' ')).at(-1);
    if (!deadlineDate) continue;
    candidates.push({
      title: link.text,
      url: resolveUrl(link.href, source.url),
      deadlineDate,
      publisher: 'IEEE',
      location: 'IEEE Signal Processing Society',
      journal: 'IEEE SPS Journals',
      stage: 'Special Issue',
      cfpType: 'Special Issue',
      tags: ['IEEE', 'Signal Processing'],
      description: block.join(' ').slice(0, 220),
      parserConfidence: 'source-specific',
    });
    if (candidates.length >= maxItemsPerSource) break;
  }
  return candidates;
}

function parseIeeeAccessCfp(html, source) {
  const plainText = cleanText(html);
  if (/no special sections open|currently no special sections/i.test(plainText)) {
    return [];
  }
  const lines = htmlToLines(html);
  const candidates = [];
  for (let index = 0; index < lines.length; index++) {
    const link = parseLinkMarker(lines[index]);
    if (!link || isNoisyTitle(link.text)) continue;
    const block = [];
    for (let cursor = index + 1; cursor < Math.min(lines.length, index + 16); cursor++) {
      if (parseLinkMarker(lines[cursor])) break;
      block.push(lines[cursor]);
    }
    const blockText = block.join(' ');
    if (!/deadline|closing date|submission/i.test(blockText)) continue;
    const deadlineDate = findAllDates(blockText).at(-1);
    if (!deadlineDate) continue;
    candidates.push({
      title: link.text,
      url: resolveUrl(link.href, source.url),
      deadlineDate,
      publisher: 'IEEE',
      location: 'IEEE Access',
      journal: 'IEEE Access',
      stage: 'Special Section',
      cfpType: 'Special Section',
      tags: ['IEEE Access', 'Special Section'],
      description: blockText.slice(0, 220),
      parserConfidence: 'source-specific',
    });
    if (candidates.length >= maxItemsPerSource) break;
  }
  return candidates;
}

function parseGenericLinkDate(html, source) {
  const lines = htmlToLines(html);
  const candidates = [];
  for (let index = 0; index < lines.length; index++) {
    const link = parseLinkMarker(lines[index]);
    if (!link || isNoisyTitle(link.text)) continue;
    const block = [];
    for (let cursor = index + 1; cursor < Math.min(lines.length, index + 8); cursor++) {
      if (parseLinkMarker(lines[cursor])) break;
      block.push(lines[cursor]);
    }
    const dates = findAllDates(block.join(' '));
    if (dates.length === 0) continue;
    candidates.push({
      title: link.text,
      url: resolveUrl(link.href, source.url),
      deadlineDate: dates.at(-1),
      location: source.name,
      stage: 'Crawler candidate',
      cfpType: 'Crawler candidate',
      tags: [source.name],
      description: block.join(' ').slice(0, 220),
      parserConfidence: 'generic-review',
    });
    if (candidates.length >= maxItemsPerSource) break;
  }
  return candidates;
}

const parsers = new Map([
  ['sciencedirect-cfp', parseScienceDirectCfp],
  ['ieee-comsoc-cfp', parseComsocCfp],
  ['ieee-sps-cfp', parseSpsCfp],
  ['ieee-access-cfp', parseIeeeAccessCfp],
  ['generic-link-date', parseGenericLinkDate],
]);

function candidateToItem(candidate, source) {
  if (!candidate.deadlineDate) return null;
  const id = slugify(topicSlug + '-' + source.id + '-' + candidate.title + '-' + candidate.deadlineDate);
  return {
    id,
    title: candidate.title,
    deadline: candidate.deadlineDate + 'T23:59:59',
    dateRange: candidate.deadlineDate,
    location: candidate.location || source.name,
    isOnline: true,
    tags: candidate.tags || [source.name],
    url: candidate.url || source.url,
    status: statusFromDeadline(candidate.deadlineDate),
    stage: candidate.stage || 'Deadline',
    source: source.name,
    type: inferType(),
    description: candidate.description || '',
    journal: candidate.journal,
    publisher: candidate.publisher,
    cfpType: candidate.cfpType,
    sourcePriority: source.priority || 'crawler',
    deadlineTimezone: 'source-local/unspecified',
    crawler: {
      sourceId: source.id,
      parser: source.parser || 'generic-link-date',
      parserConfidence: candidate.parserConfidence || 'unknown',
      crawledAt: new Date().toISOString(),
    },
  };
}

function mergeItems(existing, crawled) {
  const merged = [...existing];
  const keys = new Map();
  merged.forEach((item, index) => {
    const key = slugify(item.title || '') + '|' + String(item.dateRange || item.deadline || '').slice(0, 10);
    keys.set(key, index);
  });
  for (const item of crawled) {
    const key = slugify(item.title || '') + '|' + String(item.dateRange || item.deadline || '').slice(0, 10);
    if (keys.has(key)) {
      const index = keys.get(key);
      const previous = merged[index];
      merged[index] = {
        ...item,
        ...previous,
        url: previous.url && previous.url !== '#' ? previous.url : item.url,
        crawler: item.crawler,
      };
    } else {
      keys.set(key, merged.length);
      merged.push(item);
    }
  }
  return merged.sort((a, b) => String(a.deadline || '').localeCompare(String(b.deadline || '')));
}

async function crawlSource(source) {
  const parserName = source.parser || 'generic-link-date';
  const parser = parsers.get(parserName);
  const result = {
    id: source.id,
    name: source.name,
    url: source.url,
    priority: source.priority || 'seed',
    parser: parserName,
    status: 'skipped',
    httpStatus: null,
    finalUrl: null,
    candidates: [],
    writeableItems: 0,
    warnings: [],
  };
  if (!/^https?:\/\//i.test(source.url || '')) {
    result.warnings.push('Non-HTTP source kept for manual reference.');
    return result;
  }
  if (!parser) {
    result.warnings.push('No parser registered for ' + parserName + '.');
    return result;
  }
  try {
    const response = await fetchSourceText(source, parserName);
    result.status = response.ok ? 'ok' : 'http-warning';
    result.httpStatus = response.status;
    result.finalUrl = response.finalUrl;
    if (!response.ok) {
      result.warnings.push('HTTP status ' + response.status);
    }
    if (response.usedFallback) {
      result.warnings.push('Primary source returned HTTP ' + response.primaryStatus + '; fetched reader fallback for parsing.');
    }
    result.candidates = parser(response.text, { ...source, url: response.finalUrl || source.url })
      .slice(0, maxItemsPerSource)
      .map((candidate) => ({
        ...candidate,
        sourceId: source.id,
        parser: parserName,
        writeable: sourceSpecificParsers.has(parserName),
      }));
    result.writeableItems = result.candidates.filter((item) => item.writeable).length;
  } catch (error) {
    result.status = 'error';
    result.warnings.push(error.message);
  }
  return result;
}

const sourcesPath = path.join(root, 'data', 'sources.json');
const itemsPath = path.join(root, 'data', 'items.json');
const sources = readJson(sourcesPath, []);
const existingItems = readJson(itemsPath, []);
const sourceResults = [];
for (const source of sources) {
  sourceResults.push(await crawlSource(source));
}

const allCandidates = sourceResults.flatMap((source) => source.candidates);
const writeableCandidates = allCandidates.filter((candidate) => candidate.writeable || process.env.ALLOW_GENERIC_CRAWLER_WRITE === 'true');
const crawledItems = writeableCandidates.map((candidate) => {
  const source = sources.find((item) => item.id === candidate.sourceId) || {};
  return candidateToItem(candidate, source);
}).filter(Boolean);

const report = {
  generatedAt: new Date().toISOString(),
  mode: 'source-specific-crawl',
  topic: topicSlug,
  summary: {
    sources: sources.length,
    candidates: allCandidates.length,
    writeableCandidates: writeableCandidates.length,
    generatedItems: crawledItems.length,
  },
  sources: sourceResults,
  generatedItems: crawledItems,
};

console.log(JSON.stringify(report, null, 2));

if (args.has('--write-report')) {
  const outDir = path.join(root, 'reports');
  fs.mkdirSync(outDir, { recursive: true });
  writeJson(path.join(outDir, 'crawl-report.json'), report);
  writeJson(path.join(outDir, 'crawl-plan.json'), report);
}

if (args.has('--write-data')) {
  const merged = mergeItems(existingItems, crawledItems);
  writeJson(itemsPath, merged);
  const publicDataDir = path.join(root, 'public', 'data');
  if (fs.existsSync(publicDataDir)) {
    writeJson(path.join(publicDataDir, 'items.json'), merged);
    writeJson(path.join(publicDataDir, 'sources.json'), sources);
  }
}

