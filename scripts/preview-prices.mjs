import { readFile } from 'node:fs/promises';
import { credentialState, inspectProduct } from './price-fetch.mjs';
import { loadLocalEnv } from './load-local-env.mjs';

loadLocalEnv();
const products = JSON.parse(await readFile('data/products.json', 'utf8'));
const history = JSON.parse(await readFile('data/price-history.json', 'utf8'));
const latestPrice = (id) => history.filter((record) => record.productId === id).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0]?.price;
const credentials = credentialState();
console.log(`Yahoo credentials: ${credentials.yahoo} - ${credentials.yahoo === 'configured' ? 'ready' : 'skipped'}`);
console.log(`Rakuten credentials: ${credentials.rakuten} - ${credentials.rakuten === 'configured' ? 'ready' : 'skipped'}`);
const summary = { 'Yahoo!ショッピング': { accepted: 0, rejected: 0, suspicious: 0, no_match: 0 }, '楽天市場': { accepted: 0, rejected: 0, suspicious: 0, no_match: 0 } };
const noAccepted = [];
const suspiciousProducts = [];

for (const product of products.filter((item) => item.monitorEnabled)) {
  const inspection = await inspectProduct(product, latestPrice(product.id));
  console.log(`\n${product.manufacturer} | ${product.model}`);
  for (const result of inspection.sourceResults) {
    console.log(`  ${result.source} | search: ${result.search} | ${result.state}${result.error ? ` | ${result.error}` : ''}`);
  }
  if (!inspection.entries.length) { console.log('  no results'); continue; }
  for (const entry of inspection.entries) {
    summary[entry.source][entry.matching] += 1;
    console.log(`  ${entry.source} | title: ${entry.title} | price: ${entry.price} | shipping: ${entry.shipping} | shop: ${entry.shopName} | url: ${entry.url} | condition: ${entry.condition} | matching: ${entry.matching} | reason: ${entry.reason} | warning: ${entry.warning ?? 'none'} | wouldSelect: ${entry.wouldSelect}`);
  }
  if (inspection.sourceResults.some((result) => result.state === 'queried') && !inspection.winner) noAccepted.push(product.model);
  if (inspection.entries.some((entry) => entry.matching === 'suspicious')) suspiciousProducts.push(product.model);
}
console.log('\nPreview summary');
for (const [source, totals] of Object.entries(summary)) console.log(`${source}: accepted: ${totals.accepted} | no_match: ${totals.no_match} | rejected: ${totals.rejected} | suspicious: ${totals.suspicious}`);
console.log(`Products with no accepted result: ${noAccepted.length ? noAccepted.join(', ') : 'none'}`);
console.log(`Products with suspicious result: ${suspiciousProducts.length ? suspiciousProducts.join(', ') : 'none'}`);
console.log('\nDry run complete: price-history.json and display-data.json were not changed.');
