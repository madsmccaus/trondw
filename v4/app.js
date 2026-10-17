// Forside, Arkiv and every post are one page: links swap the content in place (no reload),
// the clicked title morphs into the post heading, history and scroll position behave as usual.
(function(){
const root=document.getElementById('root');
const reduce=matchMedia('(prefers-reduced-motion: reduce)');
const MNF=TW.MNF,cap=s=>s.charAt(0).toUpperCase()+s.slice(1);
const fmt=n=>String(n).replace(/\B(?=(\d{3})+(?!\d))/g,'\u00a0');
let ALL=null,META=null;const monthFiles={},yearFiles={};let YEARS=null;
const getMeta=async()=>{if(!META)META=await getJSON('/data/meta.json');return META||{};};
const posts=async()=>{if(!ALL)ALL=(await TW.latest()).map(TW.clean).filter(p=>p.x);return ALL;};
const getJSON=u=>fetch(u).then(r=>r.ok?r.json():null).catch(()=>null);
async function find(m,i){const all=await posts();const p=all.find(x=>x.m===m&&String(x.i)===i);if(p)return p;
  if(!/^\d{4}-\d{2}$/.test(m))return null;
  monthFiles[m]=monthFiles[m]||getJSON(`/data/${m}.json`);
  const hit=((await monthFiles[m])||[]).find(x=>String(x.i)===i);return hit?TW.clean({...hit,m}):null;}
const key=(m,i)=>`${m}/${i}`;
const postHref=(m,i)=>`/v4?m=${encodeURIComponent(m)}&i=${encodeURIComponent(i)}`;
const tag=p=>p.sample?' · <span class="sample">Eksempel</span>':'';

// ── views ──
function homeHTML(all,meta){const n=meta.total_posts!=null?fmt(meta.total_posts):'';
  const dr=meta.date_range;const range=dr&&dr[0]&&dr[1]?`${dr[0].slice(0,4)}–${dr[1].slice(0,4)}`:'2016–2022';
  return (all.length?all.map(p=>`
    <article class="entry">
      <p class="date">${TW.date(p.d)}${tag(p)}</p>
      <h2 class="title" data-k="${TW.esc(key(p.m,p.i))}"><a href="${postHref(p.m,p.i)}">${TW.esc(p.t)}</a></h2>
      <p class="excerpt">${TW.esc(TW.preview(p.x,280))}</p>
      <a class="more" href="${postHref(p.m,p.i)}">Les videre →</a>
    </article>`).join(''):'<p class="empty">Ingen nye innlegg ennå.</p>')+`
    <section class="archive">
      <a href="/v4/arkiv">Gå til arkivet →</a>
      <p>${n?`${n} innlegg fra ${range}.`:`Innlegg fra ${range}.`}</p>
    </section>`;}
function archiveHTML(y,rows){
  const months=[];rows.forEach(r=>{const mo=r[1].slice(5,7);let g=months[months.length-1];if(!g||g.mo!==mo){g={mo,rows:[]};months.push(g);}g.rows.push(r);});
  return `<h1 class="sr">Arkiv ${y}</h1>
    <nav class="ark-years" aria-label="År">${YEARS.map(([yy])=>`<a href="/v4/arkiv?y=${yy}"${yy===y?' aria-current="page"':''}>${yy}</a>`).join('')}</nav>
    <nav class="ark-months" aria-label="Måneder">${months.map(g=>`<a href="#m-${g.mo}">${cap(MNF[+g.mo-1])}</a>`).join('')}</nav>
    <p class="ark-count">${fmt(rows.length)} innlegg</p>
    ${months.map(g=>`<section class="month" id="m-${g.mo}" aria-labelledby="h-${g.mo}"><h2 id="h-${g.mo}">${cap(MNF[+g.mo-1])} ${y}</h2><ol>${
      g.rows.map(r=>`<li class="row"><p class="date">${TW.date(r[1])}</p><h3><a href="${postHref(r[3],r[0])}" data-k="${TW.esc(key(r[3],r[0]))}">${TW.esc(r[2])}</a></h3>${r[4]?`<p class="x">${TW.esc(r[4])}</p>`:''}</li>`).join('')}</ol></section>`).join('')}`;}
function postHTML(p,from){const back=from&&from.startsWith('/v4/arkiv')
    ?`<a class="back" href="${TW.esc(from)}" data-back>← Tilbake til arkivet</a>`:'<a class="back" href="/v4" data-back>← Tilbake til forsiden</a>';
  return `${back}
    <article class="article">
      <p class="date">${TW.date(p.d)}${tag(p)}</p>
      <h1 data-k="${TW.esc(key(p.m,p.i))}">${TW.esc(p.t)}</h1>
      <div class="body">${TW.paras(p.x)}</div>
    </article>
    <p class="back-tail">${back}</p>`;}
// returns a paint function, so all data is loaded before the old view leaves
async function view(u,from){
  const q=u.searchParams;
  if(u.pathname==='/v4/arkiv'){
    YEARS=YEARS||(await getJSON('/data/arkiv/years.json'))||[];
    const y=YEARS.some(([yy])=>yy===q.get('y'))?q.get('y'):(YEARS.length?YEARS[YEARS.length-1][0]:'');
    yearFiles[y]=yearFiles[y]||getJSON(`/data/arkiv/${y}.json`);const rows=(await yearFiles[y])||[];
    return {title:`Arkiv ${y} · Trond Worren`,nav:'/v4/arkiv',html:archiveHTML(y,rows)};}
  const m=q.get('m'),i=q.get('i');
  if(m&&i){const p=await find(m,i);
    if(!p)return {title:'Trond Worren',nav:'',html:'<p class="empty">Fant ikke innlegget.</p>'};
    return {title:`${p.t} · Trond Worren`,nav:'',html:postHTML(p,from!==undefined?from:((history.state&&history.state.from)||''))};}
  return {title:'Trond Worren',nav:'/v4',html:homeHTML(await posts(),await getMeta())};
}
function focusView(){const h=root.querySelector('h1:not(.sr)');
  if(h){if(!h.hasAttribute('tabindex'))h.setAttribute('tabindex','-1');h.focus({preventScroll:true});return;}
  if(!root.hasAttribute('tabindex'))root.setAttribute('tabindex','-1');root.focus({preventScroll:true});}
function paint(v,{focus=false}={}){document.title=v.title;root.innerHTML=v.html;
  document.querySelectorAll('.site-nav a').forEach(a=>{if(a.getAttribute('href')===v.nav)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
  topBtn();if(focus)focusView();}

// ── navigation ──
const named=[];
function name(el,n){if(el){el.style.viewTransitionName=n;named.push(el);}}
function unname(){named.splice(0).forEach(el=>el.style.viewTransitionName='');}
const byKey=k=>k?root.querySelector(`[data-k="${CSS.escape(k)}"]`):null;
const morphProps=['--vt-title-ms','--vt-root-in-delay','--vt-root-in-ms'];
function setMorphTiming(el){
  const dist=Math.max(0,el.getBoundingClientRect().top-170);
  const ms=Math.min(320,Math.round(220+dist*0.11));
  const rootDelay=Math.round(ms*0.76);
  document.documentElement.style.setProperty('--vt-title-ms',ms+'ms');
  document.documentElement.style.setProperty('--vt-root-in-delay',rootDelay+'ms');
  document.documentElement.style.setProperty('--vt-root-in-ms','150ms');
}
function clearMorphTiming(){morphProps.forEach(p=>document.documentElement.style.removeProperty(p));}
let busy=null;
async function go(url,{push=true,k=null}={}){
  const u=new URL(url,location.href);
  const st0=history.state||{};
  const postKey=k||st0.k;
  const morphEl=postKey?byKey(postKey):null;
  const morph=!!morphEl;
  const toPost=!!(u.searchParams.get('m')&&u.searchParams.get('i'));
  const v=await view(u,push?location.pathname+location.search:undefined); // load first; nothing moves until the next view is ready
  const apply=()=>{
    const st=history.state||{};
    if(u.hash&&push){const t=document.getElementById(u.hash.slice(1));if(t){paint(v);t.scrollIntoView();return;}}
    if(toPost)scrollTo(0,0);
    else if(!push)scrollTo(0,st.y||0);
    paint(v,{focus:false});
    if(toPost)scrollTo(0,0);
    const hd=document.querySelector('.site-head'),hn=hd.style.viewTransitionName;
    unname();if(hn)name(hd,hn);name(byKey(postKey),'post-title');};
  if(push){history.replaceState({...(history.state||{}),y:scrollY,k:postKey||st0.k},'');
    const from=location.pathname+location.search;
    history.pushState({y:0,from:u.searchParams.get('m')?from:'',k:postKey||''},'',u);}
  if(!document.startViewTransition||reduce.matches){apply();if(toPost||morph)focusView();return;}
  if(busy)busy.skipTransition();
  unname();if(morphEl)name(morphEl,'post-title');
  // the header only stays fixed when it is on screen on both sides; otherwise it simply fades with the page
  const head=document.querySelector('.site-head'),toY=push?0:((history.state&&history.state.y)||0);
  if(scrollY>2||toY>2)name(head,'none');
  if(morph)setMorphTiming(morphEl);
  document.documentElement.classList.toggle('vt-morph',morph);
  busy=document.startViewTransition(apply);
  busy.finished.finally(()=>{unname();document.documentElement.classList.remove('vt-morph');clearMorphTiming();busy=null;focusView();});
}
if('scrollRestoration' in history)history.scrollRestoration='manual';
document.addEventListener('click',e=>{const a=e.target.closest('a[href]');
  if(!a||e.defaultPrevented||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||e.button||a.target)return;
  const u=new URL(a.href,location.href);if(u.origin!==location.origin)return;
  if(u.pathname!=='/v4'&&u.pathname!=='/v4/arkiv')return;                 // Bøker and Om are their own pages
  if(u.pathname===location.pathname&&u.search===location.search&&u.hash){return;} // in-page month links
  e.preventDefault();
  // the back link returns to the entry we came from, so the browser keeps its place
  if(a.hasAttribute('data-back')){const st=history.state||{};const want=st.from||'/v4';
    if(history.length>1&&st.prev===want){history.back();return;}}
  const k=a.dataset.k||(a.closest('.entry')&&a.closest('.entry').querySelector('[data-k]')?.dataset.k)||null;
  go(u.href,{push:true,k});});
// mark the entry we push from so a back link can step back instead of stacking history
const _push=history.pushState.bind(history);
history.pushState=(s,t,u)=>_push({...s,prev:location.pathname+location.search},t,u);
addEventListener('popstate',()=>{const k=(history.state&&history.state.k)||null;go(location.href,{push:false,k});});

// ── back to top, only for long views ──
const tb=document.createElement('button');tb.className='to-top';tb.type='button';tb.setAttribute('aria-label','Til toppen');tb.textContent='↑';
document.body.appendChild(tb);
tb.addEventListener('click',()=>{scrollTo({top:0,behavior:reduce.matches?'auto':'smooth'});root.querySelector('a,h1,[tabindex]')?.focus({preventScroll:true});});
let raf=0;function topBtn(){cancelAnimationFrame(raf);raf=requestAnimationFrame(()=>{tb.classList.toggle('on',scrollY>innerHeight*1.5&&document.documentElement.scrollHeight>innerHeight*3);});}
addEventListener('scroll',topBtn,{passive:true});

view(new URL(location.href)).then(v=>{paint(v);const st=history.state||{};
  if(location.hash){document.getElementById(location.hash.slice(1))?.scrollIntoView();}else if(st.y)scrollTo(0,st.y);});
})();
