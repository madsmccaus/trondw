// Shared header behaviour: the theme switch.
(function(){
  const b=document.getElementById('theme');if(!b)return;
  const set=(t,swap)=>{const el=document.documentElement;if(swap)el.classList.add('theme-switching');el.dataset.theme=t;b.setAttribute('aria-checked',String(t==='dark'));
    if(swap)requestAnimationFrame(()=>requestAnimationFrame(()=>el.classList.remove('theme-switching')));};
  set(document.documentElement.dataset.theme||'light');
  b.addEventListener('click',()=>{const t=document.documentElement.dataset.theme==='dark'?'light':'dark';set(t,true);try{localStorage.setItem('tw-theme',t)}catch(e){}});
  // follow the system until the reader has made a choice
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change',e=>{let s=null;try{s=localStorage.getItem('tw-theme')}catch(_){}if(!s)set(e.matches?'dark':'light',true);});
})();

// Footer link for Vipps, and one quiet visit ping. No cookies.
(function(){
  var link=document.getElementById('vipps-link');
  if(link){
    fetch('/api/vipps',{method:'HEAD'}).then(function(r){if(r.ok)link.hidden=false;}).catch(function(){});
  }
  function pagePath(){
    var u=new URL(location.href);
    var path=u.pathname.replace(/\/+$/,'')||'/';
    if(path==='/'&&u.searchParams.get('m')&&u.searchParams.get('i')){
      return '/?m='+encodeURIComponent(u.searchParams.get('m'))+'&i='+encodeURIComponent(u.searchParams.get('i'));
    }
    return path;
  }
  function send(){
    if(location.pathname==='/admin')return;
    var body=JSON.stringify({path:pagePath(),referrer:document.referrer||''});
    try{
      if(navigator.sendBeacon&&navigator.sendBeacon('/api/visit',new Blob([body],{type:'application/json'})))return;
    }catch(e){}
    fetch('/api/visit',{method:'POST',headers:{'content-type':'application/json'},body:body,keepalive:true}).catch(function(){});
  }
  send();
  var native=history.pushState.bind(history);
  history.pushState=function(state,title,url){
    var ret=native(state,title,url);
    send();
    return ret;
  };
  addEventListener('popstate',function(){setTimeout(send,0);});
})();
