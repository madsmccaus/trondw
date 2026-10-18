// Forside, Arkiv and every post are one page: links swap the content in place (no reload).
(function(){
const root=document.getElementById('root');
const reduce=matchMedia('(prefers-reduced-motion: reduce)');
const MNF=TW.MNF,cap=s=>s.charAt(0).toUpperCase()+s.slice(1);
const MO_ABBR=['Jan','Feb','Mar','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Des'];
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

function archiveMonths(rows){
  const sorted=[...rows].sort((a,b)=>a[1].localeCompare(b[1]));
  const byMo=new Map();
  sorted.forEach(r=>{const mo=r[1].slice(5,7);if(!byMo.has(mo))byMo.set(mo,[]);byMo.get(mo).push(r);});
  return Array.from({length:12},(_,i)=>{const mo=String(i+1).padStart(2,'0');return{mo,rows:byMo.get(mo)||[]};});
}
function archiveNavHTML(y,groups,hashMo){
  const years=YEARS.map(([yy])=>`<a href="/v4/arkiv?y=${yy}"${y&&yy===y?' aria-current="page"':''}>${yy}</a>`).join('');
  const months=groups.map((g,i)=>{const label=MO_ABBR[i];
    if(!g.rows.length)return `<span class="mo-empty" aria-hidden="true">${label}</span>`;
    const cur=hashMo===g.mo?' aria-current="page"':'';
    return `<a href="/v4/arkiv?y=${y}#m-${g.mo}"${cur}>${label}</a>`;}).join('');
  return `<div class="ark-nav" aria-label="Arkivnavigasjon">
    <nav class="ark-years" aria-label="År">${years}</nav>
    <nav class="ark-months" aria-label="Måneder">${months}</nav></div>`;}
function monthBodyHTML(y,groups){
  return groups.filter(g=>g.rows.length).map(g=>`<section class="month" id="m-${g.mo}" aria-labelledby="h-${g.mo}"><h2 id="h-${g.mo}">${cap(MNF[+g.mo-1])} ${y}</h2><ol>${
    g.rows.map(r=>`<li class="row"><p class="date">${TW.date(r[1])}</p><h3><a href="${postHref(r[3],r[0])}">${TW.esc(r[2])}</a></h3>${r[4]?`<p class="x">${TW.esc(r[4])}</p>`:''}</li>`).join('')}</ol></section>`).join('');}
function archiveIndexBody(){
  return `<div class="ark-intro"><p class="ark-lead">Velg et år for å bla i innlegg.</p>
    <ul class="ark-year-list">${YEARS.map(([yy,n])=>`<li><a href="/v4/arkiv?y=${yy}">${yy}</a><span class="n">${fmt(n)} innlegg</span></li>`).join('')}</ul></div>`;}
function archiveHTML(y,rows,hashMo){
  const groups=y?archiveMonths(rows):Array.from({length:12},(_,i)=>({mo:String(i+1).padStart(2,'0'),rows:[]}));
  const body=y?monthBodyHTML(y,groups):archiveIndexBody();
  const count=y?`<p class="ark-count">${fmt(rows.length)} innlegg</p>`:'';
  return `<div class="ark-shell">
    <h1 class="sr">${y?`Arkiv ${y}`:'Arkiv'}</h1>
    ${archiveNavHTML(y,groups,hashMo)}
    ${count}
    <div class="ark-body">${body}</div></div>`;}

// ── views ──
function homeHTML(all,meta){const n=meta.total_posts!=null?fmt(meta.total_posts):'';
  const dr=meta.date_range;const range=dr&&dr[0]&&dr[1]?`${dr[0].slice(0,4)}–${dr[1].slice(0,4)}`:'2016–2022';
  return (all.length?all.map(p=>`
    <article class="entry">
      <p class="date">${TW.date(p.d)}${tag(p)}</p>
      <h2 class="title"><a href="${postHref(p.m,p.i)}">${TW.esc(p.t)}</a></h2>
      <p class="excerpt">${TW.esc(TW.preview(p.x,280))}</p>
      <a class="more" href="${postHref(p.m,p.i)}">Les videre →</a>
    </article>`).join(''):'<p class="empty">Ingen nye innlegg ennå.</p>')+`
    <section class="archive">
      <a href="/v4/arkiv">Gå til arkivet →</a>
      <p>${n?`${n} innlegg fra ${range}.`:`Innlegg fra ${range}.`}</p>
    </section>`;}
function postHTML(p,from){const back=from&&from.startsWith('/v4/arkiv')
    ?`<a class="back" href="${TW.esc(from)}" data-back>← Tilbake til arkivet</a>`:'<a class="back" href="/v4" data-back>← Tilbake til forsiden</a>';
  return `${back}
    <article class="article">
      <p class="date">${TW.date(p.d)}${tag(p)}</p>
      <h1>${TW.esc(p.t)}</h1>
      <div class="body">${TW.paras(p.x)}</div>
    </article>
    <p class="back-tail">${back}</p>`;}
async function view(u,from){
  const q=u.searchParams;
  if(u.pathname==='/v4/arkiv'){
    YEARS=YEARS||(await getJSON('/data/arkiv/years.json'))||[];
    const want=q.get('y');
    const hashMo=u.hash.match(/^#m-(\d{2})$/)?.[1]||'';
    if(!want){
      return {title:'Arkiv · Trond Worren',nav:'/v4/arkiv',html:archiveHTML(null,[],hashMo)};}
    const y=YEARS.some(([yy])=>yy===want)?want:(YEARS.length?YEARS[YEARS.length-1][0]:'');
    yearFiles[y]=yearFiles[y]||getJSON(`/data/arkiv/${y}.json`);const rows=(await yearFiles[y])||[];
    return {title:`Arkiv ${y} · Trond Worren`,nav:'/v4/arkiv',html:archiveHTML(y,rows,hashMo)};}
  const m=q.get('m'),i=q.get('i');
  if(m&&i){const p=await find(m,i);
    if(!p)return {title:'Trond Worren',nav:'',html:'<p class="empty">Fant ikke innlegget.</p>'};
    return {title:`${p.t} · Trond Worren`,nav:'',html:postHTML(p,from!==undefined?from:((history.state&&history.state.from)||''))};}
  return {title:'Trond Worren',nav:'/v4',html:homeHTML(await posts(),await getMeta())};
}
function focusView(){const h=root.querySelector('h1:not(.sr)');
  if(h){h.setAttribute('tabindex','-1');h.focus({preventScroll:true});return;}
  root.setAttribute('tabindex','-1');root.focus({preventScroll:true});}
function setNav(v){document.querySelectorAll('.site-nav a').forEach(a=>{if(a.getAttribute('href')===v.nav)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});}
function paint(v,{focus=false}={}){document.title=v.title;root.innerHTML=v.html;setNav(v);
  topBtn();if(focus)focusView();}

// ── navigation ──
const named=[];
function name(el,n){if(el){el.style.viewTransitionName=n;named.push(el);}}
function unname(){named.splice(0).forEach(el=>el.style.viewTransitionName='');}
let busy=null;
async function go(url,{push=true}={}){
  const u=new URL(url,location.href);
  const toPost=!!(u.searchParams.get('m')&&u.searchParams.get('i'));
  const v=await view(u,push?location.pathname+location.search:undefined);
  const apply=()=>{
    const st=history.state||{};
    if(u.hash&&push){const t=document.getElementById(u.hash.slice(1));if(t){paint(v);t.scrollIntoView({behavior:'instant'});return;}}
    if(toPost)scrollTo(0,0);
    else if(!push)scrollTo(0,st.y||0);
    paint(v,{focus:false});
    if(toPost)scrollTo(0,0);
    if(u.hash){document.getElementById(u.hash.slice(1))?.scrollIntoView({behavior:'instant'});}};
  if(push){history.replaceState({...(history.state||{}),y:scrollY},'');
    const from=location.pathname+location.search;
    history.pushState({y:0,from:u.searchParams.get('m')?from:''},'',u);}
  if(!document.startViewTransition||reduce.matches){apply();focusView();return;}
  if(busy)busy.skipTransition();
  unname();
  name(document.querySelector('.site-head'),'site-head');
  name(root,'page-content');
  busy=document.startViewTransition(apply);
  busy.finished.finally(()=>{unname();busy=null;focusView();});
}
if('scrollRestoration' in history)history.scrollRestoration='manual';
document.addEventListener('click',e=>{const a=e.target.closest('a[href]');
  if(!a||e.defaultPrevented||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||e.button||a.target)return;
  const u=new URL(a.href,location.href);if(u.origin!==location.origin)return;
  if(u.pathname!=='/v4'&&u.pathname!=='/v4/arkiv')return;
  if(u.pathname===location.pathname&&u.search===location.search&&u.hash)return;
  e.preventDefault();
  if(a.hasAttribute('data-back')){const st=history.state||{};const want=st.from||'/v4';
    if(history.length>1&&st.prev===want){history.back();return;}}
  go(u.href,{push:true});});
const _push=history.pushState.bind(history);
history.pushState=(s,t,u)=>_push({...s,prev:location.pathname+location.search},t,u);
addEventListener('popstate',()=>go(location.href,{push:false}));

const tb=document.createElement('button');tb.className='to-top';tb.type='button';tb.setAttribute('aria-label','Til toppen');tb.textContent='↑';
document.body.appendChild(tb);
tb.addEventListener('click',()=>{scrollTo({top:0,behavior:reduce.matches?'auto':'smooth'});root.querySelector('a,h1,[tabindex]')?.focus({preventScroll:true});});
let rafTop=0;function topBtn(){cancelAnimationFrame(rafTop);rafTop=requestAnimationFrame(()=>{tb.classList.toggle('on',scrollY>innerHeight*1.5&&document.documentElement.scrollHeight>innerHeight*3);});}
addEventListener('scroll',topBtn,{passive:true});

view(new URL(location.href)).then(v=>{paint(v);const st=history.state||{};
  if(location.hash){document.getElementById(location.hash.slice(1))?.scrollIntoView();}else if(st.y)scrollTo(0,st.y);});
})();
