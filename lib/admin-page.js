const { escapeHtml, shell } = require('./page');

function formatDay(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('nb-NO', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

function setupNote(status) {
  if (status.store && status.salt) return '';
  if (!status.store && !status.salt) {
    return 'Besøkene blir ikke lagret ennå, så tallene her er ikke ekte. Et lager og et hemmelig salt må settes opp først.';
  }
  if (!status.store) return 'Besøkene blir ikke lagret ennå, så tallene her er ikke ekte. Et lager må kobles til først.';
  return 'Besøkene blir ikke lagret ennå, så tallene her er ikke ekte. Et hemmelig salt mangler.';
}

function list(items, empty) {
  if (!items.length) return `<p class="fine">${empty}</p>`;
  return `<ul class="stats-list">${items.map((item) => `<li><span>${escapeHtml(item.label)}</span><span class="n">${item.count}</span></li>`).join('')}</ul>`;
}

function dashboard({ status, summary, loadError }) {
  let body;
  if (loadError) {
    body = '<p class="lede">Tallene kunne ikke hentes akkurat nå. Prøv igjen om litt.</p>';
  } else {
    const note = setupNote(status);
    if (note) {
      body = `<p class="lede">${escapeHtml(note)}</p>`;
    } else {
      const days = summary.daily
        .filter((day) => day.visitors > 0)
        .map((day) => ({ label: formatDay(day.date), count: day.visitors }));
      body = `<p class="lede">Personer som har åpnet siden de siste 30 dagene. Samme person telles én gang per dag. Kjente roboter tas ikke med, og ingen adresser lagres.</p>
<div class="figures"><p><span>I dag</span><strong>${summary.today}</strong></p><p><span>Siste 30 dager</span><strong>${summary.total}</strong></p></div>
<h2>Sider</h2>
${list(summary.pages.map((item) => ({ label: item.key, count: item.count })), 'Ingen ennå.')}
<h2>Hvor de kom fra</h2>
${list(summary.referrers.map((item) => ({ label: item.key, count: item.count })), 'Ingen ennå.')}
<h2>Dag for dag</h2>
${list(days, 'Ingen ennå.')}`;
    }
  }
  return shell({
    title: 'Besøk · Trond Worren',
    robots: true,
    main: `<div class="prose stats"><h1>Besøk</h1>
${body}
<form method="post" action="/admin"><input type="hidden" name="action" value="logout"><button class="linkish" type="submit">Logg ut</button></form>
</div>`,
  });
}

function loginPage({ error = '', unconfigured = false } = {}) {
  const note = error ? `<p class="status bad" role="status">${escapeHtml(error)}</p>` : '';
  const main = unconfigured
    ? `<div class="prose"><h1>Privat side</h1><p class="lede">Siden er ikke satt opp ennå.</p></div>`
    : `<div class="prose"><h1>Privat side</h1><p class="lede">Skriv inn passordet for å se besøkstall.</p>${note}<form class="quiet-form" method="post" action="/admin"><label>Passord<input name="password" type="password" autocomplete="current-password" required></label><button type="submit">Logg inn</button></form></div>`;
  return shell({ title: 'Privat · Trond Worren', robots: true, main });
}

module.exports = { dashboard, loginPage, setupNote };
