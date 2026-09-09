export const PRICE_CHANGE_THRESHOLD = 0.5;
export const OUTLIER_DISCOUNT_THRESHOLD = 0.4;

const ACCESSORY_TERMS = ['乾燥フィルター', '糸くずフィルター', '排水フィルター', '給水ホース', '排水ホース', '防水パン', '洗濯機台', 'かさ上げ台', '部品', 'パーツ', '交換用', '補修用', '消耗品', '純正部品', '交換フィルター', 'ドア部品', 'ヒンジ', 'パッキン', '洗剤ケース', 'ポンプ', '延長保証', '設置サービス単体', '設置サービス'];
const STRONG_MACHINE_TERMS = ['ドラム式洗濯乾燥機', 'ドラム式洗濯機', '洗濯乾燥機', '洗濯機本体'];
const COMPATIBILITY_TERMS = ['対応機種', '対応本体', '対象機種', '使用機種', '対応', '適用', '適合'];
const NON_NEW_TERMS = [
  ['中古', 'used'], ['展示品', 'display'], ['アウトレット', 'outlet'], ['訳あり', 'outlet'], ['リユース', 'used'],
];

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

function modelIsCompatibilityReference(title = '', model = '') {
  const normalizedTitle = title.normalize('NFKC').toUpperCase();
  const normalizedModel = normalizeModel(model);
  const compactTitle = normalizeModel(normalizedTitle);
  const modelPosition = compactTitle.indexOf(normalizedModel);
  if (modelPosition < 0) return false;
  return COMPATIBILITY_TERMS.some((term) => {
    const position = compactTitle.indexOf(normalizeModel(term));
    return position >= 0 && Math.abs(position - modelPosition) <= 48;
  });
}

function hasStrongMachineContext(title = '') {
  return STRONG_MACHINE_TERMS.some((term) => title.includes(term))
    || /洗濯\s*\d+(?:\.\d+)?\s*kg/i.test(title)
    || /乾燥\s*\d+(?:\.\d+)?\s*kg/i.test(title);
}

export function classifyListing({ title, model, price }) {
  if (!Number.isFinite(price) || price <= 0) return { status: 'rejected', reason: 'invalid_price' };
  if (!titleHasModel(title, model)) return { status: 'rejected', reason: 'no_match' };
  const hasAccessoryTerm = ACCESSORY_TERMS.some((term) => title.includes(term));
  if (hasAccessoryTerm) return { status: 'rejected', reason: 'related_accessory' };
  if (modelIsCompatibilityReference(title, model) && !hasStrongMachineContext(title)) return { status: 'rejected', reason: 'compatible_model_reference' };
  return { status: 'accepted', reason: 'model_match' };
}

export function conditionFromTitle(title = '') {
  const found = NON_NEW_TERMS.find(([term]) => title.includes(term));
  return found ? found[1] : 'new';
}

export function suspiciousPrice(price, previousPrice, threshold = PRICE_CHANGE_THRESHOLD) {
  if (!Number.isFinite(previousPrice) || previousPrice <= 0) return null;
  const changeRate = Math.abs(price - previousPrice) / previousPrice;
  return changeRate > threshold ? `price_change_${Math.round(changeRate * 100)}pct` : null;
}

export function flagPriceOutliers(entries, threshold = OUTLIER_DISCOUNT_THRESHOLD) {
  const accepted = entries.filter((entry) => entry.matching === 'accepted' && Number.isFinite(entry.price)).sort((a, b) => a.price - b.price);
  if (accepted.length < 2) return [];
  const lowestPrice = accepted[0].price;
  const lowest = accepted.filter((entry) => entry.price === lowestPrice);
  const runnerUp = accepted.find((entry) => entry.price > lowestPrice);
  const prices = accepted.map((entry) => entry.price);
  const middle = Math.floor(prices.length / 2);
  const median = prices.length % 2 ? prices[middle] : (prices[middle - 1] + prices[middle]) / 2;
  const belowMedian = lowestPrice <= median * (1 - threshold);
  const belowRunnerUp = runnerUp && lowestPrice <= runnerUp.price * (1 - threshold);
  if (lowest.length !== 1 || (!belowMedian && !belowRunnerUp)) return [];
  lowest[0].matching = 'suspicious';
  lowest[0].reason = 'possible_outlier';
  lowest[0].wouldSelect = false;
  return lowest;
}
