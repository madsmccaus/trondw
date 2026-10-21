import { chromium, devices } from 'playwright';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import sharp from 'sharp';

const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const OUT = process.env.OUT || '/opt/cursor/artifacts/screenshots';
const label = process.env.LABEL || 'before';

const routes = [
  { name: 'home', url: `${BASE}/` },
  { name: 'post', url: `${BASE}/?m=2026-09&i=0` },
  { name: 'arkiv', url: `${BASE}/arkiv` },
  { name: 'arkiv-2020', url: `${BASE}/arkiv?y=2020` },
  { name: 'boker', url: `${BASE}/boker` },
  { name: 'om', url: `${BASE}/om` },
];

async function measure(page) {
  return page.evaluate(() => {
    const head = document.querySelector('.site-head');
    const links = [...document.querySelectorAll('.site-nav a')];
    const hr = head.getBoundingClientRect();
    const sb = window.innerWidth - document.documentElement.clientWidth;
    return {
      scrollY: scrollY,
      scrollbar: sb,
      head: { x: hr.x, y: hr.y, w: hr.width, h: hr.height },
      links: links.map((a) => {
        const r = a.getBoundingClientRect();
        return { href: a.getAttribute('href'), x: r.x, y: r.y, w: r.width, h: r.height, current: a.hasAttribute('aria-current') };
      }),
    };
  });
}

async function captureHeaderShot(page, path) {
  const box = await page.evaluate(() => {
    const h = document.querySelector('.site-head');
    const r = h.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  await page.screenshot({
    path,
    clip: { x: Math.max(0, box.x), y: Math.max(0, box.y), width: box.width, height: box.height },
  });
}

const viewports = [
  { tag: '390', w: 390, h: 844, device: devices['iPhone 13'] },
  { tag: '1440', w: 1440, h: 900 },
];

const all = { label, viewports: {} };
await mkdir(OUT, { recursive: true });

for (const vp of viewports) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext(
    vp.device ? { ...vp.device, viewport: { width: vp.w, height: vp.h } } : { viewport: { width: vp.w, height: vp.h } }
  );
  const page = await ctx.newPage();
  const shots = {};
  const measures = {};

  for (const r of routes) {
    await page.goto(r.url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(250);
    measures[r.name] = await measure(page);
    const shotPath = join(OUT, `header-${label}-${vp.tag}-${r.name}.png`);
    await captureHeaderShot(page, shotPath);
    shots[r.name] = shotPath;
  }

  const ref = measures.home.head;
  const deltas = {};
  for (const [name, m] of Object.entries(measures)) {
    deltas[name] = {
      head: { dx: m.head.x - ref.x, dy: m.head.y - ref.y, dw: m.head.w - ref.w, dh: m.head.h - ref.h },
      scrollbar: m.scrollbar - measures.home.scrollbar,
      links: m.links.map((l, i) => {
        const r0 = measures.home.links.find((x) => x.href === l.href);
        if (!r0) return l;
        return { href: l.href, dx: l.x - r0.x, dy: l.y - r0.y };
      }),
    };
  }

  await sharp(shots.home)
    .composite([{ input: shots.post, blend: 'difference' }])
    .toFile(join(OUT, `header-diff-${label}-${vp.tag}-home-vs-post.png`));

  const linkDys = Object.values(deltas).flatMap((d) => d.links.map((l) => Math.abs(l.dy || 0)));
  all.viewports[vp.tag] = {
    measures,
    deltas,
    maxAbsHeadDy: Math.max(...Object.values(deltas).map((d) => Math.abs(d.head.dy))),
    maxAbsLinkDy: Math.max(0, ...linkDys),
  };
  await browser.close();
}

// SPA: header must not move after in-app navigation
for (const vp of [{ tag: '390', w: 390, h: 844, device: devices['iPhone 13'] }, { tag: '1440', w: 1440, h: 900 }]) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext(
    vp.device ? { ...vp.device, viewport: { width: vp.w, height: vp.h } } : { viewport: { width: vp.w, height: vp.h } }
  );
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  const home = await measure(page);
  await page.locator('.entry .title a').first().click();
  await page.waitForTimeout(400);
  const post = await measure(page);
  await page.locator('a.back').first().click();
  await page.waitForTimeout(400);
  const back = await measure(page);
  all.spa = all.spa || {};
  all.spa[vp.tag] = {
    homeToPost: { headDy: post.head.y - home.head.y, linkDy: post.links[0].y - home.links[0].y },
    postToHome: { headDy: back.head.y - home.head.y, linkDy: back.links[0].y - home.links[0].y },
  };
  await browser.close();
}

await writeFile(join(OUT, `header-measures-${label}.json`), JSON.stringify(all, null, 2));
console.log(
  JSON.stringify({
    label,
    maxHeadDy: { 390: all.viewports['390'].maxAbsHeadDy, 1440: all.viewports['1440'].maxAbsHeadDy },
    maxLinkDy: { 390: all.viewports['390'].maxAbsLinkDy, 1440: all.viewports['1440'].maxAbsLinkDy },
    spa: all.spa,
  })
);
