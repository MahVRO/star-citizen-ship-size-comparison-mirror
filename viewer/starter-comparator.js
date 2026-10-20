export function initStarterComparator({ getShip, compare }) {
  const $=id=>document.getElementById(id), section=$('starters'), cards=[...document.querySelectorAll('.starter-card')];
  let role='All', loading=false, active=null, preview=null, previewPromise=null, inView=false, requestId=0;
  const chosen=()=>cards.filter(c=>c.querySelector('input').checked);
  const available=()=>cards.filter(c=>c.dataset.matches==='true');
  section.classList.add('starter-interactive');
  const gallery=document.createElement('div');gallery.className='starter-gallery';
  gallery.innerHTML=`<div class="starter-stage"><div class="starter-stage-heading"><div><span class="eyebrow">EXPLORE YOUR STARTER</span><h3 id="starter-preview-name"></h3></div><button id="starter-preview-reset" class="tool" aria-label="Reset starter view" title="Reset starter view">⌖</button></div><div id="starter-preview-canvas" aria-label="Interactive starter ship preview"></div><img id="starter-preview-image" alt="" hidden><div class="starter-stage-footer"><span id="starter-preview-status" role="status"></span><span>Human: 1.80 m · same scale and camera for every ship</span></div></div><div class="starter-strip-controls"><button id="starter-prev" class="tool" aria-label="Previous starter">‹</button><span>Drag the list or choose a ship</span><button id="starter-next" class="tool" aria-label="Next starter">›</button></div><div id="starter-strip" class="starter-strip" role="group" aria-label="Choose a starter ship"></div>`;
  document.querySelector('.starter-grid').before(gallery);
  const thumbs=new Map(),strip=$('starter-strip');let drag=null,suppressClick=false,animation=0,scrollFrame=0,settleTimer=0;
  const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
  for(const card of cards){if(!getShip(card.dataset.model)){card.dataset.model='';card.querySelector('input').disabled=true;}}
  function tiles(card){return [...strip.children].filter(t=>t.dataset.pack===card.dataset.pack);}
  function rebuild(){
    cancelAnimationFrame(animation);clearTimeout(settleTimer);strip.replaceChildren();thumbs.clear();const list=available(),copies=list.length>1?3:1;
    for(let copy=0;copy<copies;copy++)for(const card of list){
      const tile=document.createElement('div');tile.className='starter-thumb';tile.dataset.pack=card.dataset.pack;tile.dataset.copy=copy;
      const button=document.createElement('button');button.className='starter-pick';button.setAttribute('aria-label','Show '+card.querySelector('h3').textContent);
      const image=card.querySelector('.starter-image img')?.cloneNode();if(image){image.draggable=false;button.append(image);}
      const name=document.createElement('strong');name.textContent=card.querySelector('h3').textContent;
      const price=document.createElement('span');price.textContent='$'+Number(card.dataset.price).toLocaleString('en-US')+' · USD before tax';button.append(name,price);
      button.addEventListener('click',()=>{if(active===card)showPreview(card);centerTile(tile,true);});
      const label=document.createElement('label');label.className='thumb-compare';const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.setAttribute('aria-label','Compare '+name.textContent+' in 3D');
      checkbox.addEventListener('change',()=>{card.querySelector('input').checked=checkbox.checked;update();showPreview(active);});label.append(checkbox,document.createTextNode('Compare in 3D'));tile.append(button,label);strip.append(tile);
      if(copy===(copies===3?1:0))thumbs.set(card,tile);
    }
    update();
  }
  function fallback(card){const img=$('starter-preview-image'),source=card?.querySelector('.starter-image img');img.hidden=!source;if(source){img.src=source.src;img.alt=source.alt;}}
  async function showPreview(card){
    const token=++requestId;$('starter-preview-image').hidden=true;
    const selected=chosen().map(c=>getShip(c.dataset.model)).filter(Boolean),ship=card&&getShip(card.dataset.model);
    const ships=[...selected];if(ship&&!ships.some(s=>s.id===ship.id))ships.push(ship);
    $('starter-preview-reset').disabled=!ships.length;
    if(!inView)return;
    if(!ships.length){preview?.clear();$('starter-preview-status').textContent='Choose another budget or activity.';return;}
    try{
      if(!previewPromise)previewPromise=import('./starter-preview.js?v=carousel-2').then(m=>preview=m.createStarterPreview($('starter-preview-canvas'),$('starter-preview-status')));
      await previewPromise;if(token!==requestId)return;
      $('starter-preview-canvas').hidden=false;preview.setVisible(inView);await preview.loadMany(ships);
    }catch{if(token===requestId)$('starter-preview-status').textContent='3D preview unavailable. Select a ship to retry.';}
  }
  function nearestTile(){
    const middle=strip.getBoundingClientRect().left+strip.clientWidth/2;
    return [...strip.children].reduce((best,t)=>{const box=t.getBoundingClientRect(),distance=Math.abs(box.left+box.width/2-middle);return !best||distance<best.distance?{tile:t,distance}:best;},null)?.tile;
  }
  function highlight(){const nearest=nearestTile();for(const t of strip.children){const centered=t===nearest;t.classList.toggle('is-centered',centered);t.querySelector('button').setAttribute('aria-pressed',String(centered));}}
  function centerTile(tile,smooth=false){
    if(!tile)return;cancelAnimationFrame(animation);animation=0;clearTimeout(settleTimer);
    const delta=tile.getBoundingClientRect().left-strip.getBoundingClientRect().left-(strip.clientWidth-tile.offsetWidth)/2;
    if(!smooth||reducedMotion.matches||Math.abs(delta)<.5){strip.scrollLeft+=delta;highlight();return;}
    const start=performance.now();let previous=0,remainder=0;
    function tick(now){const progress=Math.min(1,(now-start)/260),eased=1-Math.pow(1-progress,3);const before=strip.scrollLeft,increment=delta*(eased-previous)+remainder;strip.scrollLeft+=increment;remainder=increment-(strip.scrollLeft-before);previous=eased;if(progress<1)animation=requestAnimationFrame(tick);else{animation=0;highlight();}}
    animation=requestAnimationFrame(tick);
  }
  function center(card){centerTile(thumbs.get(card));}
  function activate(card,scroll=false,retry=false){
    if(active===card&&!retry){if(scroll)center(card);return;}
    active=card;for(const c of cards){c.hidden=c!==active;}
    $('starter-preview-name').textContent=card?.querySelector('h3').textContent??'No matching starter';
    $('starter-prev').disabled=available().length<2;$('starter-next').disabled=available().length<2;
    showPreview(card);if(scroll&&card)center(card);highlight();
  }
  strip.addEventListener('scroll',()=>{
    if(scrollFrame)return;scrollFrame=requestAnimationFrame(()=>{scrollFrame=0;
    const middle=strip.getBoundingClientRect().left+strip.clientWidth/2;
    let nearest=null,distance=Infinity;for(const t of strip.children){const b=t.getBoundingClientRect(),d=Math.abs(b.left+b.width/2-middle);if(d<distance){distance=d;nearest=t;}}
    if(!nearest)return;
    const card=available().find(c=>c.dataset.pack===nearest.dataset.pack);if(!card)return;
    if(available().length>1&&nearest.dataset.copy!=='1'){
      const delta=thumbs.get(card).offsetLeft-nearest.offsetLeft;
      strip.scrollLeft+=delta;if(drag)drag.left+=delta;
    }
    activate(card);highlight();
    clearTimeout(settleTimer);if(!drag&&!animation)settleTimer=setTimeout(()=>centerTile(nearestTile(),true),120);
    });
  });
  strip.addEventListener('dragstart',event=>event.preventDefault());
  strip.addEventListener('pointerdown',event=>{
    if(event.pointerType==='touch'||event.button!==0||event.target.closest('label'))return;
    cancelAnimationFrame(animation);animation=0;clearTimeout(settleTimer);suppressClick=false;drag={id:event.pointerId,x:event.clientX,left:strip.scrollLeft,moved:false};
  });
  strip.addEventListener('pointermove',event=>{
    if(!drag||event.pointerId!==drag.id)return;
    const dx=event.clientX-drag.x;
    if(!drag.moved&&Math.abs(dx)>5){drag.moved=true;strip.setPointerCapture(event.pointerId);strip.classList.add('is-dragging');}
    if(drag.moved){event.preventDefault();strip.scrollLeft=drag.left-dx;}
  });
  function finishDrag(event){
    if(!drag||event.pointerId!==drag.id)return;
    suppressClick=drag.moved;const moved=drag.moved;drag=null;
    strip.classList.remove('is-dragging');
    if(strip.hasPointerCapture(event.pointerId))strip.releasePointerCapture(event.pointerId);
    if(moved)centerTile(nearestTile(),true);
  }
  window.addEventListener('pointerup',finishDrag);strip.addEventListener('pointercancel',finishDrag);
  strip.addEventListener('click',event=>{if(suppressClick){event.preventDefault();event.stopImmediatePropagation();suppressClick=false;}},true);
  function step(direction){const tile=nearestTile();if(!tile)return;const adjacent=direction>0?tile.nextElementSibling:tile.previousElementSibling;centerTile(adjacent??thumbs.get(available()[0]),true);}
  $('starter-prev').addEventListener('click',()=>step(-1));$('starter-next').addEventListener('click',()=>step(1));
  $('starter-strip').addEventListener('keydown',event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();step(event.key==='ArrowLeft'?-1:1);thumbs.get(active)?.querySelector('button').focus({preventScroll:true});}});
  $('starter-preview-reset').addEventListener('click',()=>preview?.frame());
  const observer=new IntersectionObserver(entries=>{inView=entries[0].isIntersecting;preview?.setVisible(inView);if(inView&&active)showPreview(active);else if(!inView){requestId++;}}, {threshold:.05});observer.observe(gallery.querySelector('.starter-stage'));
  function update(){
    const selected=chosen();$('starter-count').textContent=selected.length+' selected';
    $('starter-selection-names').textContent=selected.length?selected.map(c=>c.querySelector('h3').textContent).join(' · '):'Select ships to open together in the full viewer.';
    highlight();$('starter-load').disabled=loading||!selected.length;$('starter-clear').disabled=loading||!selected.length;
    for(const c of cards){const input=c.querySelector('input');input.disabled=loading||!c.dataset.model;c.classList.toggle('chosen',input.checked);for(const t of tiles(c)){t.classList.toggle('chosen',input.checked);const check=t.querySelector('input');check.checked=input.checked;check.disabled=input.disabled;}}
  }
  function filter(){
    const budget=$('starter-budget').value;
    for(const c of cards){const price=c.dataset.price===''?null:Number(c.dataset.price);const inBudget=budget==='all'||(budget==='unknown'?price===null:price!==null&&(budget==='under75'?price<75:budget==='75to100'?price>=75&&price<100:price>=100));const match=inBudget&&(role==='All'||c.dataset.roles.split(',').includes(role));c.dataset.matches=String(match);}
    rebuild();const visible=available();$('starter-results').textContent=visible.length+' pack'+(visible.length===1?'':'s')+' available';$('starter-empty').hidden=visible.length>0;
    activate(visible.includes(active)?active:visible[0]??null,true);
  }
  $('starter-budget').addEventListener('change',filter);
  $('starter-roles').addEventListener('click',event=>{const button=event.target.closest('button');if(!button)return;role=button.dataset.role;for(const b of $('starter-roles').querySelectorAll('button'))b.setAttribute('aria-pressed',String(b===button));filter();});
  cards.forEach(c=>c.querySelector('input').addEventListener('change',()=>{update();showPreview(active);}));
  $('starter-clear').addEventListener('click',()=>{cards.forEach(c=>c.querySelector('input').checked=false);$('starter-status').textContent='';update();showPreview(active);});
  $('starter-load').textContent='Compare in full viewer ↗';
  $('starter-load').addEventListener('click',async()=>{
    loading=true;update();$('starter-status').textContent='Loading your comparison…';
    try{const result=await compare(chosen().map(c=>c.dataset.model));$('starter-status').textContent=result.message;}
    catch{$('starter-status').textContent='Could not load this comparison. Please try again.';}
    finally{loading=false;update();}
  });filter();update();
}
