'use client';

import { useState } from 'react';
import products from '@/data/products.json';
import history from '@/data/price-history.json';
import { formatYen, recordsForProduct, summaryFor, type PriceRecord } from '@/lib/price-utils';

const records = history as PriceRecord[];
const dryingLabels: Record<string, string> = { heat_pump: 'ヒートポンプ乾燥', heater: 'ヒーター乾燥', low_temp_heater: '低温ヒーター乾燥', hybrid: 'ハイブリッド乾燥', unknown: '確認中' };
const doorLabels: Record<string, string> = { left: '左開き', right: '右開き', unknown: '開き方確認中' };
const generationLabels: Record<string, string> = { current: '現行', outgoing_current: '型落ち間近（後継発表済み）', previous_generation: '1世代前', two_generations_old: '2世代前', older: '3世代以上前', unknown: '世代確認中' };
const tierLabels: Record<string, string> = { flagship: 'フラッグシップ', premium: '上位モデル', upper_mid: '中上位モデル', standard: '標準モデル', entry: 'エントリー', unknown: '確認中' };
type LegacyFilter = 'all' | 'legacy' | 'previous' | 'older' | 'current';

function PriceChart({ productId }: { productId: string }) {
  const points = recordsForProduct(records, productId);
  if (points.length < 2) return <p className="no-data">価格データ収集中です。</p>;
  const values = points.map((point) => point.price);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const line = points.map((point, index) => `${5 + (index / (points.length - 1)) * 90},${84 - ((point.price - min) / Math.max(max - min, 1)) * 60}`).join(' ');
  return <div className="chart"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="価格推移"><line x1="5" y1="84" x2="95" y2="84" /><polyline points={line} /></svg><div className="chart-label"><span>{formatYen(min)}</span><span>{formatYen(max)}</span></div></div>;
}

function Detail({ product }: { product: (typeof products)[number] }) {
  const summary = summaryFor(recordsForProduct(records, product.id));
  const latest = summary.current;
  const size = product.dimensions;
  return <div className="detail"><section><h3>価格の目安</h3><dl className="metrics"><div><dt>現在価格</dt><dd>{formatYen(latest?.price)}</dd></div><div><dt>30日平均</dt><dd>{formatYen(summary.average30)}</dd></div><div><dt>30日最安</dt><dd>{formatYen(summary.low30)}</dd></div><div><dt>90日最安</dt><dd>{formatYen(summary.low90)}</dd></div></dl><PriceChart productId={product.id} /></section><section className="specs"><h3>型落ち監視情報</h3><dl><div><dt>世代</dt><dd>{generationLabels[product.generationStatus]}</dd></div><div><dt>発売時</dt><dd>{tierLabels[product.originalTier]}</dd></div><div><dt>後継機</dt><dd>{product.successorModel ?? '公式確認中'}</dd></div><div><dt>生産終了</dt><dd>{product.discontinued === true ? '公式にて確認' : product.discontinued === false ? '継続' : '確認中'}</dd></div><div><dt>在庫状態</dt><dd>{product.availabilityStatus === 'unknown' ? 'データ収集中' : product.availabilityStatus}</dd></div></dl><h3>仕様</h3><dl><div><dt>サイズ</dt><dd>幅 {size.widthMm} × 奥行 {size.depthMm} × 高さ {size.heightMm} mm（{size.measurement === 'overall' ? '本体寸法' : 'ホース含む'}）</dd></div><div><dt>開き方</dt><dd>{doorLabels[product.doorDirection]}</dd></div><div><dt>洗乾電力</dt><dd>{product.washDryEnergyWh ? `${product.washDryEnergyWh} Wh / ${product.washDryTimeMinutes} 分` : '未公表'}</dd></div><div><dt>JAN</dt><dd>{product.janCode || '未登録'}</dd></div><div><dt>メモ</dt><dd>{product.notes}</dd></div></dl>{latest && <p className="latest-shop">最新: <a href={latest.url} target="_blank" rel="noreferrer">{latest.source} / {latest.shopName} ↗</a><br /><small>送料: {latest.shipping === 'included' ? '込み' : latest.shipping === 'excluded' ? '別' : '不明'}</small></p>}<a className="product-link" href={product.officialUrl} target="_blank" rel="noreferrer">メーカー公式ページ ↗</a></section></div>;
}

export default function DrumWatchClient() {
  const [expandedId, setExpandedId] = useState<string | null>(products[0]?.id ?? null);
  const [legacyFilter, setLegacyFilter] = useState<LegacyFilter>('all');
  const [upperOnly, setUpperOnly] = useState(false);
  const visibleProducts = products.filter((product) => {
    const matchesGeneration = legacyFilter === 'all' || (legacyFilter === 'legacy' && (product.legacyWatch || ['outgoing_current', 'previous_generation', 'two_generations_old', 'older'].includes(product.generationStatus))) || (legacyFilter === 'previous' && product.generationStatus === 'previous_generation') || (legacyFilter === 'older' && ['two_generations_old', 'older'].includes(product.generationStatus)) || (legacyFilter === 'current' && product.generationStatus === 'current');
    return matchesGeneration && (!upperOnly || ['flagship', 'premium'].includes(product.originalTier));
  });
  return <main><header className="topbar"><div><p className="eyebrow">DRUM WATCH / PERSONAL PRICE TRACKER</p><h1>型落ち上位モデル、いまが買い時？</h1></div><p className="update">2人暮らし向け · 8kg以上 / 乾燥あり<br />価格と世代交代を記録</p></header><section className="intro"><div><p className="section-label">比較中のモデル</p><h2>発売時の性能を、いまの価格で比べる。</h2></div><p>上位モデルの世代交代と価格推移を追跡します。履歴が少ない機種は、買い時を断定せずデータを蓄積します。</p></section><section className="filters" aria-label="型落ちフィルター"><div className="filter-group">{([{ value: 'all', label: 'すべて' }, { value: 'legacy', label: '型落ち狙い' }, { value: 'previous', label: '1世代前' }, { value: 'older', label: '2世代以上前' }, { value: 'current', label: '現行モデル' }] as const).map((filter) => <button key={filter.value} className={legacyFilter === filter.value ? 'selected' : ''} onClick={() => setLegacyFilter(filter.value)}>{filter.label}</button>)}</div><label className="tier-filter"><input type="checkbox" checked={upperOnly} onChange={(event) => setUpperOnly(event.target.checked)} /> 上位モデルのみ</label></section><section className="watchlist" aria-label="商品一覧"><div className="table-head"><span>機種</span><span>現在の最安価格</span><span>前回比</span><span>30日最安</span><span>容量・乾燥</span><span>判定</span></div>{visibleProducts.map((product) => { const summary = summaryFor(recordsForProduct(records, product.id)); const expanded = expandedId === product.id; const legacyAttention = product.legacyWatch && ['flagship', 'premium'].includes(product.originalTier) && Boolean(summary.current); return <article className={`product ${expanded ? 'expanded' : ''}`} key={product.id}><button className="product-row" onClick={() => setExpandedId(expanded ? null : product.id)} aria-expanded={expanded}><span className="product-name"><strong>{product.productName}</strong><small>{product.manufacturer} · {product.model} · {doorLabels[product.doorDirection]}</small><small className="generation">{generationLabels[product.generationStatus]} · {tierLabels[product.originalTier]} {legacyAttention && <b>型落ち注目</b>}</small></span><span className="price">{summary.current ? formatYen(summary.current.price) : '価格データ収集中'}<small>{summary.current?.shipping === 'included' ? '送料込み' : summary.current ? '送料不明を含む' : '初回取得待ち'}</small></span><span className={summary.difference && summary.difference < 0 ? 'diff down' : 'diff'}>{summary.difference === undefined ? '—' : `${summary.difference > 0 ? '+' : ''}${formatYen(summary.difference)}`}</span><span>{summary.low30 === undefined ? '—' : formatYen(summary.low30)}</span><span>{product.washCapacityKg}kg / {product.dryCapacityKg}kg<small>{dryingLabels[product.dryingMethod]} · 自動投入 {product.autoDosing === null ? '確認中' : product.autoDosing ? 'あり' : 'なし'}</small></span><span><b className={`timing ${summary.current && summary.hasSufficientHistory ? summary.buyTiming : ''}`}>{summary.current ? summary.hasSufficientHistory ? summary.buyTiming : '履歴不足' : '収集中'}</b><i>{expanded ? '−' : '+'}</i></span></button>{expanded && <Detail product={product} />}</article>; })}{visibleProducts.length === 0 && <p className="no-results">条件に合う監視対象はありません。</p>}</section><footer><p>価格履歴はAPI設定後に蓄積されます。メーカーが未公表の仕様は「未登録」または「確認中」と表示します。</p><div className="rakuten-credit" dangerouslySetInnerHTML={{ __html: '<!-- Rakuten Web Services Attribution Snippet FROM HERE -->\n<a href="https://developers.rakuten.com/" target="_blank">Supported by Rakuten Developers</a>\n<!-- Rakuten Web Services Attribution Snippet TO HERE -->' }} /></footer></main>;
}
