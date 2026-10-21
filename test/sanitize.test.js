const test = require('node:test');
const assert = require('node:assert');
const { sanitizeEmailContent, sanitizeSubject, htmlToText } = require('../lib/sanitize');

const noLeak = (out) => {
  assert.doesNotMatch(out, /@/);
  assert.doesNotMatch(out, /\b(From|To|Cc|Bcc|Fra|Til|Kopi|Subject|Emne)\s*:/i);
};

test('strips flattened forwarded header blob (as seen on the old site)', () => {
  const out = sanitizeEmailContent('———- Forwarded message ——— From: Trond Worren <trondwor@gmail.com> Date: Sat, Jul 30, 2022 at 6:03 PM Subject: Side 1162 To: a@b.no, c@d.no\n\nI kveld talte han til meg.');
  noLeak(out);
  assert.strictEqual(out, 'I kveld talte han til meg.');
});

test('strips header block with Cc/Bcc and Norwegian headers', () => {
  const out = sanitizeEmailContent('Fra: Trond <t@x.no>\nTil: Ola <o@x.no>\nKopi: Kari <k@x.no>,\n  Per <p@x.no>\nBcc: hemmelig@x.no\nEmne: Hei\n\nInnholdet.');
  noLeak(out);
  assert.strictEqual(out, 'Innholdet.');
});

test('cuts quoted reply chains', () => {
  for (const intro of ['On Mon, Oct 12, 2026 at 9:00 AM Ola <o@x.no> wrote:', 'Den man. 12. okt. 2026 kl. 09:00 skrev Ola <o@x.no>:']) {
    const out = sanitizeEmailContent(`Mitt svar.\n\n${intro}\n> gammel tekst\n> mer`);
    assert.strictEqual(out, 'Mitt svar.');
  }
});

test('keeps signatures, names and numbers in prose; drops mobile footers', () => {
  const sig = 'Tekst.\n\nMed vennlig hilsen\nTrond Worren\nTlf 912 34 567\nKarl Johans gate 1, Oslo';
  assert.strictEqual(sanitizeEmailContent(sig), sig);
  assert.strictEqual(sanitizeEmailContent('Ring meg på 91234567 i dag.'), 'Ring meg på 91234567 i dag.');
  assert.strictEqual(sanitizeEmailContent('Tekst.\n\nSendt fra min iPhone'), 'Tekst.');
  assert.strictEqual(sanitizeEmailContent('Tekst.\n\n-- \nTrond\ntrondwor@gmail.com'), 'Tekst.\n\n--\nTrond');
});

test('numbers on header lines go with the header', () => {
  assert.strictEqual(sanitizeEmailContent('Fra: Ola 912 34 567 <o@x.no>\nSendt: 12.10.2026 09:00\n\nHei.'), 'Hei.');
});

test('removes obfuscated addresses', () => {
  for (const s of ['trondwor at gmail dot com', 'trondwor (at) gmail (dot) com', 'trondwor[at]gmail.com', 'trondwor @ gmail.com', 'ola.n at online punktum no']) {
    const out = sanitizeEmailContent(`Skriv til ${s} i dag`);
    assert.strictEqual(out, 'Skriv til i dag', s);
  }
  assert.strictEqual(sanitizeEmailContent('Vi møttes at kirken i Hønefoss'), 'Vi møttes at kirken i Hønefoss');
});

test('removes attribution lines but keeps the prose after the quote', () => {
  const out = sanitizeEmailContent('Svar.\n\ntor. 12. des. 2019 kl. 21:10 skrev Trond Worren <trondwor>:\n\n> sitert\n\nMer tekst fra Trond.');
  assert.strictEqual(out, 'Svar.\n\nMer tekst fra Trond.');
});

test('removes recipient lists', () => {
  assert.strictEqual(sanitizeEmailContent('Ola <o@x.no>, Kari <k@x.no>; per@y.no\nHei alle.'), 'Hei alle.');
});

test('keeps ordinary prose with commas, years and page numbers', () => {
  const prose = 'I dag, i går, og i morgen skrev jeg side 1162 i 2022.';
  assert.strictEqual(sanitizeEmailContent(prose), prose);
});

test('removes mailto links and bare addresses', () => {
  const out = sanitizeEmailContent('Skriv til mailto:trondwor@gmail.com eller trondwor@gmail.com takk');
  noLeak(out);
});

test('subject loses reply prefixes and addresses', () => {
  assert.strictEqual(sanitizeSubject('Fwd: SV: Side 1162 <t@x.no>'), 'Side 1162');
});

test('html quoted replies and blockquotes are dropped', () => {
  const text = htmlToText('<div>Ny tekst</div><div class="gmail_quote">On … wrote:<blockquote>old a@b.no</blockquote></div>');
  assert.strictEqual(sanitizeEmailContent(text), 'Ny tekst');
});

test('keeps years, year ranges and dates that look like long numbers', () => {
  for (const s of ['Skoleåret 2018 2019 var fint.', 'Datert 11.12.2019 i Oslo.', 'Fra 2020-2021.', 'Side 1162 og 1163.']) {
    assert.strictEqual(sanitizeEmailContent(s), s);
  }
});

test('removes inline image content ids', () => {
  assert.strictEqual(sanitizeEmailContent('Her er den\n[image: cidimage001.png@01D82A3B.5C1E2F00]'), 'Her er den\n[image: ]');
});
