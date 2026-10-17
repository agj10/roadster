const { chromium }=require('playwright');
const fs=require('node:fs');
(async()=>{
  const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||(process.platform==='win32'?'msedge':undefined),headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
  const page=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(process.env.TEST_URL||'http://127.0.0.1:5174/',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>!!window.roadsterDiagnostics);
  await page.waitForTimeout(2500);fs.mkdirSync('.test-artifacts',{recursive:true});
  await page.screenshot({path:'.test-artifacts/overview.png'});
  const initial=await page.evaluate(()=>window.roadsterDiagnostics());
  await page.locator('#start').click();await page.keyboard.down('w');await page.waitForTimeout(1300);await page.keyboard.up('w');
  const drive=await page.evaluate(()=>window.roadsterDiagnostics());
  if(drive.position[2]<=initial.position[2]+1)throw new Error('Keyboard driving did not move forward');
  await page.keyboard.down('Space');await page.waitForTimeout(700);await page.keyboard.up('Space');
  const flight=await page.evaluate(()=>window.roadsterDiagnostics());
  if(flight.gas>=1)throw new Error('Thrust did not consume gas');
  await page.screenshot({path:'.test-artifacts/flight.png'});
  await page.keyboard.press('r');const reset=await page.evaluate(()=>window.roadsterDiagnostics());if(reset.gas<.99)throw new Error('Reset did not refill');
  await page.keyboard.press('2');await page.waitForTimeout(700);const zone=await page.evaluate(()=>window.roadsterDiagnostics());if(zone.zone!==1)throw new Error('Zone shortcut did not select ramp');
  await page.screenshot({path:'.test-artifacts/ramp.png'});
  await page.keyboard.down('w');let rampMaxHeight=0;
  for(let i=0;i<38;i++){await page.waitForTimeout(250);const d=await page.evaluate(()=>window.roadsterDiagnostics());rampMaxHeight=Math.max(rampMaxHeight,d.position[1]);if(d.position[1]>43&&d.grounded>0)await page.screenshot({path:'.test-artifacts/inverted.png'});}
  await page.keyboard.up('w');if(rampMaxHeight<44)throw new Error(`Integrated ramp climb failed: ${rampMaxHeight}`);
  await page.keyboard.press('r');
  await page.locator('#settings').click();await page.locator('#quality').selectOption('medium');await page.locator('#time').selectOption('night');await page.locator('#settings-dialog .close').click();await page.waitForTimeout(600);await page.screenshot({path:'.test-artifacts/night.png'});
  await page.locator('#help').click();if(!await page.locator('#help-dialog').isVisible())throw new Error('Help missing');await page.keyboard.press('Escape');
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'.test-artifacts/mobile.png'});
  fs.writeFileSync('.test-artifacts/browser-results.json',JSON.stringify({initial,drive,flight,reset,zone,rampMaxHeight,errors},null,2));
  console.log(JSON.stringify({initial,drive,flight,reset,zone,rampMaxHeight,errors},null,2));await browser.close();if(errors.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exit(1)});

