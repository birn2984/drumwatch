import { loadLocalEnv } from './load-local-env.mjs';
import { classifyListing, conditionFromTitle } from './product-matching.mjs';

const RAKUTEN_REFERER = 'https://birn2984.github.io/drumwatch/';
const RAKUTEN_ORIGIN = 'https://birn2984.github.io';
const PROBE_MODEL = 'TW-84GS5L';
const PROBE_HITS = 1;

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

async function request({ keyword, field }) {
  const url = new URL('https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701');
  url.searchParams.set('applicationId', process.env.RAKUTEN_APPLICATION_ID);
  url.searchParams.set('keyword', keyword);
  url.searchParams.set('hits', String(PROBE_HITS));
  url.searchParams.set('format', 'json');
  url.searchParams.set('formatVersion', '2');
  if (field !== undefined) url.searchParams.set('field', String(field));
  const response = await fetch(url, {
    headers: { Accept: 'application/json', accessKey: process.env.RAKUTEN_ACCESS_KEY, Referer: RAKUTEN_REFERER, Origin: RAKUTEN_ORIGIN, 'User-Agent': 'DrumWatch/0.1' },
  });
  const body = await response.text();
  if (!response.ok) return { response, body, json: null };
  try { return { response, body, json: JSON.parse(body) }; } catch { return { response, body, json: null }; }
}

function itemsFrom(json) {
  return Array.isArray(json?.items) ? json.items : Array.isArray(json?.Items) ? json.Items : [];
}

function printComparison(label, result) {
  const items = itemsFrom(result.json);
  console.log(`${label}: HTTP ${result.response.status} | count: ${result.json?.count ?? 'unavailable'} | items.length: ${items.length}`);
}

function printDiagnostics(json) {
  const lowercaseItems = Array.isArray(json?.items) ? json.items : [];
  const rawItems = itemsFrom(json);
  const parsed = rawItems.map((item) => ({ title: item.itemName ?? '', price: Number(item.itemPrice), shopName: item.shopName ?? '', url: item.itemUrl ?? '', postageFlag: item.postageFlag }));
  const matched = parsed.map((candidate) => {
    const condition = conditionFromTitle(candidate.title);
    const result = condition === 'new' ? classifyListing({ title: candidate.title, model: PROBE_MODEL, price: candidate.price }) : { status: 'rejected', reason: `non_new_condition:${condition}` };
    return { ...candidate, condition, ...result };
  });
  const accepted = matched.filter((candidate) => candidate.status === 'accepted');
  console.log(`json.count: ${json?.count ?? 'unavailable'}`);
  console.log(`json.hits: ${json?.hits ?? 'unavailable'}`);
  console.log(`Array.isArray(json.items): ${Array.isArray(json?.items)}`);
  console.log(`response keys: ${Object.keys(json ?? {}).join(', ')}`);
  console.log(`Array.isArray(json.Items): ${Array.isArray(json?.Items)}`);
  if (Array.isArray(json?.Items) && json.Items[0]) console.log(`first Items entry keys: ${Object.keys(json.Items[0]).join(', ')}`);
  console.log(`json.items.length: ${lowercaseItems.length}`);
  for (const [index, item] of rawItems.slice(0, 5).entries()) console.log(`item ${index + 1}: itemName: ${item.itemName ?? ''} | itemPrice: ${item.itemPrice ?? ''} | shopName: ${item.shopName ?? ''}`);
  console.log(`raw count: ${json?.count ?? 'unavailable'}`);
  console.log(`raw items: ${rawItems.length}`);
  console.log(`parsed: ${parsed.length}`);
  console.log(`accepted: ${accepted.length}`);
  console.log(`rejected: ${matched.length - accepted.length}`);
  console.log(`wouldSelect: ${accepted.length ? 1 : 0}`);
}

console.log('Rakuten probe:');
if (!process.env.RAKUTEN_APPLICATION_ID || !process.env.RAKUTEN_ACCESS_KEY) {
  console.log('credentials: not configured');
} else {
  console.log(`keyword: ${PROBE_MODEL}`);
  console.log('field: 1 (default; omitted from the request)');
  console.log(`hits: ${PROBE_HITS}`);
  console.log('formatVersion: 2');
  try {
    const initial = await request({ keyword: PROBE_MODEL });
    if (!initial.response.ok) printResponseError(initial.response.status, initial.response.headers.get('content-type'), initial.body);
    else {
      printDiagnostics(initial.json);
      if ((initial.json?.count ?? 0) === 0) {
        console.log('Fallback comparisons (API raw count was 0):');
        for (const [label, parameters] of [
          ['keyword=TW-84GS5L field=1', { keyword: PROBE_MODEL, field: 1 }],
          ['keyword=TW-84GS5L field=0', { keyword: PROBE_MODEL, field: 0 }],
          ['keyword=TW84GS5L field=0', { keyword: 'TW84GS5L', field: 0 }],
        ]) printComparison(label, await request(parameters));
      }
    }
  } catch {
    console.log('HTTP status: unavailable');
  }
}
