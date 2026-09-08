import { classifyListing, conditionFromTitle, suspiciousPrice } from './product-matching.mjs';

export const REQUEST_INTERVAL_MS = 1100;
export const PREVIEW_LIMIT = 5;
export const RAKUTEN_REFERER = 'https://birn2984.github.io/drumwatch/';
export const RAKUTEN_ORIGIN = 'https://birn2984.github.io';
export const RAKUTEN_USER_AGENT = 'DrumWatch/0.1';
let lastRequestAt = 0;

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const searchTerm = (product) => product.janCode || product.model;
const shippingFromRakuten = (flag) => flag === 0 ? 'included' : flag === 1 ? 'excluded' : 'unknown';
const rakutenItems = (json) => Array.isArray(json?.items) ? json.items : Array.isArray(json?.Items) ? json.Items : [];

class SafeRequestError extends Error {
  constructor(message) {
    super(message);
    this.publicMessage = message;
  }
}

function redactSecret(value, environment) {
  let safeValue = String(value ?? '');
  for (const secret of [environment.RAKUTEN_APPLICATION_ID, environment.RAKUTEN_ACCESS_KEY]) {
    if (secret) safeValue = safeValue.replaceAll(secret, '[redacted]');
  }
  return safeValue.replaceAll(/(?:applicationId|accessKey)=[^&\s]+/gi, '$1=[redacted]');
}

async function rakutenError(response, environment) {
  let body = {};
  try {
    const text = await response.text();
    body = JSON.parse(text);
  } catch { /* Keep the safe HTTP status when the body is not a Rakuten JSON error. */ }
  const error = typeof body?.error === 'string' ? redactSecret(body.error, environment) : '';
  const description = typeof body?.error_description === 'string' ? redactSecret(body.error_description, environment) : '';
  return error || description
    ? [`Rakuten HTTP ${response.status}`, error, description].filter(Boolean).join(' | ')
    : `Rakuten HTTP ${response.status} | no_api_error_body`;
}

async function waitForRequestSlot() {
  const waitMs = Math.max(0, REQUEST_INTERVAL_MS - (Date.now() - lastRequestAt));
  if (waitMs) await sleep(waitMs);
  lastRequestAt = Date.now();
}

export function credentialState(environment = process.env) {
  return {
    yahoo: environment.YAHOO_APP_ID ? 'configured' : 'not configured',
    rakuten: environment.RAKUTEN_APPLICATION_ID && environment.RAKUTEN_ACCESS_KEY ? 'configured' : 'not configured',
  };
}

async function yahoo(product, environment, fetchImpl) {
  if (!environment.YAHOO_APP_ID) return { source: 'Yahoo!ショッピング', search: searchTerm(product), state: 'not configured', listings: [] };
  const url = new URL('https://shopping.yahooapis.jp/ShoppingWebService/V3/itemSearch');
  url.searchParams.set('appid', environment.YAHOO_APP_ID);
  url.searchParams.set('query', searchTerm(product));
  url.searchParams.set('results', String(PREVIEW_LIMIT));
  await waitForRequestSlot();
  const response = await fetchImpl(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Yahoo HTTP ${response.status}`);
  const json = await response.json();
  return { source: 'Yahoo!ショッピング', search: searchTerm(product), state: 'queried', listings: (json.hits ?? []).slice(0, PREVIEW_LIMIT).map((item) => ({ title: item.name ?? '', price: Number(item.price), shopName: item.seller?.name ?? item.name ?? '', url: item.url ?? '', shipping: item.shipping?.name?.includes('無料') ? 'included' : 'unknown' })) };
}

async function rakuten(product, environment, fetchImpl) {
  if (!environment.RAKUTEN_APPLICATION_ID || !environment.RAKUTEN_ACCESS_KEY) return { source: '楽天市場', search: searchTerm(product), state: 'not configured', listings: [] };
  const url = new URL('https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701');
  url.searchParams.set('applicationId', environment.RAKUTEN_APPLICATION_ID);
  url.searchParams.set('keyword', searchTerm(product));
  url.searchParams.set('hits', String(PREVIEW_LIMIT));
  url.searchParams.set('format', 'json');
  url.searchParams.set('formatVersion', '2');
  await waitForRequestSlot();
  const response = await fetchImpl(url, { headers: { Accept: 'application/json', accessKey: environment.RAKUTEN_ACCESS_KEY, Referer: RAKUTEN_REFERER, Origin: RAKUTEN_ORIGIN, 'User-Agent': RAKUTEN_USER_AGENT } });
  if (!response.ok) throw new SafeRequestError(await rakutenError(response, environment));
  const json = await response.json();
  return { source: '楽天市場', search: searchTerm(product), state: 'queried', listings: rakutenItems(json).slice(0, PREVIEW_LIMIT).map((item) => ({ title: item.itemName ?? '', price: Number(item.itemPrice), shopName: item.shopName ?? '', url: item.itemUrl ?? '', shipping: shippingFromRakuten(Number(item.postageFlag)) })) };
}

export function evaluateListings(product, sourceResult, previousPrice) {
  const entries = sourceResult.listings.map((listing) => {
    const condition = conditionFromTitle(listing.title);
    if (condition !== 'new') return { ...listing, manufacturer: product.manufacturer, model: product.model, source: sourceResult.source, search: sourceResult.search, condition, matching: 'rejected', reason: `non_new_condition:${condition}`, wouldSelect: false };
    const match = classifyListing({ title: listing.title, model: product.model, price: listing.price });
    if (match.status !== 'accepted') return { ...listing, manufacturer: product.manufacturer, model: product.model, source: sourceResult.source, search: sourceResult.search, condition, matching: match.reason === 'no_match' ? 'no_match' : 'rejected', reason: match.reason, wouldSelect: false };
    const suspicious = suspiciousPrice(listing.price, previousPrice);
    if (suspicious) return { ...listing, manufacturer: product.manufacturer, model: product.model, source: sourceResult.source, search: sourceResult.search, condition, matching: 'suspicious', reason: suspicious, wouldSelect: false };
    return { ...listing, manufacturer: product.manufacturer, model: product.model, source: sourceResult.source, search: sourceResult.search, condition, matching: 'accepted', reason: 'model_match', wouldSelect: false };
  });
  return entries;
}

export function selectWinner(entries) {
  const accepted = entries.filter((entry) => entry.matching === 'accepted');
  const shippingIncluded = accepted.filter((entry) => entry.shipping === 'included');
  const winner = [...(shippingIncluded.length ? shippingIncluded : accepted)].sort((a, b) => a.price - b.price)[0];
  if (winner) winner.wouldSelect = true;
  return winner;
}

export async function inspectProduct(product, previousPrice, { environment = process.env, fetchImpl = fetch } = {}) {
  const sourceResults = [];
  for (const query of [yahoo, rakuten]) {
    try { sourceResults.push(await query(product, environment, fetchImpl)); }
    catch (error) {
      const safeError = error instanceof SafeRequestError ? error.publicMessage : 'request failed';
      sourceResults.push({ source: query === yahoo ? 'Yahoo!ショッピング' : '楽天市場', search: searchTerm(product), state: 'request failed', error: safeError, listings: [] });
    }
  }
  const entries = sourceResults.flatMap((result) => evaluateListings(product, result, previousPrice));
  const winner = selectWinner(entries);
  return { product, sourceResults, entries, winner };
}
