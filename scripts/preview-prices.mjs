import { readFile } from 'node:fs/promises';
import { credentialState, inspectProduct } from './price-fetch.mjs';

const products = JSON.parse(await readFile('data/products.json', 'utf8'));
const history = JSON.parse(await readFile('data/price-history.json', 'utf8'));
const latestPrice = (id) => history.filter((record) => record.productId === id).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0]?.price;
const credentials = credentialState();
console.log(`Yahoo credentials: ${credentials.yahoo} - ${credentials.yahoo === 'configured' ? 'ready' : 'skipped'}`);
console.log(`Rakuten credentials: ${credentials.rakuten} - ${credentials.rakuten === 'configured' ? 'ready' : 'skipped'}`);

for (const product of products.filter((item) => item.monitorEnabled)) {
  const inspection = await inspectProduct(product, latestPrice(product.id));
  console.log(`\n${product.manufacturer} | ${product.model}`);
  for (const result of inspection.sourceResults) {
    console.log(`  ${result.source} | search: ${result.search} | ${result.state}${result.error ? ` | ${result.error}` : ''}`);
  }
  if (!inspection.entries.length) { console.log('  no results'); continue; }
  for (const entry of inspection.entries) {
    console.log(`  ${entry.source} | title: ${entry.title} | price: ${entry.price} | shipping: ${entry.shipping} | shop: ${entry.shopName} | url: ${entry.url} | condition: ${entry.condition} | matching: ${entry.matching} | reason: ${entry.reason} | wouldSelect: ${entry.wouldSelect}`);
  }
}
console.log('\nDry run complete: price-history.json and display-data.json were not changed.');
