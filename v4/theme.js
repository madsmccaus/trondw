// Runs in <head> before first paint: picks the saved theme or the system one, so there is no flash.
(function(){var t=null;try{t=localStorage.getItem('tw-theme')}catch(e){}
  if(t!=='light'&&t!=='dark')t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';
  document.documentElement.dataset.theme=t;})();
