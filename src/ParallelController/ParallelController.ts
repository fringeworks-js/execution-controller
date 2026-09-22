import type { SyncLooseFunction } from '@niche-works/types';
import ExecutionControllerBase from '../ExecutionControllerBase';
import type { WrappedFunction, WrappedReturn } from '../_types';
import type { CancelPolicy } from '../types';
import { ParallelControllerType } from './constants';
import type { ParallelControllerOptions } from './types';

/**
 * 並列実行コントローラー
 * 指定された同時実行数（concurrency）の範囲内で関数を並行して実行する\
 * 上限に達している間に呼ばれた関数はキューに蓄積され、\
 * 実行中のいずれかの処理が完了して枠が空き次第、順次開始される
 */
export default class ParallelController<
  P extends CancelPolicy = 'ignore',
> extends ExecutionControllerBase<ParallelControllerType, P> {
  /**
   * 同時実行の上限数
   */
  private _limit: number;

  /**
   * 実行待ちのタスクキュー
   */
  private _queue: Array<{
    execute: (scope: any, args: any[]) => Promise<any>;
    scope: any;
    args: any[];
    resolve: (value: any) => void;
    reject: (reason?: any) => void;
  }> = [];

  constructor(options: ParallelControllerOptions) {
    // @ts-ignore
    super({ ...options, type: ParallelControllerType });
    // デフォルトは4
    this._limit = options.limit ?? 4;
  }

  /**
   * 関数をラップする
   */
  _wrap<T extends SyncLooseFunction>(fn: T): WrappedFunction<T> {
    const me = this;
    const execute = me._createExecutionFn(fn);

    return (scope: unknown, args: Parameters<T>): WrappedReturn<T> => {
      return new Promise((resolve, reject) => {
        // タスクをキューに追加
        me._queue.push({
          execute,
          scope,
          args,
          resolve,
          reject,
        });

        // キューの消化を試みる
        me._process();
      });
    };
  }

  /**
   * キュー内のタスクを実行する
   */
  private async _process() {
    // 実行枠が空いていない、または待ち行列が空なら何もしない
    if (this.executing >= this._limit || this._queue.length === 0) {
      return;
    }

    // キューから先頭を取り出す
    const { execute, scope, args, resolve, reject } = this._queue.shift();

    // 実行開始（非同期）
    execute(scope, args)
      .then(resolve)
      .catch(reject)
      .finally(() => {
        // 完了したら次のタスクをチェック
        this._process();
      });

    // 再帰的に次のタスクも開始させる
    this._process();
  }
}
