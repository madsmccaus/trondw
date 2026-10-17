// Forside, Arkiv and every post are one page: links swap the content in place (no reload),
// the clicked title morphs into the post heading, history and scroll position behave as usual.
(function(){
const root=document.getElementById('root');
const reduce=matchMedia('(prefers-reduced-motion: reduce)');
const MNF=TW.MNF,cap=s=>s.charAt(0).toUpperCase()+s.slice(1);
const fmt=n=>String(n).replace(/\B(?=(\d{3})+(?!\d))/g,'\u00a0');
const EMIL_EASE='cubic-bezier(0.2, 0, 0, 1)';
const MORPH_MAX_DIST=420;
const MORPH_MAX_SCROLL=80;
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
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const raf=()=>new Promise(r=>requestAnimationFrame(r));

function archiveMonths(rows){
  const sorted=[...rows].sort((a,b)=>a[1].localeCompare(b[1]));
  const byMo=new Map();
  sorted.forEach(r=>{const mo=r[1].slice(5,7);if(!byMo.has(mo))byMo.set(mo,[]);byMo.get(mo).push(r);});
  return Array.from({length:12},(_,i)=>{const mo=String(i+1).padStart(2,'0');return{mo,rows:byMo.get(mo)||[]};});
}
function monthNavHTML(groups){
  return groups.map(g=>g.rows.length
    ?`<a href="#m-${g.mo}">${cap(MNF[+g.mo-1])}</a>`
    :`<span class="mo-empty" aria-hidden="true">${cap(MNF[+g.mo-1])}</span>`).join('');}
function monthBodyHTML(y,groups){
  return groups.filter(g=>g.rows.length).map(g=>`<section class="month" id="m-${g.mo}" aria-labelledby="h-${g.mo}"><h2 id="h-${g.mo}">${cap(MNF[+g.mo-1])} ${y}</h2><ol>${
    g.rows.map(r=>`<li class="row"><p class="date">${TW.date(r[1])}</p><h3><a href="${postHref(r[3],r[0])}" data-k="${TW.esc(key(r[3],r[0]))}">${TW.esc(r[2])}</a></h3>${r[4]?`<p class="x">${TW.esc(r[4])}</p>`:''}</li>`).join('')}</ol></section>`).join('');}
function archiveHTML(y,rows){
  const groups=archiveMonths(rows);
  return `<div class="ark-shell">
    <h1 class="sr ark-page-title">Arkiv ${y}</h1>
    <nav class="ark-years" aria-label="År">${YEARS.map(([yy])=>`<a href="/v4/arkiv?y=${yy}"${yy===y?' aria-current="page"':''}>${yy}</a>`).join('')}</nav>
    <nav class="ark-months" aria-label="Måneder">${monthNavHTML(groups)}</nav>
    <p class="ark-count">${fmt(rows.length)} innlegg</p>
    <div class="ark-body">${monthBodyHTML(y,groups)}</div></div>`;}

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
    return {title:`Arkiv ${y} · Trond Worren`,nav:'/v4/arkiv',html:archiveHTML(y,rows),archive:{y,rows}};}
  const m=q.get('m'),i=q.get('i');
  if(m&&i){const p=await find(m,i);
    if(!p)return {title:'Trond Worren',nav:'',html:'<p class="empty">Fant ikke innlegget.</p>'};
    return {title:`${p.t} · Trond Worren`,nav:'',html:postHTML(p,from!==undefined?from:((history.state&&history.state.from)||''))};}
  return {title:'Trond Worren',nav:'/v4',html:homeHTML(await posts(),await getMeta())};
}
function focusView(){const h=root.querySelector('h1:not(.sr)');
  if(h){if(!h.hasAttribute('tabindex'))h.setAttribute('tabindex','-1');h.focus({preventScroll:true});return;}
  if(!root.hasAttribute('tabindex'))root.setAttribute('tabindex','-1');root.focus({preventScroll:true});}
function setNav(v){document.querySelectorAll('.site-nav a').forEach(a=>{if(a.getAttribute('href')===v.nav)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});}
function paint(v,{focus=false}={}){document.title=v.title;root.innerHTML=v.html;setNav(v);
  topBtn();if(focus)focusView();}
function updateArchiveShell(v){
  const {y,rows}=v.archive;const groups=archiveMonths(rows);
  const shell=root.querySelector('.ark-shell');if(!shell)return false;
  const t=shell.querySelector('.ark-page-title');if(t)t.textContent=`Arkiv ${y}`;
  shell.querySelectorAll('.ark-years a').forEach(a=>{
    const on=a.getAttribute('href')===`/v4/arkiv?y=${y}`;
    if(on)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
  const mn=shell.querySelector('.ark-months');if(mn)mn.innerHTML=monthNavHTML(groups);
  const c=shell.querySelector('.ark-count');if(c)c.textContent=`${fmt(rows.length)} innlegg`;
  const body=shell.querySelector('.ark-body');if(body)body.innerHTML=monthBodyHTML(y,groups);
  document.title=v.title;setNav(v);return true;}

// ── title morph (FLIP ghost over blank page) ──
const byKey=k=>k?root.querySelector(`[data-k="${CSS.escape(k)}"]`):null;
function morphAllowed(el){
  if(!el||reduce.matches)return false;
  if(scrollY>MORPH_MAX_SCROLL)return false;
  const dist=Math.max(0,el.getBoundingClientRect().top-170);
  return dist<=MORPH_MAX_DIST;}
function copyTitleTypography(el,target){
  const s=getComputedStyle(el),link=el.querySelector('a'),text=link?link.textContent:el.textContent;
  target.textContent=text;
  target.style.fontFamily=s.fontFamily;
  target.style.fontSize=s.fontSize;
  target.style.fontWeight=s.fontWeight;
  target.style.fontStyle=s.fontStyle;
  target.style.lineHeight=s.lineHeight;
  target.style.letterSpacing=s.letterSpacing;
  target.style.color=s.color;
  target.style.textWrap=s.textWrap||'balance';
}
async function flipPostMorph(v,fromEl,postKey){
  const from=fromEl.getBoundingClientRect();
  const dist=Math.max(0,from.top-170);
  const ms=Math.min(320,Math.round(200+dist*0.11));
  root.classList.add('morph-blank');
  root.style.transition='opacity 120ms ease-in';
  root.style.opacity='0';
  await wait(120);
  const ghost=document.createElement('div');
  ghost.className='title-morph-ghost';
  ghost.setAttribute('aria-hidden','true');
  copyTitleTypography(fromEl,ghost);
  ghost.style.left=from.left+'px';
  ghost.style.top=from.top+'px';
  ghost.style.width=from.width+'px';
  document.body.appendChild(ghost);
  root.style.transition='';
  root.style.opacity='';
  root.classList.remove('morph-blank');
  document.documentElement.classList.add('morph-stage');
  paint(v,{focus:false});
  scrollTo(0,0);
  root.style.visibility='hidden';
  const toEl=byKey(postKey);
  const article=root.querySelector('.article');
  if(article)article.classList.add('morph-wait');
  await raf();await raf();
  const to=toEl.getBoundingClientRect();
  const ts=getComputedStyle(toEl);
  const dx=to.left-from.left,dy=to.top-from.top;
  const anim=ghost.animate([
    {left:from.left+'px',top:from.top+'px',width:from.width+'px',fontSize:getComputedStyle(ghost).fontSize},
    {left:to.left+'px',top:to.top+'px',width:to.width+'px',fontSize:ts.fontSize}
  ],{duration:ms,easing:EMIL_EASE,fill:'forwards'});
  await anim.finished.catch(()=>{});
  ghost.remove();
  root.style.visibility='';
  document.documentElement.classList.remove('morph-stage');
  if(article){
    article.classList.remove('morph-wait');
    article.style.opacity='0';
    article.style.transition='opacity 180ms ease-out';
    await raf();
    article.style.opacity='1';
    await wait(180);
    article.style.transition='';
    article.style.opacity='';
  }
}

// ── navigation ──
const named=[];
function name(el,n){if(el){el.style.viewTransitionName=n;named.push(el);}}
function unname(){named.splice(0).forEach(el=>el.style.viewTransitionName='');}
async function fadeArkBody(v){
  const body=root.querySelector('.ark-body');
  if(!body){paint(v);return;}
  body.style.transition='opacity 150ms ease';
  body.style.opacity='0';
  await wait(150);
  updateArchiveShell(v);
  await raf();
  body.style.opacity='1';
  await wait(150);
  body.style.transition='';
  body.style.opacity='';
}
let busy=null;
async function go(url,{push=true,k=null}={}){
  const u=new URL(url,location.href);
  const st0=history.state||{};
  const postKey=k||st0.k;
  const morphEl=postKey?byKey(postKey):null;
  const toPost=!!(u.searchParams.get('m')&&u.searchParams.get('i'));
  const onArchive=location.pathname==='/v4/arkiv';
  const toArchive=u.pathname==='/v4/arkiv';
  const arkYearSwap=onArchive&&toArchive&&!u.hash&&!toPost;
  const v=await view(u,push?location.pathname+location.search:undefined);
  const useFlip=toPost&&morphEl&&morphAllowed(morphEl);
  const apply=()=>{
    const st=history.state||{};
    if(u.hash&&push){const t=document.getElementById(u.hash.slice(1));if(t){paint(v);t.scrollIntoView();return;}}
    if(toPost)scrollTo(0,0);
    else if(!push)scrollTo(0,st.y||0);
    paint(v,{focus:false});
    if(toPost)scrollTo(0,0);};
  if(push){history.replaceState({...(history.state||{}),y:scrollY,k:postKey||st0.k},'');
    const from=location.pathname+location.search;
    history.pushState({y:0,from:u.searchParams.get('m')?from:'',k:postKey||''},'',u);}
  if(useFlip){
    try{await flipPostMorph(v,morphEl,postKey);}catch(_){paint(v);if(toPost)scrollTo(0,0);}
    focusView();return;}
  if(arkYearSwap&&root.querySelector('.ark-shell')&&v.archive){
    document.title=v.title;setNav(v);
    const shell=root.querySelector('.ark-shell');
    name(shell.querySelector('.ark-years'),'ark-years');
    name(shell.querySelector('.ark-months'),'ark-months');
    name(shell.querySelector('.ark-page-title'),'ark-title');
    if(!document.startViewTransition||reduce.matches){await fadeArkBody(v);focusView();return;}
    if(busy)busy.skipTransition();
    unname();
    name(document.querySelector('.site-head'),'site-head');
    name(shell.querySelector('.ark-years'),'ark-years');
    name(shell.querySelector('.ark-months'),'ark-months');
    name(shell.querySelector('.ark-page-title'),'ark-title');
    name(shell.querySelector('.ark-body'),'ark-content');
    document.documentElement.classList.add('vt-quiet');
    busy=document.startViewTransition(()=>updateArchiveShell(v));
    busy.finished.finally(()=>{unname();document.documentElement.classList.remove('vt-quiet');busy=null;focusView();});
    return;}
  if(!document.startViewTransition||reduce.matches){apply();if(toPost||morphEl)focusView();return;}
  if(busy)busy.skipTransition();
  unname();
  name(document.querySelector('.site-head'),'site-head');
  const shell=root.querySelector('.ark-shell');
  if(onArchive&&toArchive&&shell){
    name(shell.querySelector('.ark-years'),'ark-years');
    name(shell.querySelector('.ark-months'),'ark-months');
    name(shell.querySelector('.ark-page-title'),'ark-title');
  }
  document.documentElement.classList.add('vt-quiet');
  busy=document.startViewTransition(apply);
  busy.finished.finally(()=>{unname();document.documentElement.classList.remove('vt-quiet');busy=null;focusView();});
}
if('scrollRestoration' in history)history.scrollRestoration='manual';
document.addEventListener('click',e=>{const a=e.target.closest('a[href]');
  if(!a||e.defaultPrevented||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||e.button||a.target)return;
  const u=new URL(a.href,location.href);if(u.origin!==location.origin)return;
  if(u.pathname!=='/v4'&&u.pathname!=='/v4/arkiv')return;
  if(u.pathname===location.pathname&&u.search===location.search&&u.hash){return;}
  e.preventDefault();
  if(a.hasAttribute('data-back')){const st=history.state||{};const want=st.from||'/v4';
    if(history.length>1&&st.prev===want){history.back();return;}}
  const k=a.dataset.k||(a.closest('.entry')&&a.closest('.entry').querySelector('[data-k]')?.dataset.k)
    ||(a.closest('.row')&&a.closest('.row').querySelector('[data-k]')?.dataset.k)||null;
  go(u.href,{push:true,k});});
const _push=history.pushState.bind(history);
history.pushState=(s,t,u)=>_push({...s,prev:location.pathname+location.search},t,u);
addEventListener('popstate',()=>{const k=(history.state&&history.state.k)||null;go(location.href,{push:false,k});});

// ── back to top, only for long views ──
const tb=document.createElement('button');tb.className='to-top';tb.type='button';tb.setAttribute('aria-label','Til toppen');tb.textContent='↑';
document.body.appendChild(tb);
tb.addEventListener('click',()=>{scrollTo({top:0,behavior:reduce.matches?'auto':'smooth'});root.querySelector('a,h1,[tabindex]')?.focus({preventScroll:true});});
let rafTop=0;function topBtn(){cancelAnimationFrame(rafTop);rafTop=requestAnimationFrame(()=>{tb.classList.toggle('on',scrollY>innerHeight*1.5&&document.documentElement.scrollHeight>innerHeight*3);});}
addEventListener('scroll',topBtn,{passive:true});

view(new URL(location.href)).then(v=>{paint(v);const st=history.state||{};
  if(location.hash){document.getElementById(location.hash.slice(1))?.scrollIntoView();}else if(st.y)scrollTo(0,st.y);});
})();
