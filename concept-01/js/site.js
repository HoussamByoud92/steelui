const motionTargets=document.querySelectorAll('.hero-copy,.page-intro>*,.split>*,.product-dock .dock-item,.gallery-item,.project-card,.metric,.spec,.cert,.value,.extension-heading,.extension-details article,.quality-list>div,.news-list a,.contact-form');
motionTargets.forEach(el=>{el.classList.add('reveal');const siblings=[...el.parentElement.children];el.style.setProperty('--reveal-delay',`${Math.min(siblings.indexOf(el),5)*75}ms`)});
const revealObserver=new IntersectionObserver(entries=>entries.forEach(entry=>{if(!entry.isIntersecting)return;entry.target.classList.add('in');revealObserver.unobserve(entry.target)}),{threshold:.08,rootMargin:'0px 0px -3% 0px'});
document.querySelectorAll('.reveal').forEach(el=>revealObserver.observe(el));
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
  const hint=document.createElement('p');
  viewport.className='carousel-viewport';track.className='carousel-track';hint.className='drag-hint';hint.textContent='Glisser pour explorer';
  tiles.forEach(tile=>track.append(tile));viewport.append(track);action.before(viewport);viewport.after(hint);visualIndex.classList.add('is-carousel');
  let startX=0,currentX=0,offset=0,dragging=false;
  const render=()=>track.style.transform=`translate3d(${offset+currentX}px,0,0)`;
  viewport.addEventListener('pointerdown',event=>{dragging=true;startX=event.clientX;currentX=0;viewport.setPointerCapture(event.pointerId);viewport.classList.add('is-dragging')});
  viewport.addEventListener('pointermove',event=>{if(!dragging)return;currentX=event.clientX-startX;render()});
  const finish=event=>{if(!dragging)return;dragging=false;offset+=currentX;const max=Math.min(0,viewport.clientWidth-track.scrollWidth-16);offset=Math.max(max,Math.min(0,offset));currentX=0;render();viewport.classList.remove('is-dragging');if(viewport.hasPointerCapture(event.pointerId))viewport.releasePointerCapture(event.pointerId)};
  viewport.addEventListener('pointerup',finish);viewport.addEventListener('pointercancel',finish);
}
