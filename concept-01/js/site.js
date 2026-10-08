const motionTargets=document.querySelectorAll('.hero-copy>*,.page-intro>*,.split>*,.product-dock .dock-item,.gallery-item,.project-card,.metric,.spec,.cert,.value,.extension-heading,.extension-body>*,.extension-details article,.quality-list>div,.news-list a,.contact-form>*,.section>.eyebrow,.section>.display,.material-gallery header>*,.career-cta>* ,.site-footer>div');
motionTargets.forEach(el=>{el.classList.add('reveal');const siblings=[...el.parentElement.children];el.style.setProperty('--reveal-delay',`${Math.min(siblings.indexOf(el),5)*75}ms`)});
const revealObserver=new IntersectionObserver(entries=>entries.forEach(entry=>{if(!entry.isIntersecting)return;entry.target.classList.add('in');revealObserver.unobserve(entry.target)}),{threshold:.08,rootMargin:'0px 0px -3% 0px'});
document.querySelectorAll('.reveal').forEach(el=>revealObserver.observe(el));
document.documentElement.classList.add('motion-ready');
const scrollProgress=document.createElement('div');
scrollProgress.className='scroll-progress';
scrollProgress.setAttribute('role','progressbar');
scrollProgress.setAttribute('aria-label','Progression de lecture');
scrollProgress.setAttribute('aria-valuemin','0');
scrollProgress.setAttribute('aria-valuemax','100');
document.body.append(scrollProgress);
let progressFrame=0;
const updateScrollProgress=()=>{
  if(progressFrame)return;
  progressFrame=requestAnimationFrame(()=>{
    const range=document.documentElement.scrollHeight-window.innerHeight;
    const progress=range>0?Math.round(window.scrollY/range*100):0;
    scrollProgress.style.transform=`scaleX(${progress/100})`;
    scrollProgress.setAttribute('aria-valuenow',String(progress));
    progressFrame=0;
  });
};
window.addEventListener('scroll',updateScrollProgress,{passive:true});
window.addEventListener('resize',updateScrollProgress,{passive:true});
updateScrollProgress();
document.querySelectorAll('.menu-toggle').forEach(button=>button.addEventListener('click',()=>{const nav=button.parentElement;const open=nav.classList.toggle('open');button.setAttribute('aria-expanded',String(open));}));
document.querySelectorAll('.site-nav .links a').forEach(link=>link.addEventListener('click',()=>{const nav=link.closest('.site-nav');nav.classList.remove('open');nav.querySelector('.menu-toggle')?.setAttribute('aria-expanded','false')}));
document.addEventListener('keydown',event=>{if(event.key==='Escape')document.querySelectorAll('.site-nav.open').forEach(nav=>{nav.classList.remove('open');nav.querySelector('.menu-toggle')?.setAttribute('aria-expanded','false')})});

const pinboard=document.querySelector('.pinboard');
if(pinboard){
  const moveSpotlight=event=>{
    const bounds=pinboard.getBoundingClientRect();
    pinboard.style.setProperty('--spot-x',`${event.clientX-bounds.left}px`);
    pinboard.style.setProperty('--spot-y',`${event.clientY-bounds.top}px`);
  };
  pinboard.addEventListener('pointerenter',event=>{pinboard.classList.add('is-spotlit');moveSpotlight(event)});
  pinboard.addEventListener('pointermove',moveSpotlight);
  pinboard.addEventListener('pointerleave',()=>pinboard.classList.remove('is-spotlit'));
}

const visualIndex=document.querySelector('.visual-index');
if(visualIndex){
  const tiles=[...visualIndex.querySelectorAll('.float-tile')];
  const action=visualIndex.querySelector('.button');
  const viewport=document.createElement('div');
  const track=document.createElement('div');
  const meta=document.createElement('div');
  const hint=document.createElement('p');
  const toggle=document.createElement('button');
  const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
  viewport.className='carousel-viewport';
  viewport.setAttribute('role','region');
  viewport.setAttribute('aria-label','Galerie de photos UISTEEL');
  viewport.tabIndex=0;
  track.className='carousel-track';
  meta.className='carousel-meta';
  hint.className='drag-hint';
  hint.textContent='Défilement automatique · Glisser pour explorer';
  toggle.className='carousel-toggle';
  toggle.type='button';
  toggle.textContent='Ⅱ Pause';
  toggle.setAttribute('aria-label','Mettre le carrousel en pause');
  toggle.setAttribute('aria-pressed','false');
  track.append(...tiles);
  viewport.append(track);
  meta.append(hint,toggle);
  action.before(viewport);
  viewport.after(meta);
  visualIndex.classList.add('is-carousel');

  let loopWidth=0,offset=0,startX=0,startOffset=0,dragging=false;
  let hovered=false,focused=false,manuallyPaused=false,lastFrame=0;
  const speed=34;
  const wrap=value=>loopWidth?((value%loopWidth)+loopWidth)%loopWidth-loopWidth:0;
  const render=()=>{track.style.transform=`translate3d(${offset}px,0,0)`};
  const measure=()=>{
    const firstSet=[...track.children].slice(0,tiles.length);
    const gap=parseFloat(getComputedStyle(track).columnGap)||18;
    loopWidth=firstSet.reduce((sum,tile)=>sum+tile.getBoundingClientRect().width,0)+gap*tiles.length;
    offset=wrap(offset);
    render();
  };
  if(!reducedMotion.matches){
    const copies=tiles.map(tile=>{
      const clone=tile.cloneNode(true);
      clone.setAttribute('aria-hidden','true');
      clone.querySelectorAll('img').forEach(img=>img.alt='');
      return clone;
    });
    track.append(...copies);
  }
  const shouldMove=()=>!reducedMotion.matches&&!manuallyPaused&&!hovered&&!focused&&!dragging&&document.visibilityState==='visible';
  const frame=now=>{
    if(lastFrame&&shouldMove())offset=wrap(offset-(Math.min(now-lastFrame,50)/1000)*speed);
    lastFrame=now;
    render();
    requestAnimationFrame(frame);
  };
  const updateToggle=()=>{
    toggle.textContent=manuallyPaused?'▶ Reprendre':'Ⅱ Pause';
    toggle.setAttribute('aria-label',manuallyPaused?'Relancer le carrousel automatique':'Mettre le carrousel en pause');
    toggle.setAttribute('aria-pressed',String(manuallyPaused));
  };
  toggle.addEventListener('click',()=>{manuallyPaused=!manuallyPaused;updateToggle()});
  viewport.addEventListener('pointerenter',()=>{hovered=true});
  viewport.addEventListener('pointerleave',()=>{hovered=false});
  viewport.addEventListener('focusin',()=>{focused=true});
  viewport.addEventListener('focusout',event=>{if(!viewport.contains(event.relatedTarget))focused=false});
  viewport.addEventListener('pointerdown',event=>{
    if(reducedMotion.matches||event.button!==0)return;
    dragging=true;startX=event.clientX;startOffset=offset;
    viewport.setPointerCapture(event.pointerId);
    viewport.classList.add('is-dragging');
  });
  viewport.addEventListener('pointermove',event=>{if(reducedMotion.matches||!dragging)return;offset=wrap(startOffset+event.clientX-startX);render()});
  const finish=event=>{
    if(!dragging)return;
    dragging=false;viewport.classList.remove('is-dragging');
    if(viewport.hasPointerCapture(event.pointerId))viewport.releasePointerCapture(event.pointerId);
  };
  viewport.addEventListener('pointerup',finish);
  viewport.addEventListener('pointercancel',finish);
  window.addEventListener('resize',measure,{passive:true});
  measure();
  if(!reducedMotion.matches)requestAnimationFrame(frame);
}
