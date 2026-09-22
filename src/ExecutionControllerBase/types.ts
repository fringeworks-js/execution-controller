import type { CancelPolicy } from '../types';

export type ExecutionControllerBaseOptions<
  T extends string,
  P extends CancelPolicy = 'ignore',
> = ExecutionControllerBaseOptionsBase<P> & {
  /**
   * グループ種別
   */
  type?: T;
};

export type ExecutionControllerBaseOptionsBase<
  P extends CancelPolicy = CancelPolicy,
> = {
  /**
   * グループID
   */
  id?: string;

  /**
   * 関数の実行がキャンセルされた場合の動作
   *
   * - 'ignore': 何もしない
   * - 'resolve': 正常処理の戻り値にCANCELを返す
   * - 'reject': 例外処理の戻り値にCANCELを返す
   *
   * @default 'ignore'
   */
  cancelPolicy?: P;
};
