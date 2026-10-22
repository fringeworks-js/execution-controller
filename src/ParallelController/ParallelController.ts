import type { SyncLooseFunction } from '@fringeworks/types';
import ExecutionControllerBase from '../ExecutionControllerBase';
import { normalizeLimit } from '../_internal/limit';
import type { WrappedFunction, WrappedReturn } from '../_types';
import type { CancelPolicy } from '../types';
import { ParallelControllerType } from './constants';
import type { ParallelControllerOptions } from './types';

/**
 * 並列実行コントローラー
 * 指定された同時実行数（limit）の範囲内で関数を並行して実行する\
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
   * 実行待ちのタスクキュー。先頭は `_head` の位置
   */
  private _queue: Array<() => Promise<void>> = [];

  /**
   * キューの先頭の位置
   */
  private _head = 0;

  constructor(options: ParallelControllerOptions<P> = {}) {
    const { limit, ...rest } = options;
    super({ ...rest, type: ParallelControllerType });
    this._limit = normalizeLimit(limit);
  }

  /**
   * 関数をラップする
   */
  protected override _wrap<T extends SyncLooseFunction>(
    fn: T,
  ): WrappedFunction<T> {
    const execute = this._createExecutionFn(fn);

    return (scope: unknown, args: Parameters<T>): WrappedReturn<T> => {
      // タスクをキューに追加
      const { promise, run } = this._createPending(execute, scope, args);
      this._queue.push(run);

      // キューの消化を試みる
      this._process();

      return promise;
    };
  }

  /**
   * 実行を待機している呼び出しを全てキャンセルする
   */
  override cancel(): void {
    this._queue = [];
    this._head = 0;
    super.cancel();
  }

  /**
   * キューの先頭のタスクを取り出す
   */
  private _dequeue() {
    const run = this._queue[this._head];
    if (run === undefined) {
      return undefined;
    }
    this._head++;
    // 取り出し済みの要素が半分以上になったら詰める（shiftの繰り返しでO(n²)にしない）
    if (this._head * 2 >= this._queue.length) {
      this._queue = this._queue.slice(this._head);
      this._head = 0;
    }
    return run;
  }

  /**
   * 実行枠が空いている間、キュー内のタスクを実行する
   */
  private _process() {
    // runは関数の開始までを同期的に行うため、executingはすぐに増える
    // キャンセル済みのタスクはexecutingを増やさずに終わるので、次を取り出す
    while (this.executing < this._limit) {
      const run = this._dequeue();
      if (!run) {
        return;
      }
      // runはrejectされないため、完了したら次のタスクをチェックする
      run().then(() => this._process());
    }
  }
}
