import type { SyncLooseFunction } from '@niche-works/types';
import type { WrappedFunction, WrappedReturn } from '../_types';
import { CANCEL } from '../constants';
import ExecutionControllerBase from '../ExecutionControllerBase';
import type { CancelPolicy } from '../types';
import { ThrottleControllerType } from './constants';
import type { ThrottleControllerOptions } from './types';

/**
 * 一定間隔実行コントローラー
 * 最初に関数を実行した後、指定時間（wait）が経過するまで次の実行を禁止する\
 * クールタイム中に呼ばれた関数は無視される\
 */
export default class ThrottleController<
  P extends CancelPolicy = 'ignore',
> extends ExecutionControllerBase<ThrottleControllerType, P> {
  // 待ち時間
  private _wait: number;

  // 実行完了を待つか
  private _sequential: boolean;

  /**
   * クールタイム中（実行禁止期間）かどうか
   */
  private _isThrottling = false;

  /**
   * 実行中のPromise（sequential用）
   */
  private _tail: Promise<any> = Promise.resolve();

  constructor(options: ThrottleControllerOptions) {
    const { wait, sequential, ...rest } = options;
    // @ts-ignore
    super({ ...rest, type: ThrottleControllerType });
    this._wait = wait ?? 240;
    this._sequential = sequential ?? false;
  }

  /**
   * 関数をラップする
   * クールタイム中の呼び出しは無視され、undefined を返す
   */
  _wrap<T extends SyncLooseFunction>(fn: T): WrappedFunction<T> {
    const me = this;
    const execute = me._createExecutionFn(fn);

    return (scope: unknown, args: Parameters<T>): WrappedReturn<T> => {
      // クールタイム中なら即座に CANCEL を返す
      if (me._isThrottling) {
        return Promise.resolve(CANCEL);
      }

      // クールタイム開始
      me._isThrottling = true;
      setTimeout(() => {
        me._isThrottling = false;
      }, me._wait);

      return new Promise((resolve, reject) => {
        if (me._sequential) {
          // 前の実行が終わるのを待って実行
          me._tail = me._tail
            .then(() => {
              execute(scope, args).then(resolve).catch(reject);
            })
            .catch(() => {
              /* 前のエラーを無視して次へ */
            });
        } else {
          // 即時実行
          execute(scope, args).then(resolve).catch(reject);
        }
      });
    };
  }
}
