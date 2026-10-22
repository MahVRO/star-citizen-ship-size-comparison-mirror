// Verify every replacement through the browser loader actually used by the site.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
  const browser=await chromium.launch({headless:true,args:['--no-sandbox',
    '--use-angle=swiftshader','--enable-unsafe-swiftshader','--js-flags=--expose-gc']});
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const url=process.env.FLEET_VIEWER_URL||'http://127.0.0.1:8000/star-citizen-ship-size-comparison-mirror/';
  await page.goto(url);await page.waitForFunction(()=>window.hangar);
  await page.exposeFunction('modelProgress',message=>console.log(message));
  const result=await page.evaluate(async()=>{
    const root=new URL('./',location.href).pathname;
    const THREE=await import('three');
    const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
    const {DRACOLoader}=await import('three/addons/loaders/DRACOLoader.js');
    const {MeshoptDecoder}=await import('three/addons/libs/meshopt_decoder.module.js');
    const decoder=new DRACOLoader().setWorkerLimit(2).setDecoderPath(root+'viewer/vendor/examples/jsm/libs/draco/gltf/');
    const loader=new GLTFLoader().setDRACOLoader(decoder).setMeshoptDecoder(MeshoptDecoder);
    const catalog=await fetch(root+'viewer/catalog.json').then(r=>r.json());
    const manifest=await fetch(root+'viewer/models.json').then(r=>r.json());
    const ships=catalog.manufacturers.flatMap(m=>m.ships);
    const failures=[];let checked=0;
    for(const entry of manifest.upgrades){
      const ship=ships.find(s=>s.id===entry.id);
      try{
        if(!ship||ship.modelProvider!=='FleetYards')throw Error('Missing catalogue replacement');
        const gltf=await loader.loadAsync(root+encodeURI(ship.path));
        gltf.scene.rotation.set(...ship.rotation);gltf.scene.updateMatrixWorld(true);
        const bounds=new THREE.Box3().setFromObject(gltf.scene);
        const size=bounds.getSize(new THREE.Vector3());
        if(!size.toArray().every(n=>Number.isFinite(n)&&n>0))throw Error('Invalid geometry bounds');
        if(ship.length){
          gltf.scene.scale.multiplyScalar(ship.length/size.z);gltf.scene.updateMatrixWorld(true);
          const scaled=new THREE.Box3().setFromObject(gltf.scene).getSize(new THREE.Vector3());
          if(Math.abs(scaled.z-ship.length)>0.002)throw Error('Incorrect length calibration');
        }
        let triangles=0,meshes=0;
        const geometries=new Set(),materials=new Set();
        gltf.scene.traverse(node=>{if(node.isMesh){meshes++;
          if(!node.geometry.attributes.position)throw Error('Missing positions');
          if(!geometries.has(node.geometry))triangles+=(node.geometry.index?.count??node.geometry.attributes.position.count)/3;
          geometries.add(node.geometry);for(const mat of [node.material].flat())materials.add(mat);
        }});
        if(!meshes||triangles<entry.previousTriangles)throw Error('Geometry is not an upgrade');
        for(const geometry of geometries)geometry.dispose();
        for(const material of materials){for(const value of Object.values(material))if(value?.isTexture)value.dispose();material.dispose();}
      }catch(e){failures.push({ship:entry.id,error:e.message});}
      checked++;if(checked%10===0)await window.modelProgress(`Loaded ${checked}/${manifest.upgrades.length} replacement models`);
      if(checked%5===0&&window.gc)window.gc();
    }
    decoder.dispose();return {checked,failures,retained:manifest.retained.length,total:ships.length};
  });
  assert.deepEqual(result.failures,[]);assert.deepEqual(errors,[]);
  assert.equal(result.checked+result.retained,result.total);
  console.log('PASS all replacement models decode, have finite geometry and retain catalogue scale.',JSON.stringify(result));
  await browser.close();
})().catch(error=>{console.error(error);process.exit(1)});
