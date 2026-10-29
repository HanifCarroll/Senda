import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync,readFileSync} from 'node:fs';
import {memoryD1} from './fixtures/d1.js';
import {CloudProjects} from '../src/cloudflare/projects.js';
import {runAgent} from '../src/server/agent/run.js';

async function fixture(){
 const db=memoryD1();for(const n of readdirSync(new URL('../src/cloudflare/migrations/',import.meta.url)).sort())db.exec(readFileSync(new URL('../src/cloudflare/migrations/'+n,import.meta.url),'utf8'));
 const objects=new Map(),bucket={put:async(k,v)=>objects.set(k,v),delete:async k=>objects.delete(k),get:async k=>objects.has(k)?{text:async()=>objects.get(k)}:null};
 const projects=new CloudProjects(db,bucket),actor={userId:'analyst'},id=(await projects.create(actor,{name:'Request',purpose:'Check requests',perspective:'Coordinator'})).id;
 await projects.apply(actor,id,{expectedRevision:1,summary:'Overview',operations:[{op:'add',kind:'startEvent',id:'Start'},{op:'add',kind:'subProcess',id:'Stage',name:'Check request'},{op:'add',kind:'endEvent',id:'Done'},{op:'connect',source:'Start',target:'Stage',id:'In'},{op:'connect',source:'Stage',target:'Done',id:'Out'}]});
 return{db,projects,actor,id};
}
for(const[title,operations,code,advice]of[
 ['cross-family retyping',[{op:'retype',id:'Stage',kind:'exclusiveGateway'}],'E_INVALID_RETYPE',/different famil|activity.*gateway/i],
 ['removing a flow after its owner',[{op:'remove',ids:['Stage'],bridge:false},{op:'remove',ids:['Out']}],'E_NOT_FOUND',/incident|already removed|cascade/i],
])test(`the built-in tool explains ${title} using hosted operations without changing the saved model`,async()=>{
 const f=await fixture();try{
  await runAgent({apiKey:'fixture',projects:f.projects,actor:f.actor,projectId:f.id,origin:'https://senda.example',messages:[{role:'user',content:'Expand the request check into the detailed process.'}],emit:()=>{},saveStep:async()=>{},generate:async({tools})=>{
   const result=await tools.apply_revision.execute({projectId:f.id,model:'as-is',proposal:{expectedRevision:2,summary:'Expand check',operations}});
   assert.equal(result.error,code);assert.match(result.message,advice);assert.match(result.details.hint,/read_project/);assert.doesNotMatch(result.details.hint,/bpmn (remove|show|find)/);
   assert.equal((await f.projects.head(f.actor,f.id,'as-is')).revision,2);
   return{text:'No changes were saved.',responseMessages:[],totalUsage:{inputTokens:0,outputTokens:0}};
  }});
 }finally{f.db.close()}
});

test('an explicit replacement can recreate removed incident flows under their existing IDs',async()=>{
 const f=await fixture();try{
  const preview=await f.projects.preview(f.actor,f.id,{expectedRevision:2,summary:'Replace stage with decision',operations:[{op:'remove',ids:['Stage'],bridge:false},{op:'add',kind:'exclusiveGateway',id:'Stage',name:'Request complete?'},{op:'connect',source:'Start',target:'Stage',id:'In'},{op:'connect',source:'Stage',target:'Done',id:'Out'}]});
  assert.match(preview.candidate.xml,/exclusiveGateway[^>]*id="Stage"|id="Stage"[^>]*exclusiveGateway/);
  assert.equal((await f.projects.head(f.actor,f.id,'as-is')).revision,2,'Preview never saves the replacement');
 }finally{f.db.close()}
});
