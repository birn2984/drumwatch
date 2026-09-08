'use client';

import { useState } from 'react';
import products from '@/data/products.json';
import history from '@/data/price-history.json';
import { formatYen, recordsForProduct, summaryFor, type PriceRecord } from '@/lib/price-utils';

type Product = (typeof products)[number];
const records = history as PriceRecord[];

function PriceChart({ productId }: { productId: string }) {
  const points = recordsForProduct(records, productId);
  if (points.length < 2) return <p className="no-data">価格履歴がまだ十分にありません。</p>;
  const values = points.map((x) => x.price);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const chartPoints = points.map((point, index) => {
    const x = 5 + (index / (points.length - 1)) * 90;
    const y = 84 - ((point.price - min) / Math.max(max - min, 1)) * 60;
    return `${x},${y}`;
  }).join(' ');
  return <div className="chart" aria-label="価格推移"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="価格推移"><line x1="5" y1="84" x2="95" y2="84" /><polyline points={chartPoints} /></svg><div className="chart-label"><span>{formatYen(min)}</span><span>{formatYen(max)}</span></div></div>;
}

function Detail({ product }: { product: Product }) {
  const itemRecords = recordsForProduct(records, product.id);
  const summary = summaryFor(itemRecords);
  const latest = summary.current;
  return <div className="detail"><section><h3>価格の目安</h3><dl className="metrics"><div><dt>現在価格</dt><dd>{formatYen(latest?.price)}</dd></div><div><dt>30日平均</dt><dd>{formatYen(summary.average30)}</dd></div><div><dt>30日最安</dt><dd>{formatYen(summary.low30)}</dd></div><div><dt>90日最安</dt><dd>{formatYen(summary.low90)}</dd></div></dl><PriceChart productId={product.id} /></section><section className="specs"><h3>仕様</h3><dl><div><dt>サイズ</dt><dd>幅 {product.dimensionsMm.width} × 奥行 {product.dimensionsMm.depth} × 高さ {product.dimensionsMm.height} mm</dd></div><div><dt>発売</dt><dd>{product.releasePeriod}</dd></div><div><dt>JAN</dt><dd>{product.janCode || '未登録'}</dd></div><div><dt>メモ</dt><dd>{product.notes}</dd></div></dl><p className="latest-shop">最新: {latest ? <a href={latest.url} target="_blank" rel="noreferrer">{latest.source} / {latest.shopName} ↗</a> : '未取得'}<br /><small>送料: {latest?.shipping === 'included' ? '込み' : latest?.shipping === 'excluded' ? '別' : '不明'}</small></p><a className="product-link" href={product.productUrl} target="_blank" rel="noreferrer">メーカー商品ページ ↗</a></section></div>;
}

export default function DrumWatchClient() {
  const [expandedId, setExpandedId] = useState<string | null>(products[0].id);
  return <main><header className="topbar"><div><p className="eyebrow">DRUM WATCH / PERSONAL PRICE TRACKER</p><h1>ドラム式、いまが買い時？</h1></div><p className="update">2人暮らし向け · 8kg以上 / 乾燥あり<br />最終データ: 2026/09/07</p></header><section className="intro"><div><p className="section-label">比較中のモデル</p><h2>価格を先に、暮らしやすさを次に。</h2></div><p>Yahoo!ショッピング・楽天市場の検索結果を、商品ごと・日ごとの最安価格で記録します。送料が確定しない価格は明示します。</p></section><section className="watchlist" aria-label="商品一覧"><div className="table-head"><span>機種</span><span>現在の最安価格</span><span>前回比</span><span>30日最安</span><span>容量・乾燥</span><span>判定</span></div>{products.map((product) => { const summary = summaryFor(recordsForProduct(records, product.id)); const expanded = expandedId === product.id; return <article className={`product ${expanded ? 'expanded' : ''}`} key={product.id}><button className="product-row" onClick={() => setExpandedId(expanded ? null : product.id)} aria-expanded={expanded}><span className="product-name"><strong>{product.productName}</strong><small>{product.manufacturer} · {product.model}</small></span><span className="price">{formatYen(summary.current?.price)}<small>{summary.current?.shipping === 'included' ? '送料込み' : '送料不明を含む'}</small></span><span className={summary.difference && summary.difference < 0 ? 'diff down' : 'diff'}>{summary.difference === undefined ? '—' : `${summary.difference > 0 ? '+' : ''}${formatYen(summary.difference)}`}</span><span>{formatYen(summary.low30)}</span><span>{product.washCapacityKg}kg / {product.dryCapacityKg}kg<small>{product.dryingMethod}</small></span><span><b className={`timing ${summary.buyTiming}`}>{summary.buyTiming}</b><i>{expanded ? '−' : '+'}</i></span></button>{expanded && <Detail product={product} />}</article>; })}</section><footer>表示ルール: 30日最安値の2%以内は「かなり安い」、30日平均より5%以上安い場合は「安め」。価格はポイント還元を含みません。</footer></main>;
}
