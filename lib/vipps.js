/**
 * Vipps gift details. The number and link stay in environment variables.
 * If neither is set, the page and the footer link stay hidden.
 */

const QRCode = require('qrcode');
const { escapeHtml, shell } = require('./page');

function vippsConfig(env = process.env) {
  const number = String(env.VIPPS_NUMBER || '').trim().slice(0, 40);
  let link = String(env.VIPPS_LINK || '').trim();
  if (link.length > 500 || !/^https?:\/\/[^\s]+$/i.test(link)) link = '';
  if (!number && !link) return null;
  return { number, link };
}

async function qrSvg(text) {
  const svg = await QRCode.toString(text, {
    type: 'svg',
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#1c1915', light: '#fffdf8' },
  });
  return String(svg).replace(/^<\?xml[^>]*>\s*/i, '');
}

async function vippsPage(config) {
  const blocks = [
    '<div class="prose">',
    '<h1>Støtt siden</h1>',
    '<p class="lede">Hvis du har hatt glede av det Trond skriver, kan du sende ham en gave med Vipps.</p>',
  ];
  if (config.number) {
    blocks.push('<p class="vipps-label">Vipps-nummer</p>');
    blocks.push(`<p class="vipps-number">${escapeHtml(config.number)}</p>`);
  }
  if (config.link) {
    blocks.push(`<p><a class="u" href="${escapeHtml(config.link)}">Åpne i Vipps</a></p>`);
  }
  const qrText = config.link || config.number;
  try {
    const svg = await qrSvg(qrText);
    const label = config.number ? `QR-kode for Vipps-nummer ${config.number}` : 'QR-kode for Vipps-lenken';
    blocks.push(`<div class="qr-pad" role="img" aria-label="${escapeHtml(label)}">${svg}</div>`);
  } catch (err) {
    // The number or link is still on the page if the code cannot be drawn.
  }
  if (config.number) {
    blocks.push('<p class="fine">Skann koden med kameraet, eller åpne Vipps og søk opp nummeret.</p>');
  } else {
    blocks.push('<p class="fine">Skann koden med kameraet, eller bruk lenken over.</p>');
  }
  blocks.push('</div>');
  return shell({
    title: 'Støtt siden · Trond Worren',
    main: blocks.join('\n'),
  });
}

module.exports = { vippsConfig, vippsPage, qrSvg };
