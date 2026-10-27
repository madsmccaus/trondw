const { escapeHtml, shell } = require('./page');

const SCRIPT = `(function(){
  var form=document.getElementById('contact');
  if(!form)return;
  var status=document.getElementById('status');
  var button=form.querySelector('button[type="submit"]');
  form.addEventListener('submit',function(e){
    e.preventDefault();
    status.className='status';
    status.textContent='';
    if(!form.message.value.trim()){
      status.className='status bad';
      status.textContent='Skriv en melding først.';
      form.message.focus();
      return;
    }
    button.disabled=true;
    var data={name:form.name.value,email:form.email.value,message:form.message.value,company:form.company.value};
    fetch('/kontakt',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data),credentials:'same-origin'})
      .then(function(r){return r.json().then(function(b){return {ok:r.ok,body:b};}).catch(function(){return {ok:false,body:null};});})
      .then(function(res){
        if(res.ok){
          form.hidden=true;
          status.className='status ok';
          status.textContent='Takk. Meldingen er sendt.';
          return;
        }
        status.className='status bad';
        status.textContent=(res.body&&res.body.error)||'Meldingen ble ikke sendt. Prøv igjen om litt.';
      })
      .catch(function(){
        status.className='status bad';
        status.textContent='Meldingen ble ikke sendt. Prøv igjen om litt.';
      })
      .then(function(){button.disabled=false;});
  });
})();`;

function formHtml(values = {}, error = '') {
  const status = error ? `<p id="status" class="status bad" role="status">${escapeHtml(error)}</p>` : '<p id="status" class="status" role="status"></p>';
  return `<div class="prose">
<h1>Kontakt</h1>
<p class="lede">En kort melding er nok. Navn og e-post er valgfrie. Legg igjen e-post bare hvis du vil ha svar.</p>
${status}
<form class="quiet-form" id="contact" method="post" action="/kontakt">
  <label>Navn <span class="opt">valgfritt</span>
    <input name="name" maxlength="80" autocomplete="name" value="${escapeHtml(values.name || '')}">
  </label>
  <label>E-post <span class="opt">valgfritt, hvis du vil ha svar</span>
    <input name="email" type="email" maxlength="120" autocomplete="email" value="${escapeHtml(values.email || '')}">
  </label>
  <label>Melding
    <textarea name="message" maxlength="4000" rows="8">${escapeHtml(values.message || '')}</textarea>
  </label>
  <div class="hp" aria-hidden="true">
    <label>Ikke fyll ut<input name="company" tabindex="-1" autocomplete="off" value=""></label>
  </div>
  <button type="submit">Send</button>
</form>
</div>`;
}

function contactPage({ error = '', values = {}, ok = false } = {}) {
  const main = ok
    ? `<div class="prose"><h1>Kontakt</h1><p class="lede">Takk. Meldingen er sendt.</p></div>`
    : formHtml(values, error);
  return shell({
    title: 'Kontakt · Trond Worren',
    main,
    script: ok ? '' : SCRIPT,
  });
}

module.exports = { contactPage };
