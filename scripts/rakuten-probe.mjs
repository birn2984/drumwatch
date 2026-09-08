import { loadLocalEnv } from './load-local-env.mjs';

const RAKUTEN_REFERER = 'https://birn2984.github.io/drumwatch/';
const RAKUTEN_ORIGIN = 'https://birn2984.github.io';
const PROBE_KEYWORD = 'TW-84GS5L';

loadLocalEnv();

function redactSecret(value) {
  let safeValue = String(value ?? '');
  for (const secret of [process.env.RAKUTEN_APPLICATION_ID, process.env.RAKUTEN_ACCESS_KEY]) {
    if (secret) safeValue = safeValue.replaceAll(secret, '[redacted]');
  }
  return safeValue.replaceAll(/(?:applicationId|accessKey)=[^&\s]+/gi, '$1=[redacted]');
}

function printResponseError(status, contentType, body) {
  let json;
  try { json = JSON.parse(body); } catch { json = null; }
  const error = typeof json?.error === 'string' ? redactSecret(json.error) : '';
  const description = typeof json?.error_description === 'string' ? redactSecret(json.error_description) : '';

  console.log(`HTTP status: ${status}`);
  if (error) console.log(`error: ${error}`);
  if (description) console.log(`error_description: ${description}`);
  if (!error && !description) {
    console.log(`body type: ${json ? 'json' : 'non-json'}`);
    console.log(`content-type: ${contentType || 'not provided'}`);
    console.log(`body length: ${Buffer.byteLength(body, 'utf8')}`);
  }
}

console.log('Rakuten probe:');
if (!process.env.RAKUTEN_APPLICATION_ID || !process.env.RAKUTEN_ACCESS_KEY) {
  console.log('credentials: not configured');
  process.exitCode = 0;
} else {
  const url = new URL('https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701');
  url.searchParams.set('applicationId', process.env.RAKUTEN_APPLICATION_ID);
  url.searchParams.set('keyword', PROBE_KEYWORD);
  url.searchParams.set('hits', '1');
  url.searchParams.set('format', 'json');
  url.searchParams.set('formatVersion', '2');

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        accessKey: process.env.RAKUTEN_ACCESS_KEY,
        Referer: RAKUTEN_REFERER,
        Origin: RAKUTEN_ORIGIN,
        'User-Agent': 'DrumWatch/0.1',
      },
    });
    if (response.ok) console.log(`HTTP status: ${response.status}`);
    else printResponseError(response.status, response.headers.get('content-type'), await response.text());
  } catch {
    console.log('HTTP status: unavailable');
  }
}
