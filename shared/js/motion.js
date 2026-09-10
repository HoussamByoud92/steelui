document.querySelectorAll('.reveal').forEach(el=>new IntersectionObserver(([e],o)=>{if(e.isIntersecting){el.classList.add('in');o.disconnect()}},{threshold:.15}).observe(el));
document.querySelectorAll('[data-count]').forEach(el=>new IntersectionObserver(([e],o)=>{if(!e.isIntersecting)return;let n=+el.dataset.count,t=performance.now();(function r(x){let p=Math.min((x-t)/1300,1);el.textContent=Math.round(n*(1-Math.pow(1-p,3))).toLocaleString();if(p<1)requestAnimationFrame(r)})(t);o.disconnect()},{threshold:.6}).observe(el));

// Higgsfield campaign media replaces the temporary CSS factory study in each concept.
const concept=document.title.slice(-2),assets='../assets/higgsfield/';
const addLoop=(src,poster)=>{const hero=document.querySelector('.hero');if(!hero)return;const video=document.createElement('video');video.className='higgsfield-hero';video.autoplay=true;video.muted=true;video.loop=true;video.playsInline=true;video.poster=assets+poster;video.innerHTML=`<source src="${assets+src}" type="video/mp4">`;hero.prepend(video)};
const style=document.createElement('style');style.textContent=`.higgsfield-hero{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;opacity:.78;filter:saturate(.78) contrast(1.12)}.hero:after{content:'';position:absolute;inset:0;background:linear-gradient(90deg,#090909cc 0%,#09090988 38%,#09090918 72%,#09090999 100%),linear-gradient(0deg,#09090988,transparent 62%);z-index:1}.hero nav,.hero-copy,.hero-index,.scroll{z-index:2!important}.hero-factory,.factory-wrap{z-index:2!important}.hero .factory,.visual .factory{display:none}.product{background-size:cover!important;background-position:center!important}.p1{background-image:linear-gradient(0deg,#250008 0%,#111d 44%,#1111 100%),url('../assets/higgsfield/rebar-product.png')!important}.p2{background-image:linear-gradient(0deg,#111 0%,#111c 44%,#1111 100%),url('../assets/higgsfield/wire-mesh-product.png')!important}.p3{background-image:linear-gradient(90deg,#111 0%,#111b 45%,#1111 100%),url('../assets/higgsfield/custom-sections.png')!important}.visual{background:#141414!important;overflow:hidden}.visual video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:grayscale(.35) contrast(1.12)}.visual:after{content:'';position:absolute;inset:0;background:linear-gradient(130deg,#f4f1ea10,transparent 55%,#17171666)}.visual p{z-index:2}.applications .app{background-size:cover!important;background-position:center!important}.applications .a1{background-image:linear-gradient(0deg,#1119,#1110),url('../assets/higgsfield/bridge-structure.png')!important;color:#fff}.applications .a2{background-image:linear-gradient(0deg,#1119,#1110),url('../assets/higgsfield/custom-sections.png')!important;color:#fff}.applications .a3{background-image:linear-gradient(0deg,#4c0010b3,#1112),url('../assets/higgsfield/mill-inspector.png')!important;color:#fff}`;document.head.append(style);
if(concept==='01'){addLoop('hero-mill-loop.mp4','mill-inspector.png');document.querySelector('.project img').src=assets+'bridge-structure.png';document.querySelector('.project img').alt='Concrete and steel bridge structure'}
if(concept==='02'){const visual=document.querySelector('.visual'),video=document.createElement('video');video.autoplay=true;video.muted=true;video.loop=true;video.playsInline=true;video.poster=assets+'rebar-product.png';video.innerHTML=`<source src="${assets}hero-rebar-loop.mp4" type="video/mp4">`;visual.prepend(video);document.querySelector('.journey-track figure img').src=assets+'rebar-product.png'}
if(concept==='03'){
  addLoop('hero-furnace-loop.mp4','custom-sections.png');
  document.querySelector('.factory-wrap')?.remove();
  document.querySelector('.scanline')?.remove();
  document.querySelector('.architect img').src=assets+'mill-inspector.png';
  const dial=document.querySelector('.dial');
  if(dial){
    const materialImage=document.createElement('img');
    materialImage.className='material-image';
    materialImage.src=assets+'rebar-product.png';
    materialImage.alt='Ribbed reinforcement bars';
    dial.replaceWith(materialImage);
  }
  const statementStyle=document.createElement('style');
  statementStyle.textContent=`.material-image{width:100%;max-width:320px;aspect-ratio:2 / 3;object-fit:cover;border-radius:25px;justify-self:center;box-shadow:0 24px 70px #0007}.statement{background:linear-gradient(rgb(180 0 35 / 40%),rgb(180 0 35 / 40%)),url('../assets/higgsfield/custom-sections.png') center/cover no-repeat!important;color:#fff!important}.statement h2,.statement>p{z-index:1}.statement em{color:#fff!important}.statement:before{content:'';position:absolute;inset:0;background:linear-gradient(90deg,#0005,transparent 65%);pointer-events:none}.statement .eyebrow,.statement h2,.statement>p:last-child{position:relative}@media(max-width:700px){.material-image{max-width:260px;margin:55px auto}}`;
  document.head.append(statementStyle);
}
