import fs from 'node:fs';
import path from 'node:path';

const sourcesPath = new URL('../data/sources.json', import.meta.url);
const sources = fs.existsSync(sourcesPath) ? JSON.parse(fs.readFileSync(sourcesPath, 'utf8')) : [];
const report = {
  generatedAt: new Date().toISOString(),
  mode: 'seed-plan',
  note: 'Crawler scaffold only. Add source-specific parser modules before writing production data.',
  sources: sources.map((source) => ({
    id: source.id,
    name: source.name,
    priority: source.priority || 'seed',
    url: source.url,
    parser: source.parser || 'manual-review',
  })),
};

console.log(JSON.stringify(report, null, 2));

if (process.argv.includes('--write-report')) {
  const outDir = path.resolve('reports');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'crawl-plan.json'), JSON.stringify(report, null, 2));
}
