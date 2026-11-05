const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
  const browser=await chromium.launch({args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const base=process.env.FLEET_VIEWER_URL||'http://127.0.0.1:8004/star-citizen-ship-size-comparison-mirror/';
  for(const mobile of [false,true]){
    const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},hasTouch:mobile,isMobile:mobile});
    const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base);await page.locator('#ship-search').fill('Galaxy');
    await page.waitForFunction(()=>document.querySelectorAll('.ship-row').length===1);
    const row=page.locator('.ship-row');
    await page.waitForFunction(()=>{const i=document.querySelector('.ship-art img');return i?.complete&&i.naturalWidth>0;});
    assert.match(await row.locator('.ship-length').textContent(),/120\s*m/);
    assert.match(await row.locator('.ship-art img').getAttribute('src'),/d09607009cb4112a\.webp/);
    await row.locator('.ship-check input').check();await page.locator('#load-ships').click();
    await page.waitForFunction(()=>window.hangar?.snapshot().fleet.length===1,{},{timeout:60000});
    const ship=await page.evaluate(()=>window.hangar.snapshot().fleet[0]);
    assert.equal(ship.name,'Galaxy');assert(Math.abs(ship.bounds.max.z-ship.bounds.min.z-119.99)<.002);
    assert(ship.bounds.min.y>-.002&&ship.bounds.min.y<.002);
    assert(Math.abs(ship.bounds.max.z)<.002);
    assert(ship.bounds.max.x-ship.bounds.min.x>62&&ship.bounds.max.x-ship.bounds.min.x<64);
    await page.screenshot({path:mobile?'/tmp/galaxy-mobile.png':'/tmp/galaxy-desktop.png',timeout:60000});
    await page.reload();await page.waitForFunction(()=>window.hangar?.snapshot().fleet.length===1,{},{timeout:60000});
    assert.equal(await page.evaluate(()=>window.hangar.snapshot().fleet[0].name),'Galaxy');
    assert.deepEqual(errors,[]);
    console.log('PASS',mobile?'mobile':'desktop','updated Galaxy thumbnail, selection, 119.99 m model, floor/nose alignment, render and saved-fleet restore.');
    await context.close();
  }
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
