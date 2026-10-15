import {McpServer} from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import {BackendError,createApiClient} from './api-client.mjs';

const text=z.string().trim().min(1).max(300);
const identifier=text.regex(/^[A-Za-z0-9_-]+$/,'Use an ID returned by the onboarding API.');
const idempotencyKey=z.string().min(1).max(200).regex(/^[\x21-\x7e]+$/,'Use a stable key without spaces or control characters.');
const hireInput={hireId:identifier};
const tools=[
  {name:'get_my_onboarding',title:'Inspect my onboarding',readOnly:true,
    description:'Get the configured new-hire actor’s own onboarding plan, account details and current blockers without supplying an internal hire ID. Hire actors only; managers/network operators use get_onboarding_status for a visible hire. No real access is verified.',
    schema:z.strictObject({}),path:()=>'/api/me/onboarding'},
  {name:'get_profile_requirements',title:'Explain assigned profile requirements',readOnly:true,
    description:'Read an onboarding plan’s assigned group/admin snapshot alongside its mapped team recipe, setup dependencies, required request fields, sources, draft status and open questions. Omit hireId for the configured new-hire actor’s own plan; managers/network operators must supply a visible hireId. Recipe candidates are not automatically required or approved entitlements. Unmapped profiles do not inherit another team’s recipe.',
    schema:z.strictObject({hireId:identifier.optional()}),
    path:args=>args.hireId?`/api/hires/${encodeURIComponent(args.hireId)}/requirements`:'/api/me/onboarding/requirements'},
  {name:'list_profiles',title:'List onboarding profiles',readOnly:true,
    description:'List the shared SQLite onboarding profiles as the configured demo EM. Use these IDs when creating hires; the static CMS planner catalogue is separate.',
    schema:z.strictObject({}),path:()=>'/api/profiles'},
  {name:'list_hires',title:'List hires',readOnly:true,
    description:'List hires visible to the configured demo actor. Follow nextOffset for more pages; the backend enforces EM, location or self scope.',
    schema:z.strictObject({offset:z.number().int().nonnegative().optional()}),path:args=>`/api/hires?offset=${args.offset??0}`},
  {name:'create_hire',title:'Create onboarding plan',method:'POST',
    description:'Create a fictional local-demo hire as the configured EM. Uses saved profile defaults unless overridden; network location defaults are always added. Supply an explicit idempotencyKey and reuse it after an uncertain response. No real accounts or access are created.',
    schema:z.strictObject({firstName:text,lastName:text,startDate:z.iso.date(),location:text,profileId:identifier,
      email:z.union([z.literal(''),z.email()]).optional(),requestedGroups:z.array(text).min(1).max(60).optional(),
      adminRequired:z.boolean().optional(),idempotencyKey}),path:()=>'/api/hires'},
  {name:'get_onboarding_status',title:'Inspect onboarding status',readOnly:true,
    description:'Retrieve current account details, requests, assignments, events and blockers from the backend for a visible hire. Blockers describe the local simulation, not actual workstation readiness.',
    schema:z.strictObject(hireInput),path:args=>`/api/hires/${encodeURIComponent(args.hireId)}`},
  {name:'record_account_details',title:'Record account and device details',method:'PUT',
    description:'Record AD ID, work email and laptop ID as the configured assigned-network actor. Completes the simulated account request; does not create or verify a real AD account. Reuse the explicit idempotencyKey on retries.',
    schema:z.strictObject({...hireInput,adId:text,workEmail:z.email(),laptopId:text,idempotencyKey}),
    path:args=>`/api/hires/${encodeURIComponent(args.hireId)}/account`},
  {name:'provision_access',title:'Queue demo access provisioning',method:'POST',
    description:'Queue simulated group assignments and conditional admin requests as the assigned-network actor after account details are recorded. Does not grant real access or complete assignments. Reuse the explicit idempotencyKey on retries; advance demo provider outcomes in the dashboard.',
    schema:z.strictObject({...hireInput,idempotencyKey}),path:args=>`/api/hires/${encodeURIComponent(args.hireId)}/provision`}
];

export function createOnboardingMcpServer(options) {
  const api=createApiClient(options);
  const server=new McpServer({name:'onboarding-assistant',version:'0.1.0'},{instructions:
    'Local onboarding demo using a configured actor and the same HTTP backend as the dashboard. External provisioning is simulated. Never infer real access or workstation readiness from demo results. Reuse mutation idempotency keys after uncertain responses; call get_onboarding_status for fresh progress. Actors cannot be changed through tools.'});
  for(const tool of tools) {
    server.registerTool(tool.name,{title:tool.title,description:tool.description,inputSchema:tool.schema,
      annotations:{readOnlyHint:!!tool.readOnly,destructiveHint:false,idempotentHint:true,openWorldHint:false}},async(args,context)=>{
      const {hireId,idempotencyKey,...body}=args;
      const mutation=!!tool.method;
      try {
        const data=await api.request(tool.path(args),{method:tool.method,body:mutation?body:undefined,idempotencyKey,signal:context.signal});
        const result={data,context:{actorId:api.actorId,mode:'local-demo',externalProvisioning:'simulated',realReadiness:'Not assessed by MCP'},
          ...(mutation?{idempotencyKey,note:'This may be an idempotent replay of the saved response. Use get_onboarding_status for current progress.'}:{})};
        return {content:[{type:'text',text:JSON.stringify(result)}],structuredContent:result};
      } catch(error) {
        const known=error instanceof BackendError;
        const failure={error:{code:known?error.code:'ADAPTER_ERROR',message:known?error.message:'The MCP adapter could not complete this operation.',
          ...(known&&error.status?{status:error.status}:{}),
          ...(mutation?{idempotencyKey,outcomeUnknown:known?error.outcomeUnknown:true,
            retryGuidance:known&&!error.outcomeUnknown
              ?'The backend rejected the command. Inspect the error before retrying; do not reuse a key already bound to a different payload.'
              :'Outcome may be unknown. Reuse this idempotencyKey and unchanged arguments; then retrieve current status. Do not generate a new key for the same intent.'}:{})}};
        return {isError:true,content:[{type:'text',text:JSON.stringify(failure)}],structuredContent:failure};
      }
    });
  }
  return server;
}
