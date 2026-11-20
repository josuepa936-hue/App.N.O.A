const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const file = require('node:path').join(__dirname,'../excoba_addon_course_only.js');
const code = readFileSync(file,'utf8');
const subject = 'EXCOBA Secundaria · Ciencias sociales';

function setup(store = new Map()) {
  const historical = {id:'hist-1a', subject, title:'Historia 1A', content:'# Paleolítico',analysisStatus:'ready',
    analysis:{overall_classification:'related', syllabus_links:[{code:'2.4.2.1'}],
      concepts:[{name:'Paleolítico', classification:'related', syllabus_codes:['2.4.2.1']}],
      evaluable_objectives:[{type:'conceptual', objective:'Describir Paleolítico'}]}};
  const geographical = {id:'geo-1', subject, title:'Geografía 1', content:'# Latitud',analysisStatus:'ready',
    analysis:{overall_classification:'core', syllabus_links:[{code:'2.4.1.1'}],
      concepts:[{name:'Latitud',classification:'core',syllabus_codes:['2.4.1.1']}]}};
  const sources=[historical,geographical];
  const original = JSON.stringify(sources);
  const api={getCourseSources:(target='')=>sources.filter(x=>!target || x.subject===target)};
  const document={baseURI:'http://localhost/App.N.O.A/index.html',readyState:'loading',addEventListener(){},getElementById(){return null}};
  const storage={getItem:k=>store.get(k)||null,setItem:(k,v)=>{store.set(k,v)}};
  const window={NOA_SOURCE_ENGINE:api};
  vm.runInNewContext(code, {window,document,localStorage:storage,URL,Promise,Set,JSON,MutationObserver:class{} });
  return {window,sources,original,store,api};
}

test('opt-in does not alter stored analysis or other course materials',()=>{
  const x=setup(), add=x.window.NOA_COURSE_ONLY_ADDON_V1;
  assert.equal(add.version,'1.0.0');
  assert.equal(add.isMarked('hist-1a'),false);
  assert.equal(x.api.getCourseSources(subject)[0],x.sources[0]);
  assert.equal(add.setMarked('hist-1a',true).ok,true);
  const view=x.api.getCourseSources(subject);
  assert.equal(view[0].analysis.overall_classification,'course_only');
  assert.deepEqual(Array.from(view[0].analysis.syllabus_links),[]);
  assert.deepEqual(Array.from(view[0].analysis.concepts[0].syllabus_codes),[]);
  assert.equal(view[0].analysis.evaluable_objectives[0].objective,'Describir Paleolítico');
  assert.equal(view[1],x.sources[1]);
  assert.equal(JSON.stringify(x.sources),x.original);
});

test('protection survives reload and is reversible',()=>{
  const s=new Map(), a=setup(s);
  assert.equal(a.window.NOA_COURSE_ONLY_ADDON_V1.setMarked('hist-1a',true).ok,true);
  const b=setup(s);
  assert.equal(b.window.NOA_COURSE_ONLY_ADDON_V1.isMarked('hist-1a'),true);
  assert.equal(b.window.NOA_COURSE_ONLY_ADDON_V1.setMarked('hist-1a',false).ok,true);
  assert.equal(b.api.getCourseSources(subject)[0],b.sources[0]);
  assert.equal(JSON.stringify(b.sources),b.original);
});

test('unknown source or blocked storage cannot change classification',()=>{
  const x=setup(), add=x.window.NOA_COURSE_ONLY_ADDON_V1;
  assert.equal(add.setMarked('not-a-source',true).ok,false);
  assert.equal(add.isMarked('not-a-source'),false);
  assert.equal(x.api.getCourseSources('EXCOBA Secundaria · Español').length,0);
  assert.equal(x.api.getCourseSources(subject)[0].analysis.overall_classification,'related');
  x.store.set = ()=>{throw Error('blocked')};
  assert.equal(add.setMarked('hist-1a',true).ok,false);
  assert.equal(add.isMarked('hist-1a'),false);
});
