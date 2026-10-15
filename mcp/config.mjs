export function validateConfig({baseUrl='http://127.0.0.1:4173',actorId,timeoutMs=5000}={}) {
  const url=new URL(baseUrl);
  if(url.protocol!=='http:' || !['127.0.0.1','localhost'].includes(url.hostname) || url.username || url.password || url.pathname!=='/' || url.search || url.hash) {
    throw new Error('ONBOARDING_API_URL must be a loopback HTTP origin, for example http://127.0.0.1:4173.');
  }
  if(typeof actorId!=='string' || !/^[A-Za-z0-9_-]{1,200}$/.test(actorId)) {
    throw new Error('Set ONBOARDING_DEMO_ACTOR_ID to one actor ID from GET /api/demo/actors.');
  }
  if(!Number.isInteger(timeoutMs) || timeoutMs<1 || timeoutMs>60000) {
    throw new Error('ONBOARDING_MCP_TIMEOUT_MS must be an integer from 1 to 60000.');
  }
  return {baseUrl:url.origin,actorId,timeoutMs};
}

export function configFromEnv(env=process.env) {
  return validateConfig({baseUrl:env.ONBOARDING_API_URL,actorId:env.ONBOARDING_DEMO_ACTOR_ID,
    timeoutMs:env.ONBOARDING_MCP_TIMEOUT_MS===undefined?5000:Number(env.ONBOARDING_MCP_TIMEOUT_MS)});
}
