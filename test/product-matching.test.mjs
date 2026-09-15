import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { classifyListing, conditionFromTitle, flagPriceOutliers, isBelowMachinePriceFloor, suspiciousPrice, titleHasModel } from '../scripts/product-matching.mjs';
import { credentialState, evaluateListings, inspectProduct, RAKUTEN_ORIGIN, RAKUTEN_REFERER, RAKUTEN_USER_AGENT, selectWinner } from '../scripts/price-fetch.mjs';
import { loadLocalEnv } from '../scripts/load-local-env.mjs';

test('型番完全一致は採用する', () => assert.equal(classifyListing({ title: 'パナソニック NA-LX129DL ドラム式洗濯乾燥機', model: 'NA-LX129DL', price: 200000 }).status, 'accepted'));
test('ハイフンとスペースの表記揺れは同一型番と扱う', () => assert.equal(titleHasModel('NA LX129DL 本体', 'NA-LX129DL'), true));
test('末尾型番違いは採用しない', () => assert.equal(classifyListing({ title: 'NA-LX129DR ドラム式洗濯機', model: 'NA-LX129DL', price: 200000 }).reason, 'no_match'));
test('型番一致でも関連部品だけは除外する', () => assert.equal(classifyListing({ title: 'NA-LX129DL 用 糸くずフィルター', model: 'NA-LX129DL', price: 1200 }).reason, 'related_accessory'));
test('乾燥フィルターの対応機種型番はrejectする', () => assert.equal(classifyListing({ title: '乾燥フィルター ES-8XS1-WR対応 洗濯機用', model: 'ES-8XS1-WR', price: 3450 }).reason, 'related_accessory'));
test('対応機種としてだけ書かれた型番はrejectする', () => assert.equal(classifyListing({ title: '対応機種 NA-LX127ER', model: 'NA-LX127ER', price: 3204 }).reason, 'compatible_model_reference'));
test('本体のドラム式洗濯乾燥機はacceptする', () => assert.equal(classifyListing({ title: 'ES-8XS1-WR ドラム式洗濯乾燥機', model: 'ES-8XS1-WR', price: 186840 }).status, 'accepted'));
test('色コード付き本体型番はacceptする', () => assert.equal(classifyListing({ title: 'NA-LX127ER-W ドラム式洗濯乾燥機', model: 'NA-LX127ER', price: 283970 }).status, 'accepted'));
test('対応本体を含む部品はrejectする', () => assert.equal(classifyListing({ title: '純正部品 乾燥フィルター 対応本体 ES-8XS1-WR', model: 'ES-8XS1-WR', price: 3450 }).reason, 'related_accessory'));
test('明確な本体は高い次点だけで除外せず、warningを付けて採用可能にする', () => {
  const entries = [{ title: 'TW-127XP5R ドラム式洗濯乾燥機', price: 219800, matching: 'accepted', condition: 'new', shopName: 'Shop', url: 'https://example.test/low', source: 'Yahoo!ショッピング', shipping: 'included', wouldSelect: false }, { title: 'TW-127XP5R ドラム式洗濯乾燥機', price: 366630, matching: 'accepted', condition: 'new', shopName: 'Shop', url: 'https://example.test/high', source: '楽天市場', shipping: 'included', wouldSelect: false }];
  assert.equal(flagPriceOutliers(entries)[0].warning, 'possible_outlier');
  assert.equal(selectWinner(entries).price, 219800);
});
test('5万円未満の本体候補はsuspiciousにする', () => {
  const entries = evaluateListings({ manufacturer: 'Test', model: 'TEST-1' }, { source: 'Yahoo!ショッピング', search: 'TEST-1', listings: [{ title: 'TEST-1 ドラム式洗濯乾燥機', price: 49000, shopName: 'Shop', url: 'https://example.test/low', shipping: 'included' }] });
  assert.equal(isBelowMachinePriceFloor(49000), true);
  assert.equal(entries[0].matching, 'suspicious');
  assert.equal(entries[0].reason, 'below_machine_price_floor');
});
test('Yahooと楽天の近い価格はクロスソース裏付けにする', () => {
  const entries = [{ title: 'TEST-1 ドラム式洗濯乾燥機', price: 219800, matching: 'accepted', condition: 'new', shopName: 'Yahoo', url: 'https://example.test/yahoo', source: 'Yahoo!ショッピング', shipping: 'included', wouldSelect: false }, { title: 'TEST-1 ドラム式洗濯乾燥機', price: 230000, matching: 'accepted', condition: 'new', shopName: 'Rakuten', url: 'https://example.test/rakuten', source: '楽天市場', shipping: 'included', wouldSelect: false }, { title: 'TEST-1 ドラム式洗濯乾燥機', price: 380000, matching: 'accepted', condition: 'new', shopName: 'Other', url: 'https://example.test/other', source: '楽天市場', shipping: 'included', wouldSelect: false }];
  assert.equal(flagPriceOutliers(entries).length, 0);
  assert.equal(entries[0].priceConfidence, 'cross_source_confirmed');
  assert.equal(selectWinner(entries).price, 219800);
});
test('前回から50%超の価格変動はsuspiciousにする', () => assert.equal(suspiciousPrice(310000, 200000), 'price_change_55pct'));
test('中古表記は通常新品候補にしない', () => assert.equal(conditionFromTitle('中古 NA-LX127EL ドラム式洗濯乾燥機'), 'used'));
test('美品表記も通常新品候補にしない', () => assert.equal(conditionFromTitle('美品 BD-SX130KL ドラム式洗濯乾燥機'), 'used'));
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
  assert.equal(request.options.headers.Origin, RAKUTEN_ORIGIN);
  assert.equal(request.options.headers['User-Agent'], RAKUTEN_USER_AGENT);
  assert.deepEqual(rakuten.listings, [{ title: 'TEST-1 ドラム式洗濯乾燥機', price: 100000, shopName: 'Test Shop', url: 'https://example.test/item', shipping: 'included' }]);
});
test('楽天の実レスポンス互換の大文字Itemsも直接解析する', async () => {
  const result = await inspectProduct({ id: 'test', manufacturer: 'Test', model: 'TEST-1', janCode: null }, undefined, {
    environment: { RAKUTEN_APPLICATION_ID: 'app-id', RAKUTEN_ACCESS_KEY: 'access-key' },
    fetchImpl: async () => ({ ok: true, json: async () => ({ Items: [{ itemName: 'TEST-1 ドラム式洗濯乾燥機', itemPrice: 100000, shopName: 'Test Shop', itemUrl: 'https://example.test/item', postageFlag: 1 }] }) }),
  });
  const rakuten = result.sourceResults.find((source) => source.source === '楽天市場');
  assert.deepEqual(rakuten.listings, [{ title: 'TEST-1 ドラム式洗濯乾燥機', price: 100000, shopName: 'Test Shop', url: 'https://example.test/item', shipping: 'excluded' }]);
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
test('型落ち監視カタログは既存商品を維持し、世代・グレード情報を持つ', async () => {
  const catalog = JSON.parse(await readFile('data/products.json', 'utf8'));
  assert.equal(catalog.some((product) => product.id === 'toshiba-tw-84gs5l'), true);
  assert.equal(catalog.some((product) => product.id === 'panasonic-na-lx127el'), true);
  assert.equal(catalog.filter((product) => product.legacyWatch).length >= 1, true);
  assert.equal(catalog.every((product) => ['modelYear', 'releaseDate', 'generationStatus', 'originalTier', 'legacyWatch', 'discontinued', 'successorModel', 'successorReleaseDate', 'stockRisk', 'availabilityStatus'].every((field) => field in product)), true);
});
test('previewとupdateが共通ローダーで.env.localを読み、既存環境値を優先する', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'drumwatch-env-'));
  const filePath = join(directory, '.env.local');
  const localYahoo = 'local-yahoo-secret';
  const shellRakuten = 'shell-rakuten-secret';
  const environment = { RAKUTEN_APPLICATION_ID: shellRakuten };
  try {
    await writeFile(filePath, `YAHOO_APP_ID=${localYahoo}\nRAKUTEN_APPLICATION_ID=local-rakuten-secret\nRAKUTEN_ACCESS_KEY=local-access-secret\n`);
    assert.equal(loadLocalEnv(filePath, environment), true);
    assert.equal(credentialState(environment).yahoo, 'configured');
    assert.equal(credentialState(environment).rakuten, 'configured');
    assert.equal(environment.RAKUTEN_APPLICATION_ID, shellRakuten);
    assert.equal(JSON.stringify(credentialState(environment)).includes(localYahoo), false);
    const [preview, update, check] = await Promise.all([
      readFile('scripts/preview-prices.mjs', 'utf8'),
      readFile('scripts/update-prices.mjs', 'utf8'),
      readFile('scripts/check-update-credentials.mjs', 'utf8'),
    ]);
    for (const source of [preview, update, check]) assert.equal(source.includes("from './load-local-env.mjs'"), true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
