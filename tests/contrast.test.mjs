import test from 'node:test';
import assert from 'node:assert/strict';
import {compareJob, signature, safe} from '../public/contrast-room.js';

const base = () => ({ messages: [{id:'m1', name:'Initial'}, {id:'m2', name:'Change'}],
  candidates: [
    {field:'quantity',value:500,raw:'500',kind:'assertion',sourceId:'m1',line:4},
    {field:'quantity',value:300,raw:'300',kind:'quoted history',sourceId:'m1',line:5},
    {field:'quantity',value:'Would 750 be cheaper?',raw:'Would 750 be cheaper?',kind:'question',sourceId:'m1',line:6},
    {field:'quantity',value:600,raw:'600',kind:'assertion',sourceId:'m2',line:4},
  ], resolutions:{}, issues:[{field:'quantity',message:'Competing sources'}], revisions:[] });

test('direct assertions alone create contrast, questions and quotations remain context', () => {
  const x=compareJob(base());
  assert.equal(x.contested.length,1);
  assert.deepEqual(x.contested[0].alternatives.map(a=>a.value),[500,600]);
  assert.deepEqual(x.contested[0].context.map(c=>c.kind),['quoted history','question']);
  assert.equal(x.contested[0].alternatives[0].records[0].sourceName,'Initial');
});
test('duplicate assertions collapse into a single distinct value, not a conflict', () => {
  const j=base();j.candidates=j.candidates.filter(c=>c.value!==600);
  j.candidates.push({...j.candidates[0],sourceId:'m2'});
  assert.equal(compareJob(j).contested.length,0);
});
test('normalized unit forms compare by value and unit', () => {
  assert.equal(signature({value:50,unit:'mm'}),signature({value:50,unit:'mm'}));
  assert.notEqual(signature({value:50,unit:'cm'}),signature({value:50,unit:'mm'}));
});
test('late evidence preserves original release and exposes changed and unresolved fields',()=>{
  const j=base();j.resolutions={quantity:{value:600},artwork:{value:'R3'}};
  j.revisions=[{number:1,approvedAt:'2026-10-28T00:00:00Z',approvedBy:'Reviewer',spec:{quantity:{value:500},width:{value:100,unit:'mm'},artwork:{value:'R3'}},sourceIds:['m1']}];
  const result=compareJob(j);
  assert.deepEqual(result.changes.map(d=>[d.field,d.kind]),[['quantity','changed'],['width','unresolved']]);
  assert.equal(result.newSources.length,1);
  assert.equal(result.newSources[0].id,'m2');
  assert.equal(j.revisions[0].spec.quantity.value,500);
});
test('new sources without changed values still appear after sign-off',()=>{
  const j=base();j.resolutions={quantity:{value:500}};
  j.revisions=[{spec:{quantity:{value:500}},sourceIds:['m1']}];
  assert.equal(compareJob(j).changes.length,0);
  assert.equal(compareJob(j).newSources.length,1);
});
test('untrusted source names and values are escaped',()=>{
  assert.equal(safe('<img onerror="x">'),'&lt;img onerror=&quot;x&quot;&gt;');
});