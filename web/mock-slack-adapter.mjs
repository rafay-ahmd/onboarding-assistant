// Deliberately contains no network calls, credentials or Slack SDK.
export const mockSlackAdapter = Object.freeze({
  provider:'mock',
  send(request,scenario) {
    if(scenario==='failure')return {kind:'failed',message:'Mock transport rejected the message before delivery. A manual retry is safe.'};
    if(scenario==='unknown')return {kind:'unknown',message:'Mock timeout: delivery may have succeeded. Check delivery; do not resend.'};
    if(scenario!=='success')throw Error('Unknown mock delivery scenario.');
    return {kind:'accepted',receipt:this.findReceipt(request)};
  },
  findReceipt(request) {return {channel:'DEMO-helpdesk',thread:`mock-thread-${request.id}`,provider:'mock'};}
});
