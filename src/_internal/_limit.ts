/**
 * 同時実行の上限数の既定値
 */
const DEFAULT_LIMIT = 4;

/**
 * 同時実行の上限数を正規化する\
 * 未指定・1未満・NaNの場合は既定値を使い、小数は切り捨てる。Infinityは上限なしとして扱う
 */
export function normalizeLimit(limit: number | undefined): number {
  // NaNも弾くため、否定で判定する
  if (limit === undefined || !(limit >= 1)) {
    return DEFAULT_LIMIT;
  }
  return Math.floor(limit);
}
