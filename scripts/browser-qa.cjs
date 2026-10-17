const {chromium}=require('playwright');
const fs=require('node:fs');
const assert=require('node:assert/strict');

(async()=>{
  fs.mkdirSync('.test-artifacts',{recursive:true});
  const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||(process.platform==='win32'?'msedge':undefined),headless:true});
  const page=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:1});
  page.setDefaultTimeout(30000);
  const errors=[],report={};
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  const state=()=>page.evaluate(()=>window.roadsterDiagnostics());
  const frame=()=>page.evaluate(()=>new Promise(requestAnimationFrame));
  const shot=name=>page.screenshot({path:'.test-artifacts/'+name+'.png'});
  async function drag(steps){
    await page.mouse.move(500,380);await page.mouse.down({button:'right'});
    await page.mouse.move(740,440,{steps});await page.mouse.up({button:'right'});await frame();
    const d=await state();
    const actualYaw=Math.atan2(-(d.camera.position[0]-d.camera.target[0]),-(d.camera.position[2]-d.camera.target[2]));
    assert.ok(Math.abs(actualYaw-d.camera.yaw)<1e-9,'rendered camera lags mouse input');
    return d;
  }
  try {
    await page.goto(process.env.TEST_URL||'http://127.0.0.1:5174/',{waitUntil:'networkidle'});
    await page.waitForFunction(()=>!!window.roadsterDiagnostics);await frame();
    report.initial=await state();assert.equal(report.initial.controlsVersion,'classic-orbit-2');
    assert.equal(report.initial.zoneCount,9);assert.equal(report.initial.grounded,4);assert.ok(report.initial.infinite);
    for(const w of report.initial.wheels)assert.ok(Math.abs(w.position[1]-w.radius-.06)<.018,'tyre misses asphalt');
    await shot('controls-overview');

    report.fastDrag=await drag(1);await page.keyboard.press('r');await frame();report.slowDrag=await drag(24);
    assert.ok(Math.abs(report.fastDrag.camera.yaw+240*.0035)<1e-10);
    assert.ok(Math.abs(report.fastDrag.camera.yaw-report.slowDrag.camera.yaw)<1e-10);
    assert.ok(Math.abs(report.fastDrag.camera.pitch-report.slowDrag.camera.pitch)<1e-10);
    const released=report.slowDrag.camera;
    await page.waitForTimeout(500);await page.mouse.move(840,500);await frame();
    assert.equal((await state()).camera.yaw,released.yaw,'camera rotated after RMB release');
    await page.mouse.down({button:'left'});await page.mouse.move(940,500);await page.mouse.up({button:'left'});await frame();
    assert.equal((await state()).camera.yaw,released.yaw,'left click unexpectedly orbited');
    assert.ok(await page.locator('#scene').evaluate(canvas=>!canvas.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,button:2}))));
    await page.mouse.wheel(0,-500);await frame();report.zoomIn=(await state()).camera.zoom;
    await page.mouse.wheel(0,1500);await frame();report.zoomOut=(await state()).camera.zoom;
    assert.ok(report.zoomIn<8&&report.zoomOut>40);await shot('controls-wide');
    await page.mouse.wheel(0,-1000);await page.keyboard.press('r');await page.locator('#start').click();
    console.log('PASS direct mouse response, release, context menu, zoom');

    report.steering=[];
    for(const zone of ['1','6'])for(const [key,sign] of [['a',-1],['d',1]]){
      await page.keyboard.press(zone);await frame();const before=await state();
      await page.keyboard.down('w');await page.waitForFunction(()=>window.roadsterDiagnostics().speed>9);
      await page.keyboard.down(key);
      await page.waitForFunction(sign=>window.roadsterDiagnostics().screenForward[0]*sign>.11,sign);
      await page.keyboard.up(key);await page.keyboard.up('w');await frame();
      const after=await state();assert.ok(after.screenForward[0]*sign>.1,'wrong SCREEN steering direction');
      assert.equal(after.camera.yaw,before.camera.yaw,'car rotation overrode the camera');
      assert.ok(after.grounded>=2,'steering lost tyre contact');
      report.steering.push({zone,key,screenForward:after.screenForward,position:after.position,cameraYaw:after.camera.yaw});
      await shot('steer-'+zone+'-'+key);
    }
    console.log('PASS screen-left/right steering at both vehicle headings');

    await page.keyboard.press('5');await page.keyboard.down('w');await page.waitForFunction(()=>window.roadsterDiagnostics().speed>=24);
    await page.keyboard.up('w');await frame();report.coastStart=await state();
    await page.waitForFunction(()=>window.roadsterDiagnostics().throttle===0);
    await page.waitForFunction(t=>window.roadsterDiagnostics().simulationTime>=t+5,report.coastStart.simulationTime);
    report.coastEnd=await state();assert.ok(report.coastEnd.speed<report.coastStart.speed*.6,'releasing W did not decelerate');
    assert.equal(report.coastEnd.camera.yaw,report.coastStart.camera.yaw);
    assert.equal(report.coastEnd.camera.zoom,report.coastStart.camera.zoom);
    assert.equal(report.coastEnd.camera.fov,report.coastStart.camera.fov);
    await shot('coasting');
    await page.keyboard.down('s');await page.waitForFunction(()=>window.roadsterDiagnostics().signedSpeed<-.8);
    report.reverse=await state();await page.keyboard.up('s');
    assert.equal(report.reverse.driveState,'reverse');
    console.log('PASS coasting '+(report.coastStart.speed*3.6).toFixed(1)+' -> '+(report.coastEnd.speed*3.6).toFixed(1)+' km/h in 5 simulation seconds, then brake and reverse');

    await page.keyboard.press('1');await page.keyboard.down('Space');
    await page.waitForFunction(()=>window.roadsterDiagnostics().position[1]>2.5);
    report.flight=await state();assert.equal(report.flight.gas,1);assert.ok(report.flight.particleCount>50);
    await shot('controls-flight');await page.keyboard.up('Space');
    report.routes=[];
    for(let n=1;n<=9;n++){await page.keyboard.press(String(n));await frame();const d=await state();assert.equal(d.zone,n-1);assert.ok(d.position.every(Number.isFinite));report.routes.push(d.position);}
    await page.keyboard.press('2');await page.keyboard.down('w');
    await page.waitForFunction(()=>{const d=window.roadsterDiagnostics();return d.position[1]>48.7&&d.grounded>=2;});
    report.inverted=await state();assert.ok(report.inverted.camera.cutaway,'inverted road forced camera into the car');assert.ok(report.inverted.camera.distance>10);await shot('controls-inverted');await page.keyboard.up('w');
    console.log('PASS unlimited flight, nine zones, inverted half-ramp');

    await page.keyboard.press('1');await page.locator('#settings').click();
    await page.locator('#sensitivity').fill('1.5');await page.locator('#sensitivity').dispatchEvent('input');
    await page.locator('#settings-dialog .close').click();
    await page.keyboard.press('h');assert.ok(await page.locator('#help-dialog').isVisible());await page.keyboard.press('Escape');
    assert.deepEqual(errors,[]);report.errors=errors;
    fs.writeFileSync('.test-artifacts/browser-results.json',JSON.stringify(report,null,2));
    console.log('PASS browser controls regression; report: .test-artifacts/browser-results.json');
  } catch(error) {
    await shot('controls-failure').catch(()=>{});
    console.error(JSON.stringify({lastState:await state().catch(()=>null),errors},null,2));
    throw error;
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exit(1);});
