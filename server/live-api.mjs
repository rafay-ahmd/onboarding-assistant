import {randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createSlackClient,createSlackService,createStore} from './slack-service.mjs';

export async function createLiveApi(root){
  const csrf=randomBytes(24).toString('hex');
  const profile=JSON.parse(await readFile(new URL('profiles/dealertrack-developer.json',root),'utf8'));
  const configured=Boolean(process.env.SLACK_USER_TOKEN);
  const service=createSlackService({call:createSlackClient({userToken:process.env.SLACK_USER_TOKEN,botToken:process.env.SLACK_BOT_TOKEN}),store:createStore(path.join(process.env.ONBOARDING_DATA_DIR||path.join(os.homedir(),'.onboarding-assistant'),'slack-requests.json')),profile,channelId:process.env.SLACK_CHANNEL_ID||'C0111SZ86CE',expectedTeamId:process.env.SLACK_TEAM_ID||'TT299RP8X',expectedUserId:process.env.SLACK_USER_ID,actorEmail:process.env.SLACK_ACTOR_EMAIL||''});
  function json(res,status,value){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));}
  async function body(req){let data='';for await(const chunk of req){data+=chunk;if(data.length>50000)throw Error('body_too_large');}try{return JSON.parse(data||'{}');}catch{throw Error('invalid_json');}}
  return async function handle(req,res,url){
    if(!url.pathname.startsWith('/api/slack/'))return false;
    const port=String(req.socket.localPort);
    const origins=[`http://127.0.0.1:${port}`,`http://localhost:${port}`];
    if(!origins.map(x=>new URL(x).host).includes(req.headers.host)|| (req.headers.origin&&!origins.includes(req.headers.origin))){json(res,403,{error:'local_origin_required'});return true;}
    try{
      if(req.method==='GET'&&url.pathname==='/api/slack/status'){
        if(!configured){json(res,200,{connected:false,error:'Start the server with Slack credentials. Use scripts/Start-WithSlack.ps1.',csrf});return true;}
        try{json(res,200,{...await service.connection(),csrf});}catch(e){json(res,200,{connected:false,error:e.code||'connection_failed',csrf});}return true;
      }
      if(!configured){json(res,503,{error:'slack_not_configured'});return true;}
      if(req.method==='GET'&&url.pathname==='/api/slack/requests'){json(res,200,{requests:await service.list()});return true;}
      if(req.method!=='POST'){json(res,405,{error:'method_not_allowed'});return true;}
      if(req.headers['x-onboarding-csrf']!==csrf||!String(req.headers['content-type']||'').startsWith('application/json')){json(res,403,{error:'same_origin_confirmation_required'});return true;}
      const input=await body(req);
      if(url.pathname==='/api/slack/requests'){json(res,200,await service.prepare(input));return true;}
      const match=url.pathname.match(/^\/api\/slack\/requests\/([a-f0-9-]{36})\/(send|sync|reply|verify|edit)$/);
      if(!match){json(res,404,{error:'unknown_request_action'});return true;}
      const [,id,action]=match;
      const request=action==='edit'?await service.edit(id,input.text):action==='send'?await service.send(id,input.confirmed,input.text):action==='sync'?await service.sync(id):action==='reply'?await service.reply(id,input.text,input.confirmed):await service.verify(id,input.confirmed);
      json(res,200,{request});
    }catch(e){json(res,400,{error:e.code||(['invalid_json','body_too_large'].includes(e.message)?e.message:'operation_failed')});}
    return true;
  };
}
