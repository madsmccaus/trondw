/**
 * Privacy sanitizer for email-sourced posts. Shared by the inbound webhook
 * (on store), build-index.js (on build) and the browser pages (on render).
 * Strips: header blocks (From/To/Cc/Bcc/Reply-To/Subject/Date and Norwegian
 * equivalents, also when flattened onto one line), forwarded/quoted reply
 * chains, signatures after "-- " or a sign-off, "Sent from my iPhone",
 * email addresses, mailto links, phone numbers.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TWSanitize = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const EMAIL = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  const HEADER_KEYS = 'From|To|Cc|Bcc|Reply-To|Subject|Date|Sent|Fra|Til|Kopi|Blindkopi|Svar til|Emne|Dato|Sendt';
  const HEADER_LINE = new RegExp('^\\s*[*_]*\\s*(?:' + HEADER_KEYS + ')\\s*[*_]*\\s*:', 'i');
  // a flattened header blob such as "From: X <a@b> Date: ... Subject: ... To: ..."
  const INLINE_HEADERS = new RegExp('(?:^|\\s)(?:From|Fra)\\s*:[\\s\\S]*?(?:\\b(?:To|Til|Cc|Kopi)\\s*:[^\\n]*)', 'gi');
  const FORWARD_MARK = /[-–—_=]{2,}\s*(?:Forwarded message|Original Message|Opprinnelig melding|Videresendt melding|Videresendt e-post)\s*[-–—_=]*/gi;
  const QUOTE_INTRO = /^(?:On\s.{3,200}?wrote:|Den\s.{3,200}?skrev[^\n:]*:|.{0,200}\bskrev følgende:)\s*$/im;
  const SIGNOFF = /^\s*(?:Med vennlig hilsen|Vennlig hilsen|Mvh\.?|Best regards|Kind regards|Regards)\s*,?\s*$/im;
  const MOBILE = /^\s*(?:Sent from my [^\n]*|Sendt fra min [^\n]*|Get Outlook for [^\n]*|Hent Outlook for [^\n]*)$/gim;
  const PHONE = /(?:\+\d{1,3}[\s.\-]?)?(?:\(?\d{2,4}\)?[\s.\-]?){2,4}\d{2,4}(?=\D|$)/g;

  function cutAt(text, re) {
    const m = re.exec(text);
    return m ? text.slice(0, m.index) : text;
  }

  function stripPhones(text) {
    return text.replace(PHONE, (m) => {
      const digits = m.replace(/\D/g, '');
      const national = digits.replace(/^(?:0047|47)(?=\d{8}$)/, '');
      // Norwegian phone numbers have 8 digits (optionally +47). Keep years,
      // year ranges and dates such as "2018 2019", "11.12.2019" or "1162".
      if (national.length !== 8) return m;
      if (/(?:^|\D)(?:19|20)\d{2}(?:\D|$)/.test(m)) return m;
      if (/^\d{1,2}[./]\d{1,2}[./]\d{2,4}$/.test(m.trim())) return m;
      return '';
    });
  }

  function sanitizeEmailContent(input) {
    if (!input) return '';
    let text = String(input).replace(/\r\n?/g, '\n');

    // Forwarded mail: drop the marker and the header block that follows it.
    text = text.replace(FORWARD_MARK, '\n');
    text = text.replace(INLINE_HEADERS, ' ');

    const lines = text.split('\n');
    const out = [];
    let inHeaderBlock = false;
    for (const line of lines) {
      if (/^\s*>/.test(line)) continue; // quoted reply lines
      if (HEADER_LINE.test(line)) { inHeaderBlock = true; continue; }
      if (inHeaderBlock && /^\s+\S/.test(line)) continue; // folded header continuation
      inHeaderBlock = false;
      if (/^\s*(?:List|X)-[\w-]+\s*:/i.test(line)) continue;
      out.push(line);
    }
    text = out.join('\n');

    // Quoted reply chain ("On … wrote:", "Den … skrev:") and everything after it
    text = cutAt(text, QUOTE_INTRO);
    // Signature delimiter "-- " and everything after it
    text = cutAt(text, /^--\s*$/m);
    // Sign-off: drop it and at most the short signature block after it
    const so = SIGNOFF.exec(text);
    if (so) {
      const tail = text.slice(so.index + so[0].length);
      const sigLines = tail.split('\n').filter((l) => l.trim());
      if (sigLines.length <= 6) text = text.slice(0, so.index);
    }
    text = text.replace(MOBILE, '');

    text = text
      .replace(/mailto:\S+/gi, '')
      .replace(EMAIL, '')
      .replace(/\[e-post fjernet\]/gi, '')
      .replace(/<\s*>/g, '')
      .replace(/\(\s*\)/g, '');
    text = stripPhones(text);

    return text
      .replace(/[ \t]+\n/g, '\n')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function sanitizeSubject(subject) {
    let s = String(subject || '');
    for (let i = 0; i < 4; i++) s = s.replace(/^\s*(?:re|sv|fw|fwd|vs|aw|wg)\s*:\s*/i, '');
    return s.replace(EMAIL, '').replace(/<\s*>/g, '').replace(/\s{2,}/g, ' ').trim();
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
