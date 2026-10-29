export const activityNames = {
  User: 'Coordinator manually checks unreadable or uncertain pack',
  Send: 'Coordinator requests missing information',
  Receive: 'Receive corrected pack',
  Manual: 'Coordinator manually verifies received information',
  Service: 'Automatically compare the submitted information with the existing client record',
  Script: 'Normalize all document dates and client identifiers',
  Rule: 'Evaluate whether every mandatory item is present',
  Plain: 'Review the supplied supporting information before approving',
  Escaped: 'Review <untrusted> & quoted "client" information',
  Explicit: 'First complete line\nSecond complete line',
  Unicode: '確認所有客戶資料 😀 café Şirket',
  Unbroken: 'UnbrokenReferenceABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
  Loop: 'Confirm uncertain information with the client',
  Sequential: 'Validate each submitted document and record its outcome',
  Parallel: 'Validate all submitted documents and record their outcomes',
  Call: 'Complete client onboarding and provisioning checks',
  Collapsed: 'Complete client onboarding and provisioning checks',
  Transaction: 'Complete the reversible client transaction',
  EventSub: 'Handle the client withdrawal notification',
  AdHoc: 'Complete each applicable client verification',
};
const escaped = value => value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;').replaceAll('\n','&#10;');
const definitions = body => `<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D" targetNamespace="urn:synthetic-readability">${body}</bpmn:definitions>`;
export function activityAtlas() {
  const types = {User:'userTask',Send:'sendTask',Receive:'receiveTask',Manual:'manualTask',Service:'serviceTask',Script:'scriptTask',Rule:'businessRuleTask',Plain:'task',Escaped:'userTask',Explicit:'task',Unicode:'task',Unbroken:'task',Loop:'userTask',Sequential:'task',Parallel:'task',Call:'callActivity',Collapsed:'subProcess',Transaction:'transaction',EventSub:'subProcess',AdHoc:'adHocSubProcess'};
  return definitions(`<bpmn:process id="P">${Object.entries(types).map(([id,type])=>`<bpmn:${type} id="${id}" name="${escaped(activityNames[id])}"${id==='EventSub'?' triggeredByEvent="true"':''}${id==='AdHoc'?' isForCompensation="true"':''}>${id==='Loop'?'<bpmn:standardLoopCharacteristics/>':id==='Sequential'||id==='Parallel'||id==='AdHoc'?`<bpmn:multiInstanceLoopCharacteristics isSequential="${id==='Sequential'}"/>`:''}</bpmn:${type}>`).join('')}</bpmn:process>`);
}
export function threeBoundaryTimers() {
  return definitions(`<bpmn:collaboration id="C"><bpmn:participant id="Pool" name="Client service operations" processRef="P"/></bpmn:collaboration><bpmn:process id="P"><bpmn:laneSet id="Lanes"><bpmn:lane id="Lane" name="Coordinator"><bpmn:flowNodeRef>Request</bpmn:flowNodeRef><bpmn:flowNodeRef>Receive</bpmn:flowNodeRef>${[1,2,3].map(n=>`<bpmn:flowNodeRef>Handler${n}</bpmn:flowNodeRef>`).join('')}</bpmn:lane></bpmn:laneSet><bpmn:sendTask id="Request" name="Coordinator requests missing information"/><bpmn:receiveTask id="Receive" name="Receive corrected pack"/><bpmn:sequenceFlow id="Main" sourceRef="Request" targetRef="Receive"/>${[1,2,3].map(n=>`<bpmn:boundaryEvent id="Timer${n}" attachedToRef="Receive" name="${n+1} calendar days without corrected information" cancelActivity="${n===3}"><bpmn:timerEventDefinition/></bpmn:boundaryEvent><bpmn:sendTask id="Handler${n}" name="Automatically remind client of missing information"/><bpmn:sequenceFlow id="Retry${n}" sourceRef="Timer${n}" targetRef="Handler${n}"/>`).join('')}</bpmn:process>`);
}


export function markedBoundaryTimers(count = 1) {
  const id=(prefix,n)=>count===1?prefix:`${prefix}${n}`;
  return definitions(`<bpmn:process id="P"><bpmn:adHocSubProcess id="Host" name="Check" isForCompensation="true"><bpmn:multiInstanceLoopCharacteristics/></bpmn:adHocSubProcess>${Array.from({length:count},(_,i)=>{const n=i+1;return `<bpmn:boundaryEvent id="${id('Timer',n)}" attachedToRef="Host" name="Two days"><bpmn:timerEventDefinition/></bpmn:boundaryEvent><bpmn:task id="${id('Handle',n)}" name="Handle"/><bpmn:sequenceFlow id="${id('AfterTimer',n)}" sourceRef="${id('Timer',n)}" targetRef="${id('Handle',n)}"/>`;}).join('')}</bpmn:process>`);
}
