
document.addEventListener('DOMContentLoaded', () => {
  if (window.AOS) AOS.init({ once:true, duration:600, easing:'ease-out-quart' });
});
(function(){
  const bar = document.querySelector('.reading-progress');
  if(!bar) return;
  const onScroll = () => {
    const h = document.documentElement;
    const st = h.scrollTop || document.body.scrollTop;
    const sh = h.scrollHeight - h.clientHeight;
    const p = Math.min(100, Math.max(0, (st / sh) * 100));
    bar.style.width = p + '%';
  };
  document.addEventListener('scroll', onScroll, { passive:true });
  onScroll();
})();
(function(){
  const toc = document.querySelector('.toc');
  const article = document.querySelector('article');
  if(!toc || !article) return;
  const hs = article.querySelectorAll('h2, h3');
  let html = '';
  hs.forEach((h,i)=>{
    if(!h.id) h.id = (h.textContent || 'section').toLowerCase().replace(/[^a-z0-9]+/g,'-');
    const lvl = h.tagName === 'H2' ? 'pl-0' : 'pl-4';
    html += `<a href="#${h.id}" class="block text-slate-500 hover:text-slate-900 ${lvl} py-1">${h.textContent}</a>`;
  });
  toc.innerHTML = html;
  const links = Array.from(toc.querySelectorAll('a'));
  const obs = new IntersectionObserver((entries)=>{
    entries.forEach(e=>{
      const id = e.target.getAttribute('id');
      const link = links.find(a=>a.getAttribute('href') === '#' + id);
      if(link){
        if(e.isIntersecting) { links.forEach(a=>a.classList.remove('active')); link.classList.add('active'); }
      }
    });
  }, { rootMargin:'-40% 0px -55% 0px', threshold:0.01 });
  document.querySelectorAll('h2, h3').forEach(h=>obs.observe(h));
})();
