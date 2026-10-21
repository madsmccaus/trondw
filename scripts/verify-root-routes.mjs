import { chromium } from 'playwright';
import { spawn } from 'child_process';
import { readFileSync } from 'fs';

const BASE = process.env.BASE || 'http://127.0.0.1:3765';
let server = null;
if (!process.env.BASE) {
  const PORT = 3766;
  const ROOT = new URL('..', import.meta.url).pathname;
  server = spawn('npx', ['--yes', 'serve', ROOT, '-l', String(PORT)], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 3000));
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const results = [];

async function check(name, url, expect) {
  const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch((e) => ({ error: e.message }));
  if (res?.error) {
    results.push({ name, ok: false, error: res.error });
    return;
  }
  const title = await page.title();
  const hasNav = await page.locator('.site-nav a').count();
  const theme = await page.locator('#theme').count();
  let ok = hasNav > 0;
  if (expect?.titleIncludes) ok &&= title.includes(expect.titleIncludes);
  if (expect?.noHeading) ok &&= (await page.locator('main h1:not(.sr)').count()) === 0;
  if (expect?.hasRoot) ok &&= !!(await page.locator('#root').count()) || expect.static;
  results.push({ name, ok, title, url: page.url() });
}

await check('home', `${BASE}/`, { titleIncludes: 'Trond', hasRoot: true });
await check('arkiv', `${BASE}/arkiv`, { titleIncludes: 'Arkiv' });
await check('boker', `${BASE}/boker`, { titleIncludes: 'Bibliotek' });
await check('om', `${BASE}/om`, { titleIncludes: 'Om', noHeading: true });
await check('post', `${BASE}/?m=2026-09&i=0`, { titleIncludes: 'Trond' });

await page.goto(`${BASE}/boker`, { waitUntil: 'networkidle' });
await page.waitForSelector('#grid button[data-k]', { timeout: 20000 });
await page.click('#grid button[data-k]');
await page.waitForSelector('#reader.on', { timeout: 10000 });
results.push({ name: 'boker-reader-open', ok: await page.locator('#reader.on').isVisible() });

await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
const before = await page.evaluate(() => document.documentElement.dataset.theme);
await page.click('#theme');
await page.waitForTimeout(200);
const after = await page.evaluate(() => document.documentElement.dataset.theme);
results.push({ name: 'theme-toggle', ok: before !== after });

const vercelPath = process.env.ROOT ? `${process.env.ROOT}/vercel.json` : new URL('../vercel.json', import.meta.url).pathname;
const vercel = JSON.parse(readFileSync(vercelPath, 'utf8'));
const hasV4 = vercel.redirects.some((r) => r.source === '/v4' && r.destination === '/');
const hasYear = vercel.redirects.some((r) => r.source.includes('year') && r.destination === '/');
const noOmHome = !vercel.redirects.some((r) => r.source === '/om' && r.destination === '/');
results.push({ name: 'vercel-v4-redirect', ok: hasV4 });
results.push({ name: 'vercel-year-redirect', ok: hasYear });
results.push({ name: 'vercel-om-not-stolen', ok: noOmHome });

await browser.close();
if (server) server.kill('SIGTERM');

const failed = results.filter((r) => !r.ok);
console.log(JSON.stringify({ results, failed: failed.length }, null, 2));
process.exit(failed.length ? 1 : 0);
