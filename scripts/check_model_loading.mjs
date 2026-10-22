import assert from 'node:assert/strict';
import {test} from 'node:test';
import {loadModel} from '../ui/model-loading.js';

const ship = () => ({id:'RSI/Polaris.glb',path:'Assets/RSI/Polaris.glb',length:181});
const fresh = {id:'RSI/Polaris.glb',path:'Assets/HighDetail/new.glb',length:181,rotation:[0,Math.PI,0],scale:1};
const response = entries => ({ok:true,json:async()=>({manufacturers:[{ships:entries}]})});

test('loads the current URL with slash separators and encoded name segments',async()=>{
  const entry={...ship(),path:'Assets/Roberts Space Industries/Polaris.glb'};
  const result=await loadModel({loadAsync:async url=>{assert.equal(url,'/viewer/Assets/Roberts%20Space%20Industries/Polaris.glb');return 'model';}},entry,'/catalog.json','/viewer/',()=>{throw Error('Unexpected refresh');});
  assert.equal(result,'model');
});
test('refreshes a stale catalogue and retries the same ship using its new asset URL',async()=>{
  const entry={...ship(),id:'instance-2',catalogId:'RSI/Polaris.glb'};const urls=[];
  const result=await loadModel({loadAsync:async url=>{urls.push(url);if(urls.length===1)throw Error('404');return 'new-model';}},entry,'/catalog.json?v=old','/viewer/',async(url,options)=>{assert.match(url,/\?v=old&refresh=\d+$/);assert.equal(options.cache,'no-store');return response([fresh]);});
  assert.equal(result,'new-model');assert.equal(entry.path,fresh.path);assert.equal(entry.id,'instance-2');assert.deepEqual(urls,['/viewer/Assets/RSI/Polaris.glb','/viewer/Assets/HighDetail/new.glb']);
});
test('does not substitute a different ship or retry an unchanged failing URL',async()=>{
  for(const entries of [[ship()],[{...fresh,id:'RSI/Other.glb'}]]){
    const original=Error('Original failure');let calls=0;
    await assert.rejects(loadModel({loadAsync:async()=>{calls++;throw original;}},ship(),'/catalog.json','/viewer/',async()=>response(entries)),error=>error===original);
    assert.equal(calls,1);
  }
});
test('keeps the original error when the catalogue cannot be refreshed',async()=>{
  const original=Error('Asset failed');
  await assert.rejects(loadModel({loadAsync:async()=>{throw original;}},ship(),'/catalog.json','/viewer/',async()=>{throw Error('Offline');}),error=>error===original);
});
test('does not mutate the saved model entry when its replacement also fails',async()=>{
  const entry=ship(),before=structuredClone(entry);let calls=0;
  await assert.rejects(loadModel({loadAsync:async()=>{calls++;throw Error('Failed');}},entry,'/catalog.json','/viewer/',async()=>response([fresh])));
  assert.equal(calls,2);assert.deepEqual(entry,before);
});
test('loads the standard Polaris fallback only after the detailed model fails',async()=>{
  const entry={...ship(),name:'Polaris',fallbackPath:'Assets/legacy/Polaris.glb'};const urls=[];
  const result=await loadModel({loadAsync:async url=>{urls.push(url);if(urls.length===1)throw Error('Decoder failed');return 'standard-model';}},entry,'/catalog.json','/viewer/',async()=>response([entry]));
  assert.equal(result,'standard-model');assert.equal(urls[1],'/viewer/Assets/legacy/Polaris.glb');assert.match(entry.modelLoadWarning,/loaded standard detail/);assert.equal(entry.path,ship().path);
});
