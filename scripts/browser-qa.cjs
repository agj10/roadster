const {chromium}=require('playwright');
const fs=require('node:fs');
const assert=require('node:assert/strict');
(async()=>{
  const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||(process.platform==='win32'?'msedge':undefined),headless:true});
  const page=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  const state=()=>page.evaluate(()=>window.roadsterDiagnostics());
  await page.goto(process.env.TEST_URL||'http://127.0.0.1:5174/',{waitUntil:'networkidle'});await page.waitForFunction(()=>!!window.roadsterDiagnostics);await page.waitForTimeout(500);fs.mkdirSync('.test-artifacts',{recursive:true});
  const initial=await state();assert.equal(initial.zoneCount,9);assert.equal(initial.grounded,4);assert.ok(initial.infinite);
  for(const wheel of initial.wheels)assert.ok(Math.abs(wheel.position[1]-wheel.radius-.06)<.018,'wheel does not meet rendered asphalt');
  await page.screenshot({path:'.test-artifacts/overview.png'});
  // The same real pointer gestures users reported, including native context-menu suppression.
  await page.mouse.move(850,470);await page.mouse.down({button:'right'});await page.mouse.move(1120,540,{steps:15});await page.mouse.up({button:'right'});await page.waitForTimeout(250);
  const orbit=await state();assert.ok(Math.abs(orbit.camera.yaw-initial.camera.yaw)>.8,'right-drag did not rotate');
  const contextPrevented=await page.locator('#scene').evaluate(canvas=>!canvas.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,button:2})));assert.ok(contextPrevented,'browser context menu was not suppressed');
  await page.mouse.wheel(0,-500);await page.waitForTimeout(350);const zoomIn=await state();assert.ok(zoomIn.camera.zoom<initial.camera.zoom*.7);
  await page.screenshot({path:'.test-artifacts/model-close.png'});
  await page.mouse.wheel(0,1500);await page.waitForTimeout(450);const zoomOut=await state();assert.ok(zoomOut.camera.zoom>25);
  await page.screenshot({path:'.test-artifacts/wide.png'});
  await page.keyboard.press('End');await page.mouse.wheel(0,-1100);
  await page.locator('#start').click();await page.keyboard.down('w');await page.waitForFunction(()=>window.roadsterDiagnostics().speed>15);await page.keyboard.down('a');await page.waitForFunction(()=>window.roadsterDiagnostics().position[0]<-2);await page.keyboard.up('a');await page.keyboard.up('w');
  const left=await state();assert.ok(left.position[0]<-1,'A did not steer left: '+JSON.stringify(left));assert.ok(left.grounded>0,'flat steering lost contact');
  await page.keyboard.press('r');await page.keyboard.down('w');await page.waitForFunction(()=>window.roadsterDiagnostics().speed>15);await page.keyboard.down('d');await page.waitForFunction(()=>window.roadsterDiagnostics().position[0]>2);await page.keyboard.up('d');await page.keyboard.up('w');
  const right=await state();assert.ok(right.position[0]>1,'D did not steer right');
  await page.keyboard.press('r');await page.keyboard.down('Space');await page.waitForTimeout(700);const flight=await state();assert.ok(flight.position[1]>2&&flight.particleCount>80);assert.equal(flight.gas,1);
  await page.screenshot({path:'.test-artifacts/flight.png'});await page.keyboard.up('Space');
  await page.keyboard.press('r');
  const routes=[];for(let n=1;n<=9;n++){await page.keyboard.press(String(n));await page.waitForTimeout(90);const d=await state();assert.equal(d.zone,n-1);assert.ok(d.position.every(Number.isFinite));routes.push(d.position);}
  await page.keyboard.press('2');await page.keyboard.down('w');let rampMaxHeight=0,savedInverted=false;
  for(let i=0;i<60;i++){await page.waitForTimeout(250);const d=await state();rampMaxHeight=Math.max(rampMaxHeight,d.position[1]);if(d.position[1]>48.7&&d.grounded>0&&!savedInverted){await page.screenshot({path:'.test-artifacts/inverted.png'});savedInverted=true;}if(savedInverted&&rampMaxHeight>49)break;}
  await page.keyboard.up('w');assert.ok(rampMaxHeight>45,'half ramp is not traversable');
  await page.keyboard.press('r');
  await page.locator('#locations').click();assert.equal(await page.locator('[data-zone]:visible').count(),9);await page.locator('[data-zone="5"]').click();await page.waitForTimeout(250);assert.equal((await state()).zone,5);await page.screenshot({path:'.test-artifacts/banked.png'});
  await page.locator('#settings').click();await page.locator('#quality').selectOption('medium');await page.locator('#time').selectOption('night');await page.locator('#settings-dialog .close').click();await page.waitForTimeout(300);await page.screenshot({path:'.test-artifacts/night.png'});
  await page.locator('#help').click();assert.ok(await page.locator('#help-dialog').isVisible());await page.keyboard.press('Escape');
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'.test-artifacts/mobile.png'});
  const report={initial,orbit,zoomIn:zoomIn.camera.zoom,zoomOut:zoomOut.camera.zoom,left:left.position,right:right.position,flight:flight.position,particles:flight.particleCount,routes,rampMaxHeight,errors};
  fs.writeFileSync('.test-artifacts/browser-results.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));await browser.close();assert.deepEqual(errors,[]);
})().catch(e=>{console.error(e);process.exit(1);});
