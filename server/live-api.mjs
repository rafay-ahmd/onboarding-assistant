import {createSqliteSlackStore} from '../backend/services/slack-request-store.mjs';
import {randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createSlackClient,createSlackService,createStore} from './slack-service.mjs';

export async function createLiveApi(root,{platform,store,slackCall}={}){
  const csrf=randomBytes(24).toString('hex');
  const profile=JSON.parse(await readFile(new URL('profiles/dealertrack-developer.json',root),'utf8'));
  const configured=Boolean(slackCall||process.env.SLACK_USER_TOKEN);
  const call=slackCall||createSlackClient({userToken:process.env.SLACK_USER_TOKEN,botToken:process.env.SLACK_BOT_TOKEN});
  const scopedServices=new Map();
  const legacyService=createSlackService({call,store:createStore(path.join(process.env.ONBOARDING_DATA_DIR||path.join(os.homedir(),'.onboarding-assistant'),'slack-requests.json')),profile,channelId:process.env.SLACK_CHANNEL_ID||'C0111SZ86CE',expectedTeamId:process.env.SLACK_TEAM_ID||'TT299RP8X',expectedUserId:process.env.SLACK_USER_ID,actorEmail:process.env.SLACK_ACTOR_EMAIL||''});
  function json(res,status,value){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));}
  async function body(req){let data='';for await(const chunk of req){data+=chunk;if(data.length>50000)throw Error('body_too_large');}try{return JSON.parse(data||'{}');}catch{throw Error('invalid_json');}}
  return async function handle(req,res,url){
    const scoped=url.pathname.match(/^\/api\/hires\/([^/]+)\/slack\/(.*)$/);
    if(!scoped&&!url.pathname.startsWith('/api/slack/'))return false;
    const port=String(req.socket.localPort);
    const origins=[`http://127.0.0.1:${port}`,`http://localhost:${port}`];
    if(!origins.map(x=>new URL(x).host).includes(req.headers.host)|| (req.headers.origin&&!origins.includes(req.headers.origin))){json(res,403,{error:'local_origin_required'});return true;}
    try{
      let service=legacyService,endpoint=url.pathname,hire=null,acting=null;
      if(scoped){
        if(!platform||!store)throw Error('hire_context_unavailable');
        hire=platform.get(req.headers['x-demo-actor-id'],scoped[1]);
        acting=store.get('actors',req.headers['x-demo-actor-id']);
        endpoint='/api/slack/'+scoped[2];
        if(hire.profileId!==profile.id){json(res,req.method==='GET'&&scoped[2]==='status'?200:403,{connected:false,error:'Live Slack is available only for the Dealertrack template. This profile requires its own integration.',csrf});return true;}
        const binding=hire.slackIdentity;
        const self=acting.role==='hire'&&acting.hireId===hire.id;
        const bindingError=!binding?'This hire has no connected Slack account. Select Rafay Ahmed for the live demo.':!self?'Open this workflow as the hire to use their Slack connection.':null;
        if(bindingError){json(res,req.method==='GET'&&scoped[2]==='status'?200:403,{connected:false,error:bindingError,csrf,hireId:hire.id,hireName:hire.name});return true;}
        if(!scopedServices.has(hire.id))scopedServices.set(hire.id,createSlackService({call,store:createSqliteSlackStore(store,hire.id),profile,scopeId:hire.id,channelId:process.env.SLACK_CHANNEL_ID||'C0111SZ86CE',expectedTeamId:binding.teamId,expectedUserId:binding.userId,actorEmail:hire.email||''}));
        service=scopedServices.get(hire.id);
      }
      if(req.method==='GET'&&endpoint==='/api/slack/status'){
        if(!configured){json(res,200,{connected:false,error:'Start the server with Slack credentials. Use scripts/Start-WithSlack.ps1.',csrf});return true;}
        try{json(res,200,{...await service.connection(),csrf,...(hire?{hireId:hire.id,hireName:hire.name}:{})});}catch(e){json(res,200,{connected:false,error:e.code||'connection_failed',csrf});}return true;
      }
      if(!configured){json(res,503,{error:'slack_not_configured'});return true;}
      if(req.method==='GET'&&endpoint==='/api/slack/requests'){json(res,200,{requests:await service.list()});return true;}
      if(req.method!=='POST'){json(res,405,{error:'method_not_allowed'});return true;}
      if(req.headers['x-onboarding-csrf']!==csrf||!String(req.headers['content-type']||'').startsWith('application/json')){json(res,403,{error:'same_origin_confirmation_required'});return true;}
      const input=await body(req);
      if(endpoint==='/api/slack/requests'){json(res,200,await service.prepare(input));return true;}
      const match=endpoint.match(/^\/api\/slack\/requests\/([a-f0-9-]{36})\/(send|sync|reply|verify|edit)$/);
      if(!match){json(res,404,{error:'unknown_request_action'});return true;}
      const [,id,action]=match;
      const request=action==='edit'?await service.edit(id,input.text):action==='send'?await service.send(id,input.confirmed,input.text):action==='sync'?await service.sync(id):action==='reply'?await service.reply(id,input.text,input.confirmed):await service.verify(id,input.confirmed);
      json(res,200,{request});
    }catch(e){json(res,e.status||400,{error:e.message?.startsWith('This hire')?e.message:e.code||(['invalid_json','body_too_large'].includes(e.message)?e.message:'operation_failed')});}
    return true;
  };
}
