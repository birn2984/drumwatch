import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { credentialPreflight, verifyFetchSummary } from '../scripts/update-safety.mjs';

test('ActionsのSecret不足は更新開始前に失敗し履歴を維持する', async () => {
  const before = await readFile('data/price-history.json', 'utf8');
  const result = spawnSync(process.execPath, ['scripts/update-prices.mjs'], {
    encoding: 'utf8', env: { ...process.env, GITHUB_ACTIONS: 'true', YAHOO_APP_ID: '', RAKUTEN_APPLICATION_ID: '', RAKUTEN_ACCESS_KEY: '' },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Secrets missing/);
  assert.equal(await readFile('data/price-history.json', 'utf8'), before);
});

test('設定済み認証は通過し、ログに値を含めない', () => {
  const output = [];
  const environment = { GITHUB_ACTIONS: 'true', YAHOO_APP_ID: 'secret-yahoo', RAKUTEN_APPLICATION_ID: 'secret-app', RAKUTEN_ACCESS_KEY: 'secret-key' };
  credentialPreflight(environment, (line) => output.push(line));
  assert.equal(output.filter((line) => line.endsWith(': configured')).length, 3);
  assert.doesNotMatch(output.join('\n'), /secret-/);
  assert.throws(() => credentialPreflight({ ...environment, RAKUTEN_ACCESS_KEY: '  ' }, () => {}), /RAKUTEN_ACCESS_KEY is not configured/);
  assert.doesNotThrow(() => credentialPreflight({}, () => {}));
});

test('全通信失敗はActions失敗、取得成功で採用ゼロは正常', () => {
  const summary = { monitoredProducts: 20, sources: { Yahoo: { queried: 0 }, Rakuten: { queried: 20 } } };
  assert.throws(() => verifyFetchSummary(summary, { GITHUB_ACTIONS: 'true' }), /Yahoo/);
  summary.sources.Yahoo.queried = 20;
  assert.doesNotThrow(() => verifyFetchSummary(summary, { GITHUB_ACTIONS: 'true' }));
});
