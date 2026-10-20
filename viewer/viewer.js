import { parseFleet, matchShip } from './fleet-import.js?v=20260911-2';
import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const $ = id => document.getElementById(id);
let importSerial=0, importRevision=0;
const quantities=new Map();
const selected = new Set(), fleet = new Map(), allShips = new Map();
let makers = [], currentMaker = null, busy = false, renderer, controls, scene, camera;
let labels, grid, gridStep = 1, lastFrame = performance.now(), noticeTimer;
let transform, selectionBox, selectedShipId = null;
const keys = new Set(), up = new THREE.Vector3(0, 1, 0);
const EYE_HEIGHT = 1.75;
let cameraMode = 'free', walkLook = null;
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const viewport = $('viewport');

function notify(message) {
  $('toast').textContent = message; $('toast').hidden = false;
  clearTimeout(noticeTimer); noticeTimer = setTimeout(() => $('toast').hidden = true, 4500);
}
function imageLogo(maker) {
  const img = document.createElement('img'); img.src = '/star-citizen-ship-size-comparison-mirror/' + maker.logo; img.alt = '';
  img.addEventListener('error', () => img.replaceWith(document.createTextNode(maker.code)), { once: true });
  return img;
}
function instances(id){return [...fleet.values()].filter(s=>(s.catalogId??s.id)===id);}
function hasModel(id){return instances(id).length>0;}
function wanted(id){return quantities.get(id)??instances(id).length;}
function removeInstance(ship){if(selectedShipId===ship.id)selectShip(null);scene.remove(ship.group);disposeObject(ship.group);fleet.delete(ship.id);}

function updateSelection() {
  $('selection-count').textContent = selected.size ? `${selected.size} ship${selected.size > 1 ? 's' : ''} selected` : 'No ships selected';
  $('load-ships').disabled = !selected.size || busy || !renderer;
  $('fleet-file').disabled=busy;

}
function visibleShips(){
  const query=$('ship-search').value.trim().toLocaleLowerCase();
  return query?[...allShips.values()].filter(s=>(s.name+' '+s.manufacturer).toLocaleLowerCase().includes(query)):(currentMaker?.ships??[]);
}
function renderShips() {
  const query=$('ship-search').value.trim().toLocaleLowerCase();
  $('ship-section').hidden=!query&&!currentMaker;
  const ships=visibleShips();
  $('model-count').textContent = `${ships.length} MODEL${ships.length > 1 ? 'S' : ''}`;
  $('ship-list').replaceChildren();
  for (const ship of ships) {
    const row=document.createElement('div');row.className='ship-row';
    const count=instances(ship.id).length;
    const label=document.createElement('label');label.className='ship-check';
    const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.value=ship.id;
    checkbox.checked=wanted(ship.id)>0 && (selected.has(ship.id)||count>0);checkbox.disabled=busy||count>0;
    checkbox.addEventListener('change',()=>{if(checkbox.checked){selected.add(ship.id);quantities.set(ship.id,Math.max(1,wanted(ship.id)));}else{selected.delete(ship.id);quantities.delete(ship.id);}renderShips();updateSelection();});
    const name=document.createElement('span');name.textContent=ship.name;if(query){const maker=document.createElement('small');maker.className='search-maker';maker.textContent=ship.manufacturer;name.append(maker);}label.append(checkbox,name);
    const actions=document.createElement('div');actions.className='ship-row-actions';
    const minus=document.createElement('button');minus.textContent='−';minus.setAttribute('aria-label','Decrease quantity of '+ship.name);
    const amount=document.createElement('input');amount.type='number';amount.min='0';amount.max='200';amount.value=wanted(ship.id);amount.setAttribute('aria-label','Quantity of '+ship.name);
    const plus=document.createElement('button');plus.textContent='+';plus.setAttribute('aria-label','Increase quantity of '+ship.name);
    const change=value=>{const n=Number(value);if(!Number.isInteger(n)||n<0||n>200){amount.value=wanted(ship.id);return;}quantities.set(ship.id,n);if(n>0||count>0)selected.add(ship.id);else selected.delete(ship.id);checkbox.checked=n>0;amount.value=n;minus.disabled=busy||n<=0;plus.disabled=busy||n>=200;updateSelection();};
    minus.disabled=busy||wanted(ship.id)<=0;plus.disabled=busy||wanted(ship.id)>=200;amount.disabled=busy;
    minus.addEventListener('click',()=>change(wanted(ship.id)-1));plus.addEventListener('click',()=>change(wanted(ship.id)+1));amount.addEventListener('change',()=>change(amount.value));
    actions.append(minus,amount,plus);
    if(count){const remove=document.createElement('button');remove.className='remove-model';remove.textContent='×';remove.disabled=busy;remove.title='Remove '+count+' instance(s)';remove.setAttribute('aria-label','Remove all '+ship.name);remove.addEventListener('click',()=>{instances(ship.id).forEach(removeInstance);selected.delete(ship.id);quantities.delete(ship.id);arrangeFleet();renderShips();updateSelection();});actions.append(remove);}
    row.append(label,actions);$('ship-list').append(row);
  }
  if (!ships.length) { const p = document.createElement('p'); p.textContent = 'No ships found.'; $('ship-list').append(p); }
}
async function initCatalogue() {
  const response = await fetch('/star-citizen-ship-size-comparison-mirror/viewer/catalog.json');
  if (!response.ok) throw new Error('Catalogue unavailable. Reload the page to try again.');
  makers = (await response.json()).manufacturers;
  for (const maker of makers) {
    for (const ship of maker.ships) allShips.set(ship.id, { ...ship, manufacturer: maker.name });
    const button = document.createElement('button'); button.className = 'maker-option';
    if (maker.logo) button.append(imageLogo(maker));
    const name = document.createElement('span'); name.textContent = maker.name; button.append(name);
    button.addEventListener('click', () => {
      currentMaker = maker; $('maker-value').textContent = maker.name;
      $('maker-emblem').replaceChildren(maker.logo ? imageLogo(maker) : document.createTextNode(maker.code));
      $('maker-options').hidden = false; $('maker-toggle').setAttribute('aria-expanded', 'true');
      $('ship-section').hidden = false; $('ship-search').value = ''; renderShips(); $('maker-toggle').focus();
    });
    $('maker-options').append(button);
  }
}

function disposeObject(object) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  object.traverse(child => {
    if (child.geometry) geometries.add(child.geometry);
    for (const material of [child.material].flat().filter(Boolean)) {
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  for (const item of [...textures, ...materials, ...geometries]) item.dispose();
}
// Fixed ground decals: condensed lettering with stencil bridges, no billboarding.
function makeLabel(text, height = 1) {
  const canvas = document.createElement('canvas'); canvas.width = 384; canvas.height = 128;
  const context = canvas.getContext('2d');
  context.font = '900 88px Impact, "Arial Narrow", sans-serif';
  context.textAlign = 'left'; context.textBaseline = 'middle';
  const letters = [...text], spacing = 5;
  const widths = letters.map(c => context.measureText(c).width);
  let x = (canvas.width - widths.reduce((a,b) => a+b,0) - spacing*(letters.length-1))/2;
  context.fillStyle = '#e4e9e5';
  for (let i=0;i<letters.length;i++) {
    context.fillText(letters[i],x,68);
    // Cut narrow bridges through each glyph, like a reusable hangar-floor stencil.
    if (letters[i] !== ' ' && letters[i] !== '-') context.clearRect(x+widths[i]*.49,17,2.6,101);
    x += widths[i]+spacing;
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(),8);
  const material = new THREE.MeshBasicMaterial({ map:texture, transparent:true, depthWrite:false,
    color:0xffffff, opacity: .85, toneMapped:false, polygonOffset:true, polygonOffsetFactor:-1, polygonOffsetUnits:-1 });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(height * 3, height),material);
  mesh.rotation.x = -Math.PI/2;
  return mesh;
}
function setCameraMode(mode) {
  if(!controls) return;
  keys.clear(); walkLook=null;
  // Drain orbit damping before leaving free mode.
  if(cameraMode==='free'){controls.enableDamping=false;controls.update();controls.enableDamping=true;}
  cameraMode=mode;
  camera.fov=mode==='walk'?60:48;
  camera.updateProjectionMatrix();
  if(mode==='walk') {
    const direction=new THREE.Vector3();camera.getWorldDirection(direction);
    camera.position.y=EYE_HEIGHT;
    controls.target.copy(camera.position).addScaledVector(direction,10);
  }
  controls.enabled=mode==='free' && !transform?.dragging;
  $('camera-free').setAttribute('aria-pressed',String(mode==='free'));
  $('camera-walk').setAttribute('aria-pressed',String(mode==='walk'));
}
function initWalkLook() {
  const canvas=renderer.domElement;
  canvas.addEventListener('pointerdown',event=>{
    if(cameraMode!=='walk' || ![0,2].includes(event.button) || transform.dragging || transform.axis) return;
    const angles=new THREE.Euler().setFromQuaternion(camera.quaternion,'YXZ');
    walkLook={id:event.pointerId,x:event.clientX,y:event.clientY,yaw:angles.y,pitch:angles.x};
    canvas.setPointerCapture(event.pointerId);
  },true);
  canvas.addEventListener('pointermove',event=>{
    if(!walkLook || event.pointerId!==walkLook.id || cameraMode!=='walk')return;
    const sensitivity=.003;
    const yaw=walkLook.yaw-(event.clientX-walkLook.x)*sensitivity;
    const pitch=THREE.MathUtils.clamp(walkLook.pitch-(event.clientY-walkLook.y)*sensitivity,-Math.PI/2+.01,Math.PI/2-.01);
    camera.quaternion.setFromEuler(new THREE.Euler(pitch,yaw,0,'YXZ'));
    const direction=new THREE.Vector3();camera.getWorldDirection(direction);
    controls.target.copy(camera.position).addScaledVector(direction,10);
  },true);
  const finish=event=>{if(walkLook?.id!==event.pointerId)return;walkLook=null;if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);};
  canvas.addEventListener('pointerup',finish,true);
  canvas.addEventListener('pointercancel',finish,true);
  canvas.addEventListener('lostpointercapture',()=>walkLook=null);
}

function initScene() {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setClearColor(0x131a1f);
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15; viewport.append(renderer.domElement);
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(48, 1, 0.1, 200000);
  camera.position.set(65, 65, 95);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.12; controls.minDistance = 1; controls.maxDistance = 40000;
  controls.maxPolarAngle = Math.PI - 0.008; controls.screenSpacePanning = false;
  controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN };
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
  controls.target.set(0, 0, 0); controls.update();
  initSelection();
  initWalkLook();
  scene.add(new THREE.HemisphereLight(0xdcecff, 0x6b796d, 1.6));
  const key = new THREE.DirectionalLight(0xfff2dd, 2.1); key.position.set(100, 180, 80); scene.add(key);
  const fill = new THREE.DirectionalLight(0x9bbfd3, 1.0); fill.position.set(-100, 60, -100); scene.add(fill);
  // Reconstruct the floor intersection per pixel: a giant world-space triangle loses
  // precision near the origin and makes the grid crawl when the camera moves.
  const plane = new THREE.PlaneGeometry(2, 2);
  grid = new THREE.Mesh(plane, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { inverseProjection: { value: camera.projectionMatrixInverse }, cameraWorld: { value: camera.matrixWorld }, cameraOrigin: { value: camera.position }, worldToClip: { value: new THREE.Matrix4() } },
    vertexShader: `uniform mat4 inverseProjection; uniform mat4 cameraWorld; varying vec3 ray;
      void main(){ray=(cameraWorld*vec4((inverseProjection*vec4(position.xy,1.,1.)).xyz,0.)).xyz;gl_Position=vec4(position.xy,0.,1.);}`,
    fragmentShader: `varying vec3 ray; uniform vec3 cameraOrigin; uniform mat4 worldToClip;
      // Widths are in metres. Derivatives antialias the paint and suppress distant moire.
      float marking(vec2 p,float interval,float width){
        vec2 d=abs(mod(p+interval*.5,interval)-interval*.5);
        vec2 aa=max(fwidth(p),vec2(.001));
        vec2 ink=1.-smoothstep(vec2(width*.5)-aa*.5,vec2(width*.5)+aa*.5,d);
        ink*=min(vec2(1.),vec2(width)/aa);
        ink*=1.-smoothstep(interval*.15,interval*.65,aa);
        return max(ink.x,ink.y);
      }
      void main(){
        if(ray.y>=-.000001) discard;
        float t=(-.06-cameraOrigin.y)/ray.y;
        if(t<=0.) discard;
        vec3 world=cameraOrigin+ray*t;
        vec4 clip=worldToClip*vec4(world,1.);
        float depth=clip.z/clip.w;
        if(depth>1. || depth< -1.) discard;
        gl_FragDepth=depth*.5+.5;
        vec2 p=world.xz;
        float one=marking(p,1.,.018),five=marking(p,5.,.055);
        float ten=marking(p,10.,.10),fifty=marking(p,50.,.20);
        float fade=1.-smoothstep(12000.,60000.,distance(cameraOrigin,world));
        float a=max(max(one*.18,five*.32),max(ten*.46,fifty*.65));
        vec3 col=vec3(.65,.70,.70);
        vec2 aa=max(fwidth(p),vec2(.001));
        float x=(1.-smoothstep(.07-aa.y*.5,.07+aa.y*.5,abs(p.y)))*min(1.,.14/aa.y);
        float z=(1.-smoothstep(.07-aa.x*.5,.07+aa.x*.5,abs(p.x)))*min(1.,.14/aa.x);
        col=mix(col,vec3(.65,.34,.31),x);col=mix(col,vec3(.37,.61,.49),z);
        a=max(a,max(x,z)*.7);gl_FragColor=vec4(col,a*fade);
      }`
  }));
  grid.frustumCulled = false; scene.add(grid);
  labels = new THREE.Group(); scene.add(labels); buildGroundMarkings();
  const target = new THREE.Mesh(new THREE.RingGeometry(.75, .86, 32), new THREE.MeshBasicMaterial({ color: 0xc5e7d9, side: THREE.DoubleSide, transparent: true, opacity: .7, depthTest: false }));
  target.rotation.x = -Math.PI / 2; scene.add(target);
  const observer = new ResizeObserver(() => { const { width, height } = viewport.getBoundingClientRect(); renderer.setSize(width, height); camera.aspect = width / height; camera.updateProjectionMatrix(); });
  observer.observe(viewport);
  viewport.addEventListener('pointerdown', () => { viewport.focus({ preventScroll: true }); });
  viewport.addEventListener('contextmenu', event => event.preventDefault());
  viewport.addEventListener('focus', () => $('navigation-status').textContent = 'NAVIGATION ACTIVE · ESC TO RELEASE');
  viewport.addEventListener('blur', () => { keys.clear(); $('navigation-status').textContent = 'CLICK THE SCENE'; });
  window.addEventListener('blur', () => keys.clear());
  document.addEventListener('visibilitychange', () => keys.clear());
  viewport.addEventListener('keydown', event => {
    if (event.code === 'Escape') { keys.clear(); selectShip(null); viewport.blur(); return; }
    if (event.code === 'KeyF') { event.preventDefault(); frameFleet(fleet.get(selectedShipId)?.group); return; }
    if (['KeyW','KeyA','KeyS','KeyD','Space','ControlLeft','ControlRight','ShiftLeft','ShiftRight'].includes(event.code)) {
      event.preventDefault(); keys.add(event.code);
    }
  });
  window.addEventListener('keyup', event => keys.delete(event.code));
  renderer.domElement.addEventListener('webglcontextlost', event => { event.preventDefault(); keys.clear(); notify('The 3D context was lost. Reload the page to continue.'); });
  function animate(now) {
    requestAnimationFrame(animate);
    const dt = Math.min((now - lastFrame) / 1000, .05); lastFrame = now;
    if (document.hidden) return;
    if (keys.size && !transform?.dragging && document.activeElement === viewport) {
      const forward = new THREE.Vector3(); camera.getWorldDirection(forward);
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize();
      if(cameraMode==='walk'){forward.y=0;forward.normalize();right.y=0;right.normalize();}
      const move = new THREE.Vector3();
      if (keys.has('KeyW')) move.add(forward); if (keys.has('KeyS')) move.sub(forward);
      if (keys.has('KeyD')) move.add(right); if (keys.has('KeyA')) move.sub(right);
      if(cameraMode==='free'){if (keys.has('Space')) move.y += 1; if (keys.has('ControlLeft') || keys.has('ControlRight')) move.y -= 1;}
      const running=keys.has('ShiftLeft') || keys.has('ShiftRight');
      const speed = cameraMode==='walk'
        ? (keys.has('Space') ? 15 : running ? 4.5 : 1.5)
        : THREE.MathUtils.clamp(camera.position.distanceTo(controls.target) * .45, 5, 2000)*(running?3:1);
      move.normalize().multiplyScalar(speed * dt);
      move.y = Math.max(move.y, .3 - camera.position.y);
      camera.position.add(move); controls.target.add(move);
    }
    if(cameraMode==='free')controls.update();
    if (camera.position.y < .25) { const delta = .25 - camera.position.y; camera.position.y += delta; controls.target.y += delta; }
    updateGrid(); target.position.copy(controls.target); target.position.y = Math.max(.03, controls.target.y);
    target.scale.setScalar(camera.position.distanceTo(controls.target) / 140);
    if (selectedShipId) {
      const object=fleet.get(selectedShipId).group;
      selectionBox.setFromObject(object);
      const lowest=new THREE.Box3().setFromObject(object).min.y;
      const status=lowest < -.01 ? 'Below ground: '+(-lowest).toFixed(2)+' m' : lowest > .01 ? 'Above ground: '+lowest.toFixed(2)+' m' : 'On ground';
      if($('ground-status').textContent!==status)$('ground-status').textContent=status;
      $('ground-status').classList.toggle('below-ground',lowest < -.01);
    }
    renderer.render(scene, camera);
  }
  requestAnimationFrame(animate);
}
function buildGroundMarkings() {
  // Repeating metric hierarchy, independent of distance from the origin or camera.
  // A shared stencil alphabet and instanced glyphs avoid one texture/draw per number.
  const alphabet='0123456789 M';
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=128;
  const ctx=canvas.getContext('2d');ctx.font='900 88px Impact, "Arial Narrow", sans-serif';
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#e4e9e5';
  for(let i=0;i<alphabet.length;i++) {
    ctx.fillText(alphabet[i],i*64+32,68,56);
    if(alphabet[i]!==' ')ctx.clearRect(i*64+31,17,2,101);
  }
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  texture.anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),8);
  const material=new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,
    toneMapped:false,opacity:.88,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
  material.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float glyphIndex;');
    shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>','#include <uv_vertex>\nvMapUv.x=(vMapUv.x+glyphIndex)/16.0;');
  };
  const transform=new THREE.Object3D();transform.rotation.x=-Math.PI/2;
  const origin=makeLabel('0',.35);origin.position.set(.38,.012,-.38);labels.add(origin);
  // Separate 100 m chunks on each axis allow normal frustum culling while keeping
  // every marking permanent throughout the existing 50 km extent.
  for(let start=1;start<=50000;start+=100) {
    const glyphs=[];
    for(let n=start;n<start+100;n++) {
      const height=n%100===0 ? 6 : n%50===0 ? 3.5 : n%10===0 ? 1.5 : .25;
      const text=n+' M',advance=height*.48,width=(text.length-1)*advance;
      for(let j=0;j<text.length;j++)if(text[j]!==' ')
        glyphs.push({n,height,width,offset:j*advance-width/2,index:alphabet.indexOf(text[j])});
    }
    for(const axis of ['x','z']) {
      const geometry=new THREE.PlaneGeometry(1,1);
      geometry.setAttribute('glyphIndex',new THREE.InstancedBufferAttribute(new Float32Array(glyphs.map(g=>g.index)),1));
      const batch=new THREE.InstancedMesh(geometry,material,glyphs.length);
      // Keep matrices local to each chunk, avoiding large-coordinate precision loss.
      batch.position.set(axis==='x'?start:0,0,axis==='z'?-start:0);
      glyphs.forEach((g,i)=>{
        if(axis==='x')transform.position.set(g.n-start+g.offset,.014,-g.height*.9-.15);
        else transform.position.set(g.width/2+g.height*.4+.15+g.offset,.014,-(g.n-start));
        transform.scale.set(g.height*.65,g.height,1);transform.updateMatrix();batch.setMatrixAt(i,transform.matrix);
      });
      batch.instanceMatrix.needsUpdate=true;batch.computeBoundingBox();batch.computeBoundingSphere();labels.add(batch);
    }
  }
  $('grid-status').textContent='MARKINGS 1 / 10 / 50 / 100 m';
}
function updateGrid() {
  camera.updateMatrixWorld();
  grid.material.uniforms.worldToClip.value.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
}
async function createShip(ship) {
  const gltf = await loader.loadAsync('/star-citizen-ship-size-comparison-mirror/' + ship.path.split('/star-citizen-ship-size-comparison-mirror/').map(encodeURIComponent).join('/star-citizen-ship-size-comparison-mirror/'));
  const model = gltf.scene;
  try {
    const group = new THREE.Group(); group.add(model); model.rotation.set(...ship.rotation);
    model.updateMatrixWorld(true);
    let bounds = new THREE.Box3().setFromObject(model); const raw = bounds.getSize(new THREE.Vector3());
    if (!Number.isFinite(raw.z) || raw.z <= 0) throw new Error('Invalid geometry');
    // Holoviewer source: Y up, nose towards -Z; catalogue rotation faces +Z. Calibrate length without distorting the mesh.
    model.scale.multiplyScalar(ship.length ? ship.length / raw.z : ship.scale);
    model.traverse(child => {
      if (!child.isMesh) return;
      if (!child.geometry.attributes.normal) child.geometry.computeVertexNormals();
      for (const material of [child.material].flat()) {
        // Diagnostic: render both sides of source faces without changing the GLB.
        // Shade by actual world height, so the effect follows translations and rotations.
        material.onBeforeCompile = shader => {
          shader.vertexShader=shader.vertexShader.replace('#include <common>', '#include <common>\nvarying float hangarHeight;');
          shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nhangarHeight=(modelMatrix*vec4(transformed,1.0)).y;');
          shader.fragmentShader=shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float hangarHeight;');
          shader.fragmentShader=shader.fragmentShader.replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor.rgb *= mix(0.24,1.0,smoothstep(-0.035,0.0,hangarHeight));');
        };
        material.customProgramCacheKey=()=> 'hangar-below-ground-v1';
        material.side = THREE.DoubleSide;
        material.needsUpdate = true;
        material.color?.set(0x819498); material.metalness = .25; material.roughness = .62;
      }
    });
    model.updateMatrixWorld(true); bounds = new THREE.Box3().setFromObject(model);
    const size = bounds.getSize(new THREE.Vector3());
    model.position.x -= (bounds.min.x + bounds.max.x) / 2;
    model.position.y -= bounds.min.y;
    model.position.z -= bounds.max.z; // Nose on the zero line; bodies extend into negative Z.
    // Pivot at the geometric centre, while preserving the initial nose and floor alignment.
    model.position.y -= size.y/2; model.position.z += size.z/2;
    group.position.set(0,size.y/2,-size.z/2);
    group.updateMatrixWorld(true);
    return { ...ship, group, size, placed:false };
  } catch (error) { disposeObject(model); throw error; }
}
function arrangeFleet() {
  const ships = [...fleet.values()];
  // Existing manually placed ships stay untouched when loading or removing another.
  let cursor=2,previousWidth=0;
  for(const ship of ships.filter(s=>s.placed)) {
    const box=new THREE.Box3().setFromObject(ship.group);
    if(box.max.x>=cursor){cursor=box.max.x;previousWidth=box.max.x-box.min.x;}
  }
  for(const ship of ships.filter(s=>!s.placed)) {
    if(previousWidth)cursor+=Math.max(2,Math.max(previousWidth,ship.size.x)*.12);
    ship.group.position.x=cursor+ship.size.x/2;
    cursor+=ship.size.x;previousWidth=ship.size.x;ship.placed=true;ship.group.updateMatrixWorld(true);
  }
  $('fleet-count').textContent = `${fleet.size} SHIP${fleet.size !== 1 ? 'S' : ''}`;
  $('fleet-tray').hidden = !fleet.size;
  $('scale-status').textContent = ships.some(s => !s.length) ? '≈ SOME SCALES ESTIMATED' : '1 UNIT = 1 m';
  $('fleet-items').replaceChildren();
  for (const ship of ships) {
    const chip = document.createElement('div'); chip.className = 'fleet-chip'; chip.dataset.shipId=ship.id; chip.classList.toggle('selected',ship.id===selectedShipId);
    const focus = document.createElement('button'); focus.className = 'ship-focus'; focus.textContent = ship.name;
    const length = document.createElement('small'); length.textContent = `${ship.length ? '' : '≈ '}${+ship.size.z.toFixed(1)} m`; focus.append(length);
    focus.setAttribute('aria-pressed',String(ship.id===selectedShipId));
    focus.addEventListener('click', () => selectShip(ship.id));
    const remove = document.createElement('button'); remove.textContent = '×'; remove.disabled = busy; remove.setAttribute('aria-label', `Remove ${ship.name}`);
    remove.addEventListener('click', () => { if(selectedShipId===ship.id)selectShip(null); scene.remove(ship.group); disposeObject(ship.group); fleet.delete(ship.id); quantities.delete(ship.catalogId??ship.id);selected.delete(ship.catalogId??ship.id); arrangeFleet(); renderShips();updateSelection(); });
    chip.append(focus, remove); $('fleet-items').append(chip);
  }
}
function selectShip(id) {
  selectedShipId=id;
  const ship=fleet.get(id);
  $('transform-panel').hidden=!ship;
  if(ship){transform.attach(ship.group);$('transform-name').textContent=ship.name;selectionBox.setFromObject(ship.group);}
  else transform.detach();
  selectionBox.visible=!!ship;
  document.querySelectorAll('.fleet-chip').forEach(chip=>{
    chip.classList.toggle('selected',chip.dataset.shipId===id);
    chip.querySelector('.ship-focus').setAttribute('aria-pressed',String(chip.dataset.shipId===id));
  });
}
function initSelection() {
  transform=new TransformControls(camera,renderer.domElement);transform.setSize(.9);transform.setSpace('world');
  scene.add(transform.getHelper());
  selectionBox=new THREE.BoxHelper(undefined,0xb3eed7);selectionBox.visible=false;
  selectionBox.material.transparent=true;selectionBox.material.opacity=.45;scene.add(selectionBox);
  let pointerStart=null,usedGizmo=false;
  transform.addEventListener('dragging-changed',event=>{
    controls.enabled=!event.value && cameraMode==='free';keys.clear();
    if(event.value){usedGizmo=true;controls.enableDamping=false;controls.update();}
    else controls.enableDamping=true;
  });
  renderer.domElement.addEventListener('pointerdown',event=>{
    pointerStart={x:event.clientX,y:event.clientY,button:event.button};usedGizmo=transform.dragging;
  },true);
  renderer.domElement.addEventListener('pointerup',event=>{
    if(!pointerStart || pointerStart.button!==0 || usedGizmo || transform.dragging)return;
    if(Math.hypot(event.clientX-pointerStart.x,event.clientY-pointerStart.y)>4)return;
    const rect=renderer.domElement.getBoundingClientRect();
    const mouse=new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
    const ray=new THREE.Raycaster();ray.setFromCamera(mouse,camera);
    const hit=ray.intersectObjects([...fleet.values()].map(s=>s.group),true)[0];
    const ship=hit && [...fleet.values()].find(s=>{let node=hit.object;while(node){if(node===s.group)return true;node=node.parent;}return false;});
    selectShip(ship?.id??null);
  });
  const setMode=mode=>{
    transform.setMode(mode);
    $('translate-ship').setAttribute('aria-pressed',String(mode==='translate'));
    $('rotate-ship').setAttribute('aria-pressed',String(mode==='rotate'));
  };
  $('translate-ship').addEventListener('click',()=>setMode('translate'));
  $('rotate-ship').addEventListener('click',()=>setMode('rotate'));
  $('deselect-ship').addEventListener('click',()=>selectShip(null));
  $('ground-ship').addEventListener('click',()=>{
    const ship=fleet.get(selectedShipId);if(!ship)return;
    ship.group.updateMatrixWorld(true);
    const lowest=new THREE.Box3().setFromObject(ship.group).min.y;
    ship.group.position.y-=lowest;ship.group.updateMatrixWorld(true);
    selectionBox.setFromObject(ship.group);
  });
  $('focus-ship').addEventListener('click',()=>frameFleet(fleet.get(selectedShipId)?.group));
}
function frameFleet(object) {
  if (!controls) return;
  if(cameraMode==='walk')setCameraMode('free');
  const bounds = new THREE.Box3();
  if (object) bounds.setFromObject(object); else for (const ship of fleet.values()) bounds.union(new THREE.Box3().setFromObject(ship.group));
  if (bounds.isEmpty()) { resetCamera(); return; }
  const center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3());
  const sidebarSpace = innerWidth > 760 ? Math.max(.45, (viewport.clientWidth - 370) / viewport.clientWidth) : 1;
  const distance = Math.max(size.x / (camera.aspect * sidebarSpace), size.y, size.z) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.55;
  // Offset the orbit target to leave the fleet clear of the floating catalogue.
  const direction = new THREE.Vector3(.5, .65, 1).normalize();
  const right = new THREE.Vector3(direction.z, 0, -direction.x).normalize();
  const shift = innerWidth > 760 ? distance * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect * (300 / viewport.clientWidth) : 0;
  controls.target.copy(center).addScaledVector(right, -shift);
  camera.position.copy(controls.target).addScaledVector(direction, Math.max(distance, 10)); controls.update();
}
function resetCamera() { if(cameraMode==='walk')setCameraMode('free'); controls.target.set(0,0,0); camera.position.set(65,65,95); controls.update(); }
async function loadSelection() {
  if(busy||!renderer)return;
  const ids=[...selected];
  const additions=ids.reduce((n,id)=>n+Math.max(0,wanted(id)-instances(id).length),0);
  if(additions>200){notify('Load up to 200 new ships at a time.');return;}
  const requests=[];
  for(const id of ids){
    const current=instances(id), target=wanted(id);
    current.slice(target).forEach(removeInstance);
    for(let i=current.length;i<target;i++)requests.push({...allShips.get(id),catalogId:id,id:!fleet.has(id)&&i===0?id:'instance-'+(++importSerial)+'-'+id});
  }
  if(requests.length)await loadShips(requests,true);
  for(const id of ids)if(instances(id).length===wanted(id))selected.delete(id);
  arrangeFleet();renderShips();updateSelection();
  if(!requests.length)$('load-status').textContent='Quantities updated.';
}
async function loadShips(requests, imported=false) {
  if (busy || !requests.length || !renderer) return requests;
  busy = true; updateSelection(); renderShips(); $('clear-fleet').disabled = true; $('select-all').disabled = true;
  arrangeFleet(); const failures = []; let count = 0;
  // At most two concurrent decodes keep large selections responsive.
  let next = 0;
  const worker = async () => {
    while (next < requests.length) {
      const ship = requests[next++], id=ship.id;
      try { const entry = await createShip(ship); fleet.set(id, entry); scene.add(entry.group); if(!imported)selected.delete(id); }
      catch (error) { failures.push(ship); console.error(`Loading ${ship.name}:`, error); }
      count++; $('load-status').textContent = `Loading ${count} / ${requests.length}…`;
    }
  };
  await Promise.all([worker(), worker()]);
  // Deterministic order, independent of network completion order.
  const ordered = [...fleet].sort(([a], [b]) => [...allShips.keys()].indexOf(a) - [...allShips.keys()].indexOf(b)); fleet.clear(); for (const [id, ship] of ordered) fleet.set(id, ship);
  busy = false; $('clear-fleet').disabled = false; $('select-all').disabled = false;
  arrangeFleet(); renderShips(); updateSelection(); frameFleet();
  $('load-status').textContent = failures.length ? `Failed: ${failures.map(s=>s.name).join(', ')}. Click Load to retry.` : `${requests.length} ship${requests.length > 1 ? 's' : ''} added.`;
  return failures;
}

async function readFleetFile(file) {
  if(!file||busy)return;
  const revision=++importRevision;
  try {
    if(file.size>5*1024*1024)throw new Error('File too large (maximum 5 MB).');
    if(!/\.(json|csv|tsv)$/i.test(file.name))throw new Error('Choose a JSON, CSV or TSV file.');
    const parsed=parseFleet(await file.text(),file.name);if(revision!==importRevision)return;
    const recognized=new Map();
    for(const row of parsed.rows){const id=matchShip(row,makers);if(id)recognized.set(id,(recognized.get(id)||0)+row.quantity);}
    for(const [id,quantity] of recognized){selected.add(id);quantities.set(id,quantity);}
    const first=recognized.keys().next().value;
    if(first){const maker=makers.find(m=>m.ships.some(s=>s.id===first));currentMaker=maker;$('maker-value').textContent=maker.name;$('maker-emblem').replaceChildren(maker.logo?imageLogo(maker):document.createTextNode(maker.code));$('ship-section').hidden=false;$('ship-search').value='';}
    $('import-status').textContent=recognized.size ? 'Selection ready. Adjust quantities, then click Load.' : 'No available models selected.';
    renderShips();updateSelection();
  }catch(error){if(revision===importRevision)$('import-status').textContent=error.message;}
}
$('fleet-drop').addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();if(!busy)$('fleet-file').click();}});
$('fleet-file').addEventListener('change',event=>{readFleetFile(event.target.files[0]);event.target.value='';});
$('fleet-drop').addEventListener('dragover',event=>{event.preventDefault();$('fleet-drop').classList.add('drag-over');});
$('fleet-drop').addEventListener('dragleave',()=>$('fleet-drop').classList.remove('drag-over'));
$('fleet-drop').addEventListener('drop',event=>{event.preventDefault();$('fleet-drop').classList.remove('drag-over');if(event.dataTransfer.files.length!==1){$('import-status').textContent='Drop one file at a time.';return;}readFleetFile(event.dataTransfer.files[0]);});
$('maker-toggle').addEventListener('click', () => { const open = $('maker-options').hidden; $('maker-options').hidden = !open; $('maker-toggle').setAttribute('aria-expanded', String(open)); if (open) $('maker-options').querySelector('button')?.focus(); });
$('maker-options').addEventListener('keydown', event => { const buttons = [...$('maker-options').querySelectorAll('button')], index = buttons.indexOf(document.activeElement); if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); buttons[(index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length].focus(); } if (event.key === 'Escape') { $('maker-options').hidden = true; $('maker-toggle').setAttribute('aria-expanded','false'); $('maker-toggle').focus(); } });
document.addEventListener('pointerdown', event => { if (!event.target.closest('.add-panel')) { $('maker-options').hidden = true; $('maker-toggle').setAttribute('aria-expanded','false'); } });
$('ship-search').addEventListener('input', renderShips);
$('select-all').addEventListener('click', () => {
  const ships = visibleShips().filter(s => !hasModel(s.id));
  const all = ships.every(s => selected.has(s.id)); for (const s of ships) {if(all){selected.delete(s.id);quantities.delete(s.id);}else{selected.add(s.id);quantities.set(s.id,Math.max(1,wanted(s.id)));}}
  renderShips(); updateSelection();
});
$('load-ships').addEventListener('click', loadSelection);
$('clear-fleet').addEventListener('click', () => { if (busy) return; selectShip(null); for (const ship of fleet.values()) { scene.remove(ship.group); disposeObject(ship.group); } fleet.clear(); quantities.clear();selected.clear(); arrangeFleet(); renderShips();updateSelection(); $('load-status').textContent = ''; });
$('frame-fleet').addEventListener('click', () => frameFleet());
$('reset-camera').addEventListener('click', () => controls && resetCamera());
$('view-perspective').addEventListener('click', () => frameFleet());
$('view-top').addEventListener('click', () => { if (!controls) return; if(cameraMode==='walk')setCameraMode('free'); const distance = camera.position.distanceTo(controls.target); camera.position.copy(controls.target).add(new THREE.Vector3(0, distance, .001)); controls.update(); });
$('help-toggle').addEventListener('click', () => { $('help-panel').hidden = !$('help-panel').hidden; $('help-toggle').setAttribute('aria-expanded', String(!$('help-panel').hidden)); });
$('toggle-panels').addEventListener('click', () => { const closed = document.querySelector('.sidebar').classList.toggle('closed'); $('toggle-panels').setAttribute('aria-expanded', String(!closed)); $('toggle-panels').setAttribute('aria-label', closed ? 'Show panels' : 'Hide panels'); $('toggle-panels').title=closed?'Show panels':'Hide panels'; $('toggle-panels').textContent=closed?'›':'‹'; });
$('camera-free').addEventListener('click',()=>setCameraMode('free'));
$('camera-walk').addEventListener('click',()=>setCameraMode('walk'));
$('camera-fullscreen').addEventListener('click',async()=>{
  try{if(document.fullscreenElement)await document.exitFullscreen();else await $('workspace').requestFullscreen();}
  catch{notify('Fullscreen is unavailable in this browser.');}
});
document.addEventListener('fullscreenchange',()=>{
  const active=document.fullscreenElement===$('workspace');
  $('camera-fullscreen').setAttribute('aria-pressed',String(active));
  $('camera-fullscreen').setAttribute('aria-label',active?'Exit fullscreen':'Enter fullscreen');
  $('camera-fullscreen').title=active?'Exit fullscreen':'Enter fullscreen';
});
$('copy-code').addEventListener('click', async () => { try { await navigator.clipboard.writeText('STAR-Q5XP-GLMY'); notify('Code copied: STAR-Q5XP-GLMY'); } catch { notify('Your code: STAR-Q5XP-GLMY — select it to copy.'); } });
try { initScene(); } catch (error) { renderer = null; const box = document.createElement('div'); box.className = 'fatal'; box.textContent = 'The 3D viewer could not start. Check that WebGL and hardware acceleration are enabled, then reload the page.'; viewport.append(box); console.error(error); }
// Keep the current hangar while moving between pages in this browser tab.
const sessionKey='fleet-viewer:hangar:v1';let restoringHangar=true;
window.addEventListener('pagehide',()=>{
  if(restoringHangar||busy)return;
  try{sessionStorage.setItem(sessionKey,JSON.stringify({ships:[...fleet.values()].map(s=>({id:s.catalogId??s.id,position:s.group.position.toArray(),rotation:s.group.rotation.toArray().slice(0,3)})),camera:camera?.position.toArray(),target:controls?.target.toArray()}));}catch{}
});
initCatalogue().then(async()=>{
  let saved;try{saved=JSON.parse(sessionStorage.getItem(sessionKey));}catch{}
  const vector=value=>Array.isArray(value)&&value.length===3&&value.every(n=>Number.isFinite(n)&&Math.abs(n)<1e7);
  const rows=Array.isArray(saved?.ships)?saved.ships.slice(0,200).filter(s=>allShips.has(s.id)&&vector(s.position)&&vector(s.rotation)):[];
  if(rows.length&&renderer){
    const requests=rows.map((s,i)=>({...allShips.get(s.id),catalogId:s.id,id:'restored-'+(++importSerial)+'-'+s.id}));
    await loadShips(requests,true);
    requests.forEach((request,i)=>{const s=fleet.get(request.id);if(s){s.group.position.fromArray(rows[i].position);s.group.rotation.set(...rows[i].rotation);s.group.updateMatrixWorld(true);s.placed=true;}});
    frameFleet();
  }
  const ids=[...new Set(new URLSearchParams(location.search).getAll('ship'))].filter(id=>allShips.has(id));
  if(ids.length&&renderer){const requests=ids.filter(id=>!hasModel(id)).map(id=>allShips.get(id));const failures=requests.length?await loadShips(requests,true):[];frameFleet();if(failures.length)$('load-status').textContent='Some comparison models could not load. Select them to retry.';}
  else if(renderer&&vector(saved?.camera)&&vector(saved?.target)){camera.position.fromArray(saved.camera);controls.target.fromArray(saved.target);controls.update();}
  restoringHangar=false;
}).catch(error=>{restoringHangar=false;$('load-status').textContent=error.message;});
// Read-only diagnostics for geometry and camera acceptance checks.
window.hangar = { groundMarkings: () => labels.children.map(m => ({ position:m.position.toArray(), size:[m.geometry.parameters.width,m.geometry.parameters.height] })), snapshot: () => ({ camera: camera?.position.toArray(), target: controls?.target.toArray(), gridStep, cameraMode, fov:camera?.fov, selectedShipId, transformMode:transform?.mode,
  fleet: [...fleet.values()].map(s => ({ name: s.name, position:s.group.position.toArray(), rotation:s.group.rotation.toArray(), calibrated: !!s.length, bounds: new THREE.Box3().setFromObject(s.group) })) }) };
