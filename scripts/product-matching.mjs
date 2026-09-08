export const PRICE_CHANGE_THRESHOLD = 0.5;

const ACCESSORY_TERMS = ['延長保証', '設置サービス', '洗濯機台', '防水パン', '排水ホース', 'フィルター', '糸くずフィルター', '部品', '交換パーツ', '中古部品'];
const MACHINE_TERMS = ['洗濯機', '洗濯乾燥機', 'ドラム式', 'ドラム', '本体'];

export function normalizeModel(value = '') {
  return value.normalize('NFKC').toUpperCase().replace(/[\s\-‐‑‒–—―ー]/g, '');
}

export function titleHasModel(title = '', model = '') {
  const normalizedModel = normalizeModel(model);
  if (!normalizedModel) return false;
  const separator = '[\\s\\-‐‑‒–—―ー]*';
  const pattern = normalizedModel.split('').map((character) => character.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join(separator);
  return new RegExp(`(^|[^A-Z0-9])${pattern}($|[^A-Z0-9])`, 'i').test(title.normalize('NFKC').toUpperCase());
}

export function classifyListing({ title, model, price }) {
  if (!Number.isFinite(price) || price <= 0) return { status: 'rejected', reason: 'invalid_price' };
  if (!titleHasModel(title, model)) return { status: 'rejected', reason: 'no_match' };
  const hasAccessoryTerm = ACCESSORY_TERMS.some((term) => title.includes(term));
  const hasMachineTerm = MACHINE_TERMS.some((term) => title.includes(term));
  if (hasAccessoryTerm && !hasMachineTerm) return { status: 'rejected', reason: 'related_accessory' };
  return { status: 'accepted', reason: 'model_match' };
}

export function suspiciousPrice(price, previousPrice, threshold = PRICE_CHANGE_THRESHOLD) {
  if (!Number.isFinite(previousPrice) || previousPrice <= 0) return null;
  const changeRate = Math.abs(price - previousPrice) / previousPrice;
  return changeRate > threshold ? `price_change_${Math.round(changeRate * 100)}pct` : null;
}
