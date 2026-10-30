/**
 * Privacy sanitizer for email-sourced posts. Shared by the inbound webhook
 * (on store), api/data.js and scripts/build.js and the browser pages (on render).
 *
 * Policy: remove email addresses (also obfuscated "x at y dot com", mailto,
 * <…@…>) and email metadata: header lines (From/To/Cc/Bcc/Reply-To/Sent/
 * Date/Subject, English and Norwegian, also flattened onto one line),
 * forwarded-message markers, "On … wrote:" / "… skrev …:" attribution lines,
 * recipient lists, quoted reply lines ("> …") and mobile footers.
 * Keep everything else Trond writes: names, numbers, addresses, signatures.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TWSanitize = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const EMAIL = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  // "name at gmail dot com", "name (at) gmail (dot) com", "name[at]gmail.com", "name@gmail dot com"
  const AT = String.raw`(?:\s*[\[(]\s*(?:at|alfa|krøllalfa)\s*[\])]\s*|\s+(?:at|alfa|krøllalfa)\s+|\s*@\s*)`;
  const DOT = String.raw`(?:\s*[\[(]\s*(?:dot|punktum|prikk)\s*[\])]\s*|\s+(?:dot|punktum|prikk)\s+|\.)`;
  const OBFUSCATED = new RegExp(String.raw`[a-zA-Z0-9._%+\-]+` + AT + String.raw`[a-zA-Z0-9\-]+(?:` + DOT + String.raw`[a-zA-Z0-9\-]+)*` + DOT + String.raw`(?:com|no|net|org|se|dk|info|online|me|io|uk|de)\b`, 'gi');
  const HEADER_KEYS = 'From|To|Cc|Bcc|Reply-To|Subject|Date|Sent|Fra|Til|Kopi|Blindkopi|Svar til|Emne|Dato|Sendt';
  const HEADER_LINE = new RegExp('^\\s*[*_]*\\s*(?:' + HEADER_KEYS + ')\\s*[*_]*\\s*:', 'i');
  // a flattened header blob such as "From: X <a@b> Date: ... Subject: ... To: ..."
  const INLINE_HEADERS = new RegExp('(?:^|\\s)(?:From|Fra)\\s*:[\\s\\S]*?(?:\\b(?:To|Til|Cc|Kopi)\\s*:[^\\n]*)', 'gi');
  const FORWARD_MARK = /[-–—_=]{2,}\s*(?:Forwarded message|Original Message|Opprinnelig melding|Videresendt melding|Videresendt e-post)\s*[-–—_=]*/gi;
  // attribution lines only; the quoted lines themselves start with ">"
  const ATTRIBUTION = /^.{0,200}?(?:\bOn\s.{3,200}?wrote\s*:|\bskrev\s+[^\n:]{0,120}?<[^>\n]*>\s*:|\bDen\s.{3,200}?skrev[^\n:]*:|\bskrev følgende\s*:)\s*$/gim;
  const MOBILE = /^\s*(?:Sent from my [^\n]*|Sendt fra min [^\n]*|Get Outlook for [^\n]*|Hent Outlook for [^\n]*)$/gim;

  function removeAddresses(s) {
    return s
      .replace(/mailto:\S+/gi, '')
      .replace(EMAIL, '')
      .replace(OBFUSCATED, '')
      // image content ids (cid:image001.png@01D…) and any other token with an @
      .replace(/[^\s\[\]()<>]*@[^\s\[\]()<>]*/g, '');
  }

  // a line that is only addresses / "Name <addr>" items separated by , or ;
  function isRecipientList(line) {
    if (!/[@,;]/.test(line) || !(EMAIL.test(line) || OBFUSCATED.test(line))) return false;
    EMAIL.lastIndex = 0; OBFUSCATED.lastIndex = 0;
    const items = line.split(/[,;]/).map((x) => x.trim()).filter(Boolean);
    const addr = items.filter((x) => /^(?:["'\w .\-æøåÆØÅ]{0,60})?<?[^\s<>]+(?:@|\s(?:at)\s)[^\s<>]+>?$/i.test(x));
    return items.length >= 2 && addr.length === items.length;
  }

  function sanitizeEmailContent(input) {
    if (!input) return '';
    let text = String(input).replace(/\r\n?/g, '\n');

    text = text.replace(FORWARD_MARK, '\n');
    text = text.replace(INLINE_HEADERS, ' ');
    text = text.replace(ATTRIBUTION, '');

    const out = [];
    let inHeaderBlock = false;
    for (const line of text.split('\n')) {
      if (/^\s*>/.test(line)) continue; // quoted reply lines
      if (HEADER_LINE.test(line)) { inHeaderBlock = true; continue; }
      if (inHeaderBlock && /^\s+\S/.test(line)) continue; // folded header continuation
      inHeaderBlock = false;
      if (/^\s*(?:List|X)-[\w-]+\s*:/i.test(line)) continue;
      if (isRecipientList(line)) continue;
      out.push(line);
    }
    text = out.join('\n').replace(MOBILE, '');

    text = removeAddresses(text)
      .replace(/\[e-post fjernet\]/gi, '')
      .replace(/<\s*>/g, '')
      .replace(/\(\s*\)/g, '');

    return text
      .replace(/[ \t]+\n/g, '\n')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function sanitizeSubject(subject) {
    let s = String(subject || '');
    for (let i = 0; i < 4; i++) s = s.replace(/^\s*(?:re|sv|fw|fwd|vs|aw|wg)\s*:\s*/i, '');
    return removeAddresses(s).replace(/<\s*>/g, '').replace(/\s{2,}/g, ' ').trim();
  }

  function htmlToText(html) {
    return (html || '')
      .replace(/<(style|script|head)[^>]*>[\s\S]*?<\/\1>/gi, '')
      // Gmail / Outlook / Apple quoted replies
      .replace(/<div[^>]*class="?[^">]*gmail_quote[\s\S]*$/i, '')
      .replace(/<blockquote[\s\S]*?<\/blockquote>/gi, '')
      .replace(/<div[^>]*(?:id|class)="?(?:divRplyFwdMsg|appendonsend)[\s\S]*$/i, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&');
  }

  return { sanitizeEmailContent, sanitizeSubject, htmlToText };
});
