import { CANCEL } from './constants';

/**
 * 渡された値がキャンセル時の値であることをチェックする
 * @param value
 * @returns
 */
export default function isCanceled(
  value: unknown | typeof CANCEL,
): value is typeof CANCEL {
  return value === CANCEL;
}
