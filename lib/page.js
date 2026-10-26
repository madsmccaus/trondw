/**
 * Shared HTML shell for the quiet server-rendered pages.
 * Matches the header, type and footer used on the static pages.
 */

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function shell({ title, main, current = '', robots = false, script = '' }) {
  const items = [
    ['/', 'Forside'],
    ['/arkiv', 'Arkiv'],
    ['/boker', 'Bibliotek'],
    ['/om', 'Om'],
  ];
  const nav = items.map(([href, label]) => {
    const on = current === href ? ' aria-current="page"' : '';
    return `<a href="${href}"${on}>${label}</a>`;
  }).join('');
  const robot = robots ? '\n<meta name="robots" content="noindex, nofollow">' : '';
  const extra = script ? `\n<script>${script}</script>` : '';
  return `<!DOCTYPE html>
<html lang="no">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>${robot}
<script src="/theme.js"></script>
<link rel="preload" href="/fonts/EBGaramond-var.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/EBGaramond-Italic-var.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/site.css">
<script src="/site.js" defer></script>
</head>
<body>
<header class="site-head">
  <a class="mast" href="/">Trond Worren</a>
  <p class="tag">Tidligere tigger, uteligger.</p>
  <nav class="site-nav" aria-label="Hovedmeny">${nav}</nav>
</header>
<div class="page narrow">
  <main class="page-content">
${main}
  </main>
  <footer class="site"><p>Alt innhold tilhører Trond Worren</p><p class="quiet"><a href="/kontakt">Kontakt</a><a href="/stott" id="vipps-link" hidden>Støtt siden</a></p><button class="theme" id="theme" type="button" role="switch" aria-checked="false" aria-label="Mørk modus"><span class="track"><span class="thumb"></span></span></button></footer>
</div>${extra}
</body>
</html>`;
}

function notFoundPage() {
  return shell({
    title: 'Finner ikke siden · Trond Worren',
    robots: true,
    main: `<div class="prose"><h1>Siden finnes ikke</h1><p class="lede">Det er ingenting her.</p></div>`,
  });
}

module.exports = { escapeHtml, shell, notFoundPage };
