"""Render real block previews to PNG with Browser Harness's injected CDP helpers.

Invoke through the approved browser launcher, set capture_base/capture_output and
capture_tab, then exec this source. Optional capture_slugs selects a subset.
This file does not build, serve, publish or alter application content.
"""
import base64
import hashlib
import json
import struct
import time
from pathlib import Path
from urllib.parse import urlencode

CAPTURE_WIDTH, CAPTURE_HEIGHT, CAPTURE_SCALE = 1280, 800, 2.5
ALL_BLOCKS = ['dashboard-01'] + [f'sidebar-{n:02}' for n in range(1,17)] + [f'{kind}-{n:02}' for kind in ('login','signup') for n in range(1,6)]
PROFILE_BLOCKS = {'dashboard-01','sidebar-07','sidebar-08','sidebar-12','sidebar-15','sidebar-16'}
EXPO_BLOCKS = PROFILE_BLOCKS | {'sidebar-09'}
slugs = globals().get('capture_slugs', ALL_BLOCKS)
output = Path(capture_output)
output.mkdir(parents=True, exist_ok=True)
if not capture_base.startswith(('http://localhost:', 'http://127.0.0.1:')):
    raise ValueError('Capture a local preview; production must not be used as the asset source.')
switch_tab(capture_tab)
cdp('Emulation.setDeviceMetricsOverride', width=CAPTURE_WIDTH, height=CAPTURE_HEIGHT, deviceScaleFactor=CAPTURE_SCALE, mobile=False)
cdp('Page.enable')
cdp('Page.addScriptToEvaluateOnNewDocument', source='''
if (!window.__blockCaptureErrors) {
window.__blockCaptureErrors = [];
addEventListener('error', e => { if (e.message) window.__blockCaptureErrors.push(e.message) });
addEventListener('unhandledrejection', e => window.__blockCaptureErrors.push(String(e.reason)));
const originalError = console.error.bind(console);
console.error = (...args) => { window.__blockCaptureErrors.push(args.map(String).join(' ')); originalError(...args) };
}
''')
report_path = output / 'capture-report.json'
report = json.loads(report_path.read_text()) if report_path.exists() else {'viewport': [CAPTURE_WIDTH,CAPTURE_HEIGHT], 'rasterScale': CAPTURE_SCALE, 'images': []}
for slug in slugs:
    if slug not in ALL_BLOCKS:
        raise ValueError(f'Unknown block: {slug}')
    for scheme in ('light','dark'):
        query = urlencode({'theme':scheme,'preset':'neutral','radius':'default','density':'comfortable','font':'sans'})
        url = f'{capture_base.rstrip("/")}/view/{slug}?{query}'
        cdp('Page.navigate', url=url)
        wait_for_load()
        # Routes are client-rendered: nonempty content proves activation completed.
        deadline = time.monotonic() + 25
        while time.monotonic() < deadline:
            state = js('''({url:location.href,ready:document.readyState,text:document.body?.innerText.length||0,controls:document.querySelectorAll('button,input,a').length,fonts:document.fonts.status,images:[...document.images].every(i=>i.complete&&i.naturalWidth>0)})''')
            if state['url'] == url and state['ready'] == 'complete' and state['text'] > 0 and state['controls'] > 0 and state['fonts'] == 'loaded' and state['images']:
                break
            time.sleep(.1)
        else:
            raise RuntimeError(f'Preview did not become ready: {slug}/{scheme}: {state}')
        build = js("fetch('/build-info.json').then(r=>{if(!r.ok)throw new Error('Build metadata missing');return r.json()})")
        if report.get('sourceBuild', build) != build:
            raise RuntimeError('The source build changed during capture; use a fresh output directory.')
        report['sourceBuild'] = build
        js('''(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()));await new Promise(r=>setTimeout(r,180));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return true})()''')
        if slug == 'sidebar-13':
            point = js("(()=>{const r=document.getElementById('block-sidebar-13-open').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()")
            cdp('Input.dispatchMouseEvent', type='mousePressed', button='left', clickCount=1, **point)
            cdp('Input.dispatchMouseEvent', type='mouseReleased', button='left', clickCount=1, **point)
            js("new Promise(r=>setTimeout(()=>r(true),350))")
            if not js("document.body.innerText.includes('Settings') && document.body.innerText.length > 100"):
                raise RuntimeError('Sidebar 13 settings dialog did not open')
        evidence = js('''({title:document.title,viewport:[innerWidth,innerHeight],dpr:devicePixelRatio,scheme:getComputedStyle(document.documentElement).colorScheme,fonts:document.fonts.status,geist:document.fonts.check('14px Geist'),fontChoice:document.documentElement.getAttribute('data-rightui-font-choice'),modes:document.documentElement.getAttribute('data-x-modes'),ccheever:document.body.innerText.includes('@ccheever'),oldBrand:document.body.innerText.includes('shadcn'),expo:[...document.querySelectorAll('svg[viewBox="0 0 24 22"]')].filter(e=>e.querySelector('path')?.getAttribute('d')?.startsWith('M11.39 8.269')).length,images:[...document.images].map(i=>({complete:i.complete,naturalWidth:i.naturalWidth})),horizontalOverflow:document.documentElement.scrollWidth>innerWidth,errors:window.__blockCaptureErrors||[]})''')
        evidence['warnings'] = sorted({e for e in evidence['errors'] if e == 'ResizeObserver loop completed with undelivered notifications.'})
        evidence['errors'] = [e for e in evidence['errors'] if e not in evidence['warnings']]
        if evidence['viewport'] != [CAPTURE_WIDTH,CAPTURE_HEIGHT] or evidence['scheme'] != scheme or evidence['errors'] or evidence['oldBrand'] or evidence['horizontalOverflow']:
            raise RuntimeError(f'Invalid preview: {slug}/{scheme}: {evidence}')
        if slug in PROFILE_BLOCKS and not evidence['ccheever']:
            raise RuntimeError(f'Profile identity is missing: {slug}/{scheme}')
        if slug in EXPO_BLOCKS and not evidence['expo']:
            raise RuntimeError(f'Expo brand is missing: {slug}/{scheme}')
        # CDP rasterizes the page at 2.5x. No bitmap scaling or image resampling.
        png = base64.b64decode(cdp('Page.captureScreenshot', format='png', fromSurface=True, captureBeyondViewport=False, clip={'x':0,'y':0,'width':CAPTURE_WIDTH,'height':CAPTURE_HEIGHT,'scale':1})['data'])
        dimensions = struct.unpack('>II',png[16:24])
        if dimensions != (CAPTURE_WIDTH*CAPTURE_SCALE,CAPTURE_HEIGHT*CAPTURE_SCALE):
            raise RuntimeError(f'Unexpected PNG dimensions: {dimensions}')
        filename = f'{slug}-{scheme}.png'
        (output / filename).write_bytes(png)
        item={'file':filename,'url':url,'dimensions':dimensions,'bytes':len(png),'sha256':hashlib.sha256(png).hexdigest(),**evidence}
        report['images']=[x for x in report['images'] if x['file']!=filename]+[item]
        report['totalBytes'] = sum(image['bytes'] for image in report['images'])
        report_path.write_text(json.dumps(report,indent=2)+'\n')
        print(f'{filename}: {dimensions[0]}x{dimensions[1]}, {len(png)} bytes, @ccheever={evidence["ccheever"]}, Expo={evidence["expo"]}',flush=True)
