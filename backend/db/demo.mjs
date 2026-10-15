import { fileURLToPath } from 'node:url';
import { openStore } from './store.mjs';
import { seedDemo } from '../services/platform.mjs';

const path = fileURLToPath(new URL('../../data/onboarding.sqlite', import.meta.url));
const store = openStore(path);
try {
  if (process.argv.includes('--reset')) {
    if (!process.argv.includes('--confirm-demo-reset')) throw Error('Stop the server, then add --confirm-demo-reset to clear this app’s local demo records.');
    // Remove only known app tables, transactionally; no recursive filesystem deletion.
    store.resetDemo();
  }
  seedDemo(store);
  console.log('Fictional demo data ready.');
} finally { store.close(); }
