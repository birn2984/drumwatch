import { PRICE_API_ENV_NAMES } from './load-local-env.mjs';

export function credentialPreflight(environment = process.env, log = console.log) {
  log('Credential preflight:');
  const missing = PRICE_API_ENV_NAMES.filter((name) => !environment[name]?.trim());
  for (const name of PRICE_API_ENV_NAMES) log(`${name}: ${missing.includes(name) ? 'not configured' : 'configured'}`);
  if (environment.GITHUB_ACTIONS === 'true' && missing.length) {
    throw new Error(`Credential preflight failed: Secrets missing; ${missing.map((name) => `${name} is not configured`).join('; ')}`);
  }
}

export function verifyFetchSummary(summary, environment = process.env) {
  if (environment.GITHUB_ACTIONS !== 'true' || summary.monitoredProducts === 0) return;
  const failedSources = Object.entries(summary.sources).filter(([, stats]) => stats.queried === 0).map(([source]) => source);
  if (failedSources.length) throw new Error(`Price fetch failed: no successful API responses from ${failedSources.join(', ')}. Existing history preserved.`);
}
