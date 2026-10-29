import test from 'node:test';
import assert from 'node:assert/strict';
import {runAgent} from '../src/server/agent/run.js';

test('the built-in agent keeps installed setup boilerplate out of each bounded model request',async()=>{
 let measured=false;
 await runAgent({apiKey:'fixture-not-a-key',projects:{},actor:{userId:'owner'},origin:'https://senda.example',
  messages:[{role:'user',content:'A customer sends a repair request. The coordinator logs it, agrees a visit time and confirms the booking. Please map this.'}],
  onProject:async()=>{},emit:()=>{},saveStep:async()=>{},generate:async options=>{
   measured=true;
   assert.ok(Buffer.byteLength(options.instructions)<20000,'Built-in instructions must leave room for the actual interview and model');
   assert.ok(options.tools.apply_revision.inputSchema.jsonSchema.$defs.op,'The complete operation contract is still installed');
   assert.equal(options.maxRetries,0);
   return{text:'Please share the interview.',responseMessages:[],totalUsage:{inputTokens:0,outputTokens:0}};
  }});
 assert.ok(measured);
});
