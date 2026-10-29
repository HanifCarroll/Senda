export function mcpDiagnostic(label,metadata){
 try{console.info(label,JSON.stringify(metadata))}catch{}
}

export function mcpTransportError(error,callIds=[]){
 try{
  const allowed=new Set(['Error','TypeError','RangeError','SyntaxError','McpError','SdkError','UnsupportedProtocolVersionError']);
  const name=error?.name,code=error?.code;
  mcpDiagnostic('Senda MCP transport error',{callIds:[...callIds],name:allowed.has(name)?name:'Error',
   ...(Number.isSafeInteger(code)?{code}:{})});
 }catch{}
}

export function observeMcpResponse(response,{callIds,started}){
 let bytes=0,finished=false;
 const finish=outcome=>{
  if(finished)return;finished=true;
  mcpDiagnostic('Senda MCP delivery',{callIds:[...callIds],outcome,status:response.status,bytes,elapsedMs:Math.round(performance.now()-started)});
 };
 if(!response.body){finish('complete');return response}
 const reader=response.body.getReader();
 const body=new ReadableStream({
  async pull(controller){
   try{
    const {done,value}=await reader.read();
    if(finished)return;
    if(done){finish('complete');controller.close()}
    else{bytes+=value.byteLength;controller.enqueue(value)}
   }catch(error){finish('error');throw error}
   finally{if(finished)reader.releaseLock()}
  },
  async cancel(reason){
   finish('canceled');
   try{return await reader.cancel(reason)}finally{reader.releaseLock()}
  },
 },{highWaterMark:0});
 return new Response(body,{status:response.status,statusText:response.statusText,headers:response.headers});
}
