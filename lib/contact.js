/**
 * Contact form: check the fields, then hand a plain-text mail to Resend.
 * The inbox address comes from CONTACT_TO_EMAIL. It is never written into
 * the page or into this file.
 */

const LIMITS = { name: 80, email: 120, message: 4000 };

function cleanText(value) {
  return String(value || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
}

function cleanLine(value, max) {
  return cleanText(value).replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function isEmail(value) {
  return typeof value === 'string'
    && value.length <= LIMITS.email
    && /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(value)
    && !/[\r\n]/.test(value);
}

function asString(value) {
  if (value == null) return '';
  if (typeof value !== 'string') return null;
  return value;
}

function parseContact(input) {
  const source = input && typeof input === 'object' ? input : {};
  const nameRaw = asString(source.name);
  const emailRaw = asString(source.email);
  const messageRaw = asString(source.message);
  const companyRaw = asString(source.company);
  if (nameRaw == null || emailRaw == null || messageRaw == null || companyRaw == null) {
    return { error: 'Meldingen ble ikke sendt. Prøv igjen om litt.' };
  }
  if (companyRaw.trim()) return { honeypot: true };
  if (nameRaw.length > LIMITS.name) return { error: 'Navnet er for langt.' };
  if (emailRaw.length > LIMITS.email) return { error: 'E-postadressen ser ikke riktig ut.' };
  if (messageRaw.length > LIMITS.message) return { error: 'Meldingen er for lang.' };
  const name = cleanLine(nameRaw, LIMITS.name);
  const email = cleanLine(emailRaw, LIMITS.email);
  const message = cleanText(messageRaw).trim();
  if (!message) return { error: 'Skriv en melding først.' };
  if (email && !isEmail(email)) return { error: 'E-postadressen ser ikke riktig ut.' };
  return { name, email, message };
}

function parseFrom(value) {
  const raw = cleanLine(value, 160);
  if (!raw) return '';
  const named = raw.match(/^(.*)<([^<>\s]+)>$/);
  if (named) {
    const email = named[2].trim();
    const label = named[1].trim().replace(/["<>]/g, '');
    if (!isEmail(email)) return '';
    return label ? `${label} <${email}>` : email;
  }
  if (!isEmail(raw)) return '';
  return `Trond Worren-arkivet <${raw}>`;
}

function parseTo(value) {
  const email = cleanLine(value, LIMITS.email);
  return isEmail(email) ? email : '';
}

function mailBody({ name, email, message }) {
  return [
    `Navn: ${name || '(ikke oppgitt)'}`,
    `E-post: ${email || '(ikke oppgitt)'}`,
    '',
    message,
  ].join('\n');
}

function buildMail({ env, fields }) {
  const to = parseTo(env.CONTACT_TO_EMAIL);
  const from = parseFrom(env.CONTACT_FROM_EMAIL);
  const key = String(env.RESEND_API_KEY || '').trim();
  if (!to || !from || !key) return null;
  const subject = fields.name
    ? `Melding fra nettsiden (${fields.name.slice(0, 60)})`
    : 'Melding fra nettsiden';
  const payload = {
    from,
    to: [to],
    subject,
    text: mailBody(fields),
  };
  if (fields.email) payload.reply_to = fields.email;
  return { key, payload };
}

async function sendMail(mail, fetchImpl) {
  const response = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${mail.key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(mail.payload),
  });
  if (!response.ok) {
    const err = new Error(`resend ${response.status}`);
    err.status = response.status;
    throw err;
  }
  return true;
}

module.exports = {
  LIMITS,
  parseContact,
  parseFrom,
  parseTo,
  buildMail,
  sendMail,
  isEmail,
};
