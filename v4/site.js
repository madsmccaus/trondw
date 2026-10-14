// Shared header behaviour: the theme switch.
(function(){
  const b=document.getElementById('theme');if(!b)return;
  const set=t=>{document.documentElement.dataset.theme=t;b.setAttribute('aria-checked',String(t==='dark'));};
  set(document.documentElement.dataset.theme||'light');
  b.addEventListener('click',()=>{const t=document.documentElement.dataset.theme==='dark'?'light':'dark';set(t);try{localStorage.setItem('tw-theme',t)}catch(e){}});
  // follow the system until the reader has made a choice
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change',e=>{let s=null;try{s=localStorage.getItem('tw-theme')}catch(_){}if(!s)set(e.matches?'dark':'light');});
})();
