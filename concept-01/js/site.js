document.querySelectorAll('.reveal').forEach(el=>new IntersectionObserver(([entry],observer)=>{if(entry.isIntersecting){el.classList.add('in');observer.disconnect()}},{threshold:.12}).observe(el));
document.querySelectorAll('.menu-toggle').forEach(button=>button.addEventListener('click',()=>{const nav=button.parentElement;nav.classList.toggle('open');}));

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
