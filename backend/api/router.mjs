import { AppError } from '../services/errors.mjs';

function reply(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(value));
}
async function readBody(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new AppError(400, 'INVALID_INPUT', 'Use Content-Type: application/json.');
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 32768) throw new AppError(413, 'TOO_LARGE', 'JSON body exceeds 32 KiB.');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new AppError(400, 'INVALID_JSON', 'Provide valid JSON.'); }
}
export function apiRouter(platform) {
  return async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (!url.pathname.startsWith('/api/')) return false;
    try {
      const host = req.headers.host;
      if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host || '')) throw new AppError(403, 'INVALID_HOST', 'Use the local loopback address.');
      if (req.headers.origin && req.headers.origin !== `http://${host}`) throw new AppError(403, 'INVALID_ORIGIN', 'API requests must come from this local portal.');
      const actor = req.headers['x-demo-actor-id'];
      const key = req.headers['idempotency-key'];
      let data;
      if (req.method === 'GET' && url.pathname === '/api/demo/actors') data = platform.actors();
      else if (req.method === 'GET' && url.pathname === '/api/profiles') data = platform.profiles(actor);
      else if (req.method === 'POST' && url.pathname === '/api/profiles') data = platform.createProfile(actor, key, await readBody(req));
      else if (req.method === 'GET' && url.pathname === '/api/location-defaults') data = platform.locationDefaults(actor);
      else if (req.method === 'GET' && url.pathname === '/api/hires') data = platform.list(actor, Number(url.searchParams.get('offset') ?? 0));
      else if (req.method === 'POST' && url.pathname === '/api/hires') data = platform.create(actor, key, await readBody(req));
      else {
        const hire = url.pathname.match(/^\/api\/hires\/([^/]+)(?:\/(account|provision|requests))?$/);
        const action = url.pathname.match(/^\/api\/(requests|assignments)\/([^/]+)\/actions$/);
        const profile = url.pathname.match(/^\/api\/profiles\/([^/]+)$/);
        const location = url.pathname.match(/^\/api\/location-defaults\/([^/]+)$/);
        if (location && req.method === 'PUT') data = platform.updateLocationDefaults(actor, decodeURIComponent(location[1]), key, await readBody(req));
        else if (profile && req.method === 'PUT') data = platform.updateProfile(actor, profile[1], key, await readBody(req));
        else if (hire && !hire[2] && req.method === 'GET') data = platform.get(actor, hire[1]);
        else if (hire?.[2] === 'account' && req.method === 'PUT') data = platform.account(actor, hire[1], key, await readBody(req));
        else if (hire?.[2] === 'provision' && req.method === 'POST') data = platform.provision(actor, hire[1], key, await readBody(req));
        else if (hire?.[2] === 'requests' && req.method === 'POST') {
          // Reserved for Rafay; avoid presenting an incomplete entitlement workflow as working.
          platform.get(actor, hire[1]);
          throw new AppError(501, 'WORKFLOW_PENDING', 'Backend entitlement queue is pending Rafay’s integration. Use the separate local planner meanwhile.');
        }
        else if (action && req.method === 'POST') data = platform.action(actor, action[1], action[2], key, await readBody(req));
        else throw new AppError(404, 'NOT_FOUND', 'API route or method not found.');
      }
      reply(res, 200, { data });
    } catch (error) {
      if (!(error instanceof AppError)) console.error('API operation failed:', error.name);
      reply(res, error.status || 500, { error: { code: error.code || 'INTERNAL_ERROR', message: error.status ? error.message : 'The local operation failed. Check the server diagnostics.' } });
    }
    return true;
  };
}
