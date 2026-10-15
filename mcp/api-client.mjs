import {validateConfig} from './config.mjs';

export class BackendError extends Error {
  constructor(code,message,{status,outcomeUnknown=false}={}) {
    super(message);
    this.code=code;
    this.status=status;
    this.outcomeUnknown=outcomeUnknown;
  }
}

// The adapter uses the public HTTP contract, never the database or live Slack API.
export function createApiClient({fetchImpl=fetch,...options}) {
  const {baseUrl,actorId,timeoutMs}=validateConfig(options);
  async function request(path,{method='GET',body,idempotencyKey,signal}={}) {
    const mutation=method!=='GET';
    const timeout=AbortSignal.timeout(timeoutMs);
    const combined=signal?AbortSignal.any([signal,timeout]):timeout;
    const headers={'X-Demo-Actor-Id':actorId};
    if(mutation)Object.assign(headers,{'Content-Type':'application/json','Idempotency-Key':idempotencyKey});
    let response;
    try {
      response=await fetchImpl(new URL(path,baseUrl),{method,headers,redirect:'error',signal:combined,
        ...(mutation?{body:JSON.stringify(body)}:{})});
    } catch {
      const code=timeout.aborted?'BACKEND_TIMEOUT':signal?.aborted?'REQUEST_CANCELLED':'BACKEND_UNAVAILABLE';
      throw new BackendError(code,code==='BACKEND_UNAVAILABLE'
        ?'Cannot reach the local onboarding backend. Start npm start and check ONBOARDING_API_URL.'
        :code==='BACKEND_TIMEOUT'?'The local onboarding backend did not respond before the timeout.':'The tool call was cancelled.',
      {outcomeUnknown:mutation});
    }
    let payload;
    try { payload=await response.json(); }
    catch {throw new BackendError('BACKEND_PROTOCOL_ERROR','The backend returned an unreadable JSON response.',{status:response.status,outcomeUnknown:mutation});}
    if(!response.ok) {
      if(typeof payload?.error?.code!=='string' || typeof payload?.error?.message!=='string') {
        throw new BackendError('BACKEND_PROTOCOL_ERROR','The backend returned an unexpected error response.',{status:response.status,outcomeUnknown:mutation});
      }
      throw new BackendError(payload.error.code,payload.error.message,{status:response.status,outcomeUnknown:mutation&&response.status>=500});
    }
    if(!payload || typeof payload!=='object' || !Object.hasOwn(payload,'data')) {
      throw new BackendError('BACKEND_PROTOCOL_ERROR','The backend response is missing its data envelope.',{status:response.status,outcomeUnknown:mutation});
    }
    return payload.data;
  }
  return {actorId,request};
}
