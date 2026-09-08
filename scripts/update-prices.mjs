import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { classifyListing, suspiciousPrice } from './product-matching.mjs';

const products = JSON.parse(await readFile('data/products.json', 'utf8'));
const history = JSON.parse(await readFile('data/price-history.json', 'utf8'));
const now = new Date().toISOString();
let hasNewRecords = false;

function shippingFromRakuten(flag) { return flag === 0 ? 'included' : flag === 1 ? 'excluded' : 'unknown'; }
function searchTerm(product) { return product.janCode || product.model; }

async function yahoo(product) {
  if (!process.env.YAHOO_APP_ID) return { state: 'not_configured', listings: [] };
  const url = new URL('https://shopping.yahooapis.jp/ShoppingWebService/V3/itemSearch');
  url.searchParams.set('appid', process.env.YAHOO_APP_ID);
  url.searchParams.set('query', searchTerm(product));
  url.searchParams.set('results', '20');
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Yahoo HTTP ${response.status}`);
  const json = await response.json();
  return { state: 'queried', listings: (json.hits ?? []).map((item) => ({ productId: product.id, timestamp: now, source: 'Yahoo!ショッピング', title: item.name ?? '', price: Number(item.price), shopName: item.seller?.name ?? item.name, url: item.url, shipping: item.shipping?.name?.includes('無料') ? 'included' : 'unknown' })) };
}

async function rakuten(product) {
  if (!process.env.RAKUTEN_APPLICATION_ID || !process.env.RAKUTEN_ACCESS_KEY) return { state: 'not_configured', listings: [] };
  const url = new URL('https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701');
  url.searchParams.set('applicationId', process.env.RAKUTEN_APPLICATION_ID);
  url.searchParams.set('keyword', searchTerm(product));
  url.searchParams.set('hits', '30');
  url.searchParams.set('format', 'json');
  const response = await fetch(url, { headers: { Accept: 'application/json', accessKey: process.env.RAKUTEN_ACCESS_KEY } });
  if (!response.ok) throw new Error(`Rakuten HTTP ${response.status}`);
  const json = await response.json();
  return { state: 'queried', listings: (json.Items ?? []).map(({ Item: item }) => ({ productId: product.id, timestamp: now, source: '楽天市場', title: item.itemName ?? '', price: Number(item.itemPrice), shopName: item.shopName, url: item.itemUrl, shipping: shippingFromRakuten(item.postageFlag) })) };
}

function latestPrice(productId) { return history.filter((item) => item.productId === productId).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0]?.price; }

function validateListings(product, result, previousPrice) {
  const accepted = [];
  const reasons = [];
  for (const listing of result.listings) {
    const match = classifyListing({ title: listing.title, model: product.model, price: listing.price });
    if (match.status !== 'accepted') { reasons.push(match.reason); continue; }
    const suspicious = suspiciousPrice(listing.price, previousPrice);
    if (suspicious) { reasons.push(`suspicious:${suspicious}`); continue; }
    const { title: _title, ...safeRecord } = listing;
    accepted.push(safeRecord);
  }
  return { accepted, reasons };
}

function logSource(source, result, validation) {
  if (result.state === 'not_configured') return `${source}: no result (not configured)`;
  if (!result.listings.length) return `${source}: no result`;
  if (validation.accepted.length) return `${source}: accepted ${validation.accepted.length}; rejected ${validation.reasons.length}${validation.reasons.length ? ` (${[...new Set(validation.reasons)].join(', ')})` : ''}`;
  return `${source}: rejected ${validation.reasons.length} (${[...new Set(validation.reasons)].join(', ') || 'no_match'})`;
}

for (const product of products.filter((product) => product.monitorEnabled)) {
  const previousPrice = latestPrice(product.id);
  const [yahooResult, rakutenResult] = await Promise.allSettled([yahoo(product), rakuten(product)]);
  const accepted = [];
  const logLines = [];
  const sourceResults = [{ label: 'Yahoo', settled: yahooResult }, { label: '楽天', settled: rakutenResult }];
  for (const { label, settled } of sourceResults) {
    if (settled.status === 'rejected') { logLines.push(`${label}: no result (request_failed)`); continue; }
    const validation = validateListings(product, settled.value, previousPrice);
    logLines.push(logSource(label, settled.value, validation));
    accepted.push(...validation.accepted);
  }
  const withConfirmedShipping = accepted.filter((item) => item.shipping === 'included');
  const winner = [...(withConfirmedShipping.length ? withConfirmedShipping : accepted)].sort((a, b) => a.price - b.price)[0];
  const adoption = winner ? `adopted ${winner.source} ${winner.price} / ${winner.shopName}` : 'adopted none';
  console.log(`${product.model} | ${logLines.join(' | ')} | ${adoption}`);
  if (winner) { history.push(winner); hasNewRecords = true; }
}

if (hasNewRecords) {
  await writeFile('data/price-history.json', `${JSON.stringify(history, null, 2)}\n`);
  execFileSync(process.execPath, ['scripts/generate-display-data.mjs'], { stdio: 'inherit' });
} else {
  console.log('信頼できる新規価格はありません。既存の価格履歴を保持しました。');
}
