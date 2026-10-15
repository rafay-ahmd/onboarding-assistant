import {serveStdio} from '@modelcontextprotocol/server/stdio';
import {configFromEnv} from './config.mjs';
import {createOnboardingMcpServer} from './server.mjs';

try {
  const config=configFromEnv();
  const handle=serveStdio(()=>createOnboardingMcpServer(config),{
    onerror:()=>console.error('Onboarding MCP protocol error. Check the client connection.')
  });
  const shutdown=()=>handle.close().catch(()=>{process.exitCode=1;});
  process.once('SIGINT',shutdown);
  process.once('SIGTERM',shutdown);
} catch(error) {
  console.error(`Onboarding MCP could not start: ${error.message}`);
  process.exitCode=1;
}
