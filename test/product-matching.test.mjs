import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { classifyListing, conditionFromTitle, suspiciousPrice, titleHasModel } from '../scripts/product-matching.mjs';
import { credentialState, inspectProduct, RAKUTEN_REFERER } from '../scripts/price-fetch.mjs';

test('型番完全一致は採用する', () => assert.equal(classifyListing({ title: 'パナソニック NA-LX129DL ドラム式洗濯乾燥機', model: 'NA-LX129DL', price: 200000 }).status, 'accepted'));
test('ハイフンとスペースの表記揺れは同一型番と扱う', () => assert.equal(titleHasModel('NA LX129DL 本体', 'NA-LX129DL'), true));
test('末尾型番違いは採用しない', () => assert.equal(classifyListing({ title: 'NA-LX129DR ドラム式洗濯機', model: 'NA-LX129DL', price: 200000 }).reason, 'no_match'));
test('型番一致でも関連部品だけは除外する', () => assert.equal(classifyListing({ title: 'NA-LX129DL 用 糸くずフィルター', model: 'NA-LX129DL', price: 1200 }).reason, 'related_accessory'));
test('前回から50%超の価格変動はsuspiciousにする', () => assert.equal(suspiciousPrice(310000, 200000), 'price_change_55pct'));
test('中古表記は通常新品候補にしない', () => assert.equal(conditionFromTitle('中古 NA-LX127EL ドラム式洗濯乾燥機'), 'used'));
test('楽天 formatVersion=2の小文字itemsを直接解析する', async () => {
  let request;
  const result = await inspectProduct({ id: 'test', manufacturer: 'Test', model: 'TEST-1', janCode: null }, undefined, {
    environment: { RAKUTEN_APPLICATION_ID: 'app-id', RAKUTEN_ACCESS_KEY: 'access-key' },
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, json: async () => ({ items: [{ itemName: 'TEST-1 ドラム式洗濯乾燥機', itemPrice: 100000, shopName: 'Test Shop', itemUrl: 'https://example.test/item', postageFlag: 0 }] }) };
    },
  });
  const rakuten = result.sourceResults.find((source) => source.source === '楽天市場');
  assert.equal(request.url.searchParams.get('formatVersion'), '2');
  assert.equal(request.options.headers.Referer, RAKUTEN_REFERER);
  assert.equal(request.options.headers.Origin, undefined);
  assert.deepEqual(rakuten.listings, [{ title: 'TEST-1 ドラム式洗濯乾燥機', price: 100000, shopName: 'Test Shop', url: 'https://example.test/item', shipping: 'included' }]);
});
test('楽天HTTPエラーは安全なstatusとerror_descriptionだけを表示する', async () => {
  const secret = 'access-key-should-not-leak';
  const result = await inspectProduct({ id: 'test', manufacturer: 'Test', model: 'TEST-1', janCode: null }, undefined, {
    environment: { RAKUTEN_APPLICATION_ID: 'app-id-should-not-leak', RAKUTEN_ACCESS_KEY: secret },
    fetchImpl: async () => ({ ok: false, status: 403, text: async () => JSON.stringify({ error: 'HTTP_REFERRER_NOT_ALLOWED', error_description: `Denied ${secret}` }) }),
  });
  const rakuten = result.sourceResults.find((source) => source.source === '楽天市場');
  assert.equal(rakuten.error.includes('Rakuten HTTP 403'), true);
  assert.equal(rakuten.error.includes('HTTP_REFERRER_NOT_ALLOWED'), true);
  assert.equal(rakuten.error.includes(secret), false);
  assert.equal(rakuten.error.includes('app-id-should-not-leak'), false);
});
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
test('.env.localはGit管理外として指定され、雛形に値を含めない', async () => {
  const [ignore, example] = await Promise.all([readFile('.gitignore', 'utf8'), readFile('.env.example', 'utf8')]);
  assert.equal(ignore.includes('.env.local'), true);
  assert.equal(example.trim(), 'YAHOO_APP_ID=\nRAKUTEN_APPLICATION_ID=\nRAKUTEN_ACCESS_KEY=');
});
