import { credentialState } from './price-fetch.mjs';
import { loadLocalEnv } from './load-local-env.mjs';

// Uses the same loader as prices:update, but never fetches or writes data.
loadLocalEnv();

const credentials = credentialState();
console.log(`Yahoo credentials: ${credentials.yahoo}`);
console.log(`Rakuten credentials: ${credentials.rakuten}`);
