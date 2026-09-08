import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { classifyListing, conditionFromTitle, suspiciousPrice, titleHasModel } from '../scripts/product-matching.mjs';
import { credentialState, inspectProduct } from '../scripts/price-fetch.mjs';

test('型番完全一致は採用する', () => assert.equal(classifyListing({ title: 'パナソニック NA-LX129DL ドラム式洗濯乾燥機', model: 'NA-LX129DL', price: 200000 }).status, 'accepted'));
test('ハイフンとスペースの表記揺れは同一型番と扱う', () => assert.equal(titleHasModel('NA LX129DL 本体', 'NA-LX129DL'), true));
test('末尾型番違いは採用しない', () => assert.equal(classifyListing({ title: 'NA-LX129DR ドラム式洗濯機', model: 'NA-LX129DL', price: 200000 }).reason, 'no_match'));
test('型番一致でも関連部品だけは除外する', () => assert.equal(classifyListing({ title: 'NA-LX129DL 用 糸くずフィルター', model: 'NA-LX129DL', price: 1200 }).reason, 'related_accessory'));
test('前回から50%超の価格変動はsuspiciousにする', () => assert.equal(suspiciousPrice(310000, 200000), 'price_change_55pct'));
test('中古表記は通常新品候補にしない', () => assert.equal(conditionFromTitle('中古 NA-LX127EL ドラム式洗濯乾燥機'), 'used'));
test('認証なしプレビューは履歴を書き換えず、秘密値を返さない', async () => {
  const before = await readFile('data/price-history.json', 'utf8');
  const credentials = credentialState({ YAHOO_APP_ID: 'secret-value' });
  const result = await inspectProduct({ id: 'test', manufacturer: 'Test', model: 'TEST-1', janCode: null }, undefined, { environment: {}, fetchImpl: async () => { throw new Error('must not fetch'); } });
  assert.deepEqual(credentials, { yahoo: 'configured', rakuten: 'not configured' });
  assert.equal(JSON.stringify(credentials).includes('secret-value'), false);
  assert.equal(result.entries.length, 0);
  assert.equal(result.sourceResults.every((source) => !JSON.stringify(source).includes('secret-value')), true);
  assert.equal(await readFile('data/price-history.json', 'utf8'), before);
});
