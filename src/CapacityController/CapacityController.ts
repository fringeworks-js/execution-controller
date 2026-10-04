import type { SyncLooseFunction } from '@fringeworks/types';
import type { WrappedFunction, WrappedReturn } from '../_types';
import { CANCEL } from '../constants';
import ExecutionControllerBase from '../ExecutionControllerBase';
import type { CancelPolicy } from '../types';
import { CapacityControllerType } from './constants';
import type { CapacityControllerOptions } from './types';

/**
 * 上限付き実行破棄コントローラー\
 * 同時実行できる上限数（limit）を設け、その範囲内で並行実行する\
 * 上限に達している状態で呼ばれた関数は破棄される
 */
export default class CapacityController<
  P extends CancelPolicy = 'ignore',
> extends ExecutionControllerBase<CapacityControllerType, P> {
  /**
   * 同時実行の上限数
   */
  private _limit: number;

  constructor(options: CapacityControllerOptions<P>) {
    // @ts-ignore
    super({ ...options, type: CapacityControllerType });
    // デフォルトは 4 枠
    this._limit = options.limit ?? 4;
  }

  /**
   * 関数をラップする
   * 実行枠がいっぱいの場合は undefined を返して即終了する
   */
  _wrap<T extends SyncLooseFunction>(fn: T): WrappedFunction<T> {
    const me = this;
    const execute = me._createExecutionFn(fn);

    return (scope: unknown, args: Parameters<T>): WrappedReturn<T> => {
      // 現在の実行数が上限に達しているかチェック
      if (me.executing >= me._limit) {
        // 実行せずに終了
        return Promise.resolve(CANCEL);
      }

      // 枠が空いていれば非同期で実行を開始
      return execute(scope, args);
    };
  }
}
