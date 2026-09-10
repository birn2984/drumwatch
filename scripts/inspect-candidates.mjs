import { readFile } from 'node:fs/promises';
import { credentialState, inspectProduct } from './price-fetch.mjs';
import { loadLocalEnv } from './load-local-env.mjs';

const SOURCES = ['Yahoo!ショッピング', '楽天市場'];

loadLocalEnv();

const products = JSON.parse(await readFile('data/products.json', 'utf8'));
const history = JSON.parse(await readFile('data/price-history.json', 'utf8'));
const latestPrice = (id) => history.filter((record) => record.productId === id).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0]?.price;
const formatYen = (price) => Number.isFinite(price) ? `¥${price.toLocaleString('ja-JP')}` : '—';
const direction = (value) => value === 'left' ? '左開き' : value === 'right' ? '右開き' : '不明';
const markdown = (value = '') => String(value).replaceAll('|', '｜').replaceAll('\n', ' ');

function lowestAccepted(entries, source) {
  return entries.filter((entry) => entry.source === source && entry.matching === 'accepted').sort((a, b) => a.price - b.price)[0];
}

const credentials = credentialState();
console.log(`Yahoo credentials: ${credentials.yahoo}`);
console.log(`Rakuten credentials: ${credentials.rakuten}`);
console.log('\n| メーカー | 型番 | 開き | 最終採用 | 商品名 | 価格 | 送料 | ショップ | 状態 | URL | 判定 | 要確認 |');
console.log('| --- | --- | --- | --- | --- | ---: | --- | --- | --- | --- | --- | --- |');

const reports = [];
for (const product of products.filter((item) => item.monitorEnabled)) {
  const inspection = await inspectProduct(product, latestPrice(product.id));
  const winner = inspection.winner;
  const bySource = Object.fromEntries(SOURCES.map((source) => [source, lowestAccepted(inspection.entries, source)]));
  const outlierCandidates = inspection.entries.filter((entry) => entry.warning === 'possible_outlier');
  const issues = [];
  if (!winner) issues.push('no_wouldSelect');
  if (winner?.condition !== 'new') issues.push(`condition:${winner.condition}`);
  if (!winner?.shopName) issues.push('shopNameなし');
  if (!winner?.url) issues.push('itemUrlなし');
  if (winner?.shipping === 'unknown') issues.push('shipping_unknown');
  if (outlierCandidates.length) issues.push('possible_outlier_excluded');
  reports.push({ product, inspection, winner, bySource, issues, outlierCandidates });
  const selected = winner ? `${winner.source} (${winner.wouldSelect})` : '—';
  console.log(`| ${product.manufacturer} | ${product.model} | ${direction(product.doorDirection)} | ${selected} | ${markdown(winner?.title)} | ${formatYen(winner?.price)} | ${winner?.shipping ?? '—'} | ${markdown(winner?.shopName)} | ${winner?.condition ?? '—'} | ${winner?.url ?? '—'} | ${winner?.reason ?? '—'} | ${[...issues, winner?.warning].filter(Boolean).join(', ') || 'なし'} |`);
}

console.log('\n| 型番 | Yahoo最安accepted | 楽天最安accepted | 最終採用source | 価格差 |');
console.log('| --- | ---: | ---: | --- | ---: |');
for (const report of reports) {
  const yahoo = report.bySource['Yahoo!ショッピング'];
  const rakuten = report.bySource['楽天市場'];
  const difference = yahoo && rakuten ? Math.abs(yahoo.price - rakuten.price) : null;
  console.log(`| ${report.product.model} | ${formatYen(yahoo?.price)} | ${formatYen(rakuten?.price)} | ${report.winner?.source ?? '—'} | ${formatYen(difference)} |`);
}

const selected = reports.filter((report) => report.winner);
const review = reports.filter((report) => report.issues.length);
const unknownShipping = reports.filter((report) => report.winner?.shipping === 'unknown');
const outliers = reports.filter((report) => report.outlierCandidates.length);
const filtered = reports.flatMap((report) => report.inspection.entries.filter((entry) => entry.matching !== 'accepted').map((entry) => ({ model: report.product.model, source: entry.source, reason: entry.reason })));
console.log('\nFinal inspection summary');
console.log(`監視商品数: ${reports.length}`);
console.log(`wouldSelectあり: ${selected.length}`);
console.log(`問題なし: ${reports.length - review.length}`);
console.log(`要確認: ${review.length}`);
console.log(`shipping unknown: ${unknownShipping.length}`);
console.log(`possible_outlier: ${outliers.length}`);
if (outliers.length) {
  console.log('possible_outlier candidates (selected with warning when otherwise safe):');
  for (const report of outliers) {
    for (const candidate of report.outlierCandidates) {
      const next = report.inspection.entries.filter((entry) => entry.matching === 'accepted').sort((a, b) => a.price - b.price)[0];
      console.log(`- ${report.product.model}: ${candidate.source} ${formatYen(candidate.price)} (${candidate.shipping}) / next safe ${formatYen(next?.price)} / ${candidate.title} / ${candidate.url}`);
    }
  }
}
console.log(`安全に除外された候補: ${filtered.length}${filtered.length ? ` (${filtered.map((entry) => `${entry.model}/${entry.source}/${entry.reason}`).join(', ')})` : ''}`);
console.log('\nDry run complete: price-history.json and display-data.json were not changed.');
