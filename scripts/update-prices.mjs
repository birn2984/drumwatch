import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { inspectProduct } from './price-fetch.mjs';
import { loadLocalEnv } from './load-local-env.mjs';

loadLocalEnv();

const products = JSON.parse(await readFile('data/products.json', 'utf8'));
const history = JSON.parse(await readFile('data/price-history.json', 'utf8'));
let hasNewRecords = false;
const latestPrice = (id) => history.filter((record) => record.productId === id).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0]?.price;

for (const product of products.filter((item) => item.monitorEnabled)) {
  const inspection = await inspectProduct(product, latestPrice(product.id));
  const winner = inspection.winner;
  console.log(`${product.model} | ${inspection.sourceResults.map((result) => `${result.source}: ${result.state}`).join(' | ')} | ${winner ? `adopted ${winner.price} / ${winner.shopName}` : 'adopted none'}`);
  if (winner) {
    const record = { ...winner };
    for (const field of ['title', 'manufacturer', 'model', 'search', 'condition', 'matching', 'reason', 'wouldSelect']) delete record[field];
    history.push({ ...record, productId: product.id, timestamp: new Date().toISOString() });
    hasNewRecords = true;
  }
}
if (hasNewRecords) {
  await writeFile('data/price-history.json', `${JSON.stringify(history, null, 2)}\n`);
  execFileSync(process.execPath, ['scripts/generate-display-data.mjs'], { stdio: 'inherit' });
} else console.log('信頼できる新規価格はありません。既存の価格履歴を保持しました。');
