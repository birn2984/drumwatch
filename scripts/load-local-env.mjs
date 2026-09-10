import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

export const PRICE_API_ENV_NAMES = ['YAHOO_APP_ID', 'RAKUTEN_APPLICATION_ID', 'RAKUTEN_ACCESS_KEY'];

/**
 * Fills missing local credentials from .env.local without replacing values
 * supplied by the shell or GitHub Actions Secrets.
 */
export function loadLocalEnv(filePath = '.env.local', environment = process.env) {
  if (!existsSync(filePath)) return false;

  const values = parseEnv(readFileSync(filePath, 'utf8'));
  for (const name of PRICE_API_ENV_NAMES) {
    if (!environment[name] && values[name]) environment[name] = values[name];
  }
  return true;
}
