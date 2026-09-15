export type ShippingStatus = 'included' | 'excluded' | 'unknown';

export type PriceRecord = {
  productId: string;
  timestamp: string;
  source: 'Yahoo!ショッピング' | '楽天市場';
  price: number;
  shopName: string;
  url: string;
  shipping: ShippingStatus;
};

export function formatYen(value?: number) {
  return value === undefined ? '—' : `¥${value.toLocaleString('ja-JP')}`;
}

export function recordsForProduct(records: PriceRecord[], productId: string) {
  return records
    .filter((record) => record.productId === productId)
    .sort((a, b) => +new Date(a.timestamp) - +new Date(b.timestamp));
}

export function lowestForDay(records: PriceRecord[]) {
  return [...records].sort((a, b) => a.price - b.price)[0];
}

export function summaryFor(records: PriceRecord[]) {
  const ordered = [...records].sort((a, b) => +new Date(a.timestamp) - +new Date(b.timestamp));
  if (!ordered.length) {
    return { current: undefined, difference: undefined, average30: undefined, low30: undefined, low90: undefined, buyTiming: '普通' as const, hasSufficientHistory: false };
  }
  const current = ordered.at(-1);
  const previous = ordered.at(-2);
  const cutoff30 = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const cutoff90 = Date.now() - 90 * 24 * 60 * 60 * 1000;
  const last30 = ordered.filter((x) => +new Date(x.timestamp) >= cutoff30);
  const last90 = ordered.filter((x) => +new Date(x.timestamp) >= cutoff90);
  const window30 = last30.length ? last30 : ordered;
  const window90 = last90.length ? last90 : ordered;
  const average30 = Math.round(window30.reduce((sum, x) => sum + x.price, 0) / window30.length);
  const low30 = Math.min(...window30.map((x) => x.price));
  const low90 = Math.min(...window90.map((x) => x.price));
  const currentPrice = current?.price;
  let buyTiming: 'かなり安い' | '安め' | '普通' | '高め' = '普通';
  if (currentPrice !== undefined) {
    if (currentPrice <= low30 * 1.02) buyTiming = 'かなり安い';
    else if (currentPrice <= average30 * 0.95) buyTiming = '安め';
    else if (currentPrice >= average30 * 1.05) buyTiming = '高め';
  }
  return { current, difference: currentPrice && previous ? currentPrice - previous.price : undefined, average30, low30, low90, buyTiming, hasSufficientHistory: ordered.length >= 2 };
}
