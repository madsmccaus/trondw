const { Readable } = require('stream');

function makeReq({ method = 'GET', url = '/', headers = {}, body = '' } = {}) {
  const raw = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  const req = Readable.from([raw]);
  req.method = method;
  req.url = url;
  req.headers = headers;
  return req;
}

function makeRes() {
  return {
    statusCode: 0,
    body: '',
    headers: {},
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    send(value) { this.body = value == null ? '' : value; return this; },
    end(value) { if (value != null) this.body = value; return this; },
  };
}

function siteHeaders(extra = {}) {
  return {
    host: 'trondworren.net',
    origin: 'https://trondworren.net',
    'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    ...extra,
  };
}

const CHROME = siteHeaders()['user-agent'];

module.exports = { makeReq, makeRes, siteHeaders, CHROME };
