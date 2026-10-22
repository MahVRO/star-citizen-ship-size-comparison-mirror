const {chromium}=require('playwright');const assert=require('node:assert/strict');
(async()=>{
  const browser=await chromium.launch({args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  let catalogueRequests=0;
  await page.route('**/viewer/catalog.json*',async route=>{
    catalogueRequests++;
    if(catalogueRequests>1)return route.continue();
    const response=await route.fetch(),catalog=await response.json();
    const ship=catalog.manufacturers.flatMap(m=>m.ships).find(s=>s.name==='Polaris');
    ship.path='Assets/retired/Polaris.glb';
    await route.fulfill({json:catalog});
  });
  const base=process.env.FLEET_VIEWER_URL||'http://127.0.0.1:8004/star-citizen-ship-size-comparison-mirror/';
  await page.goto(base+'?ship='+encodeURIComponent('Roberts Space Industries/Polaris.glb'));
  await page.waitForFunction(()=>window.hangar?.snapshot().fleet.length===1,{},{timeout:120000});
  assert(catalogueRequests>=2,'A failed stale URL must trigger a catalogue refresh');
  const ship=await page.evaluate(()=>window.hangar.snapshot().fleet[0]);
  assert.equal(ship.name,'Polaris');assert(Math.abs(ship.bounds.max.z-ship.bounds.min.z-181)<.002);
  await page.screenshot({path:'/tmp/polaris-recovered.png',timeout:120000});
  const legacy=await page.evaluate(async()=>{
    const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
    const {MeshoptDecoder}=await import('three/addons/libs/meshopt_decoder.module.js');
    const url=new URL('Assets/Roberts%20Space%20Industries/Polaris.glb',location.href);
    const model=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(url.href);
    let meshes=0;model.scene.traverse(node=>{if(node.isMesh){meshes++;node.geometry.dispose();}});return meshes;
  });
  assert(legacy>0);assert.deepEqual(errors,[]);
  await page.close();
  const fallbackPage=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  await fallbackPage.route('**/Assets/HighDetail/*.glb',route=>route.fulfill({status:503,body:'Simulated detailed-model failure'}));
  await fallbackPage.goto(base+'?ship='+encodeURIComponent('Roberts Space Industries/Polaris.glb'));
  await fallbackPage.waitForFunction(()=>window.hangar?.snapshot().fleet.length===1,{},{timeout:60000});
  assert.match(await fallbackPage.locator('#toast').textContent(),/Polaris: detailed model unavailable; loaded standard detail/);
  assert.equal(await fallbackPage.evaluate(()=>window.hangar.snapshot().fleet[0].name),'Polaris');
  console.log('PASS stale Polaris URL recovers to high detail, renders at 181 m, legacy URL decodes without Draco, and a simulated detailed-model failure loads standard detail with a notice on mobile.');
  await browser.close();
})().catch(error=>{console.error(error);process.exit(1)});
