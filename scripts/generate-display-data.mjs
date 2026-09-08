import { readFile, writeFile } from 'node:fs/promises';

const products = JSON.parse(await readFile('data/products.json', 'utf8'));
const history = JSON.parse(await readFile('data/price-history.json', 'utf8'));
const output = products.map((product) => {
  const records = history.filter((item) => item.productId === product.id).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  return { ...product, current: records.at(-1) ?? null, history: records };
});
await writeFile('data/display-data.json', `${JSON.stringify({ generatedAt: new Date().toISOString(), products: output }, null, 2)}\n`);
