import type { SyncLooseFunction } from '@fringeworks/types';
import type { WrappedFunction, WrappedReturn } from '../_types';
import ExecutionControllerBase from '../ExecutionControllerBase';
import type { CancelPolicy } from '../types';
import { DebounceControllerType } from './constants';
import type { DebounceControllerOptions } from './types';

/**
 * デバウンスコントローラー
 * 指定時間内に再呼び出しがなければ実行。
 * 前回の実行が完了していない場合は、完了を待ってから連続して実行します。
 */
export default class DebounceController<
  P extends CancelPolicy = 'ignore',
> extends ExecutionControllerBase<DebounceControllerType, P> {
  // 待ち時間
  private _wait: number;

  // 実行完了を待つか
  private _sequential: boolean;

  /**
   * 実行待ち情報（タイマー管理用）
   */
  private _waiting: {
    timeout: ReturnType<typeof setTimeout>;
    cancel: () => void;
  } | null = null;

  /**
   * 実行中のPromise（sequential用）
   */
  private _tail: Promise<void> = Promise.resolve();

  constructor(options: DebounceControllerOptions<P>) {
    const { wait, sequential, ...rest } = options;
    // @ts-ignore
    super({ ...rest, type: DebounceControllerType });
    this._wait = wait ?? 240;
    this._sequential = sequential ?? false;
  }

  _wrap<T extends SyncLooseFunction>(fn: T): WrappedFunction<T> {
    const me = this;
    const execute = me._createExecutionFn(fn);

    return (scope: unknown, args: Parameters<T>): WrappedReturn<T> => {
      // 1. すでに待機中のタイマーがあればキャンセル（最新の呼び出しを優先）
      me._clearWaiting();

      const { promise, run, cancel } = me._createPending(execute, scope, args);

      // 新しいタイマーをセット
      const timeout = setTimeout(() => {
        // 実行できたのでクリア
        me._waiting = null;

        if (me._sequential) {
          // 前回の関数の実行が終わるのを待ってから、今回の実行を開始する
          // runはrejectされないため、前の実行がエラーでも次へ進む
          me._tail = me._tail.then(run);
        } else {
          //sequentialがfalseの場合は、完了を待たずに即実行
          run();
        }
      }, me._wait);
      me._waiting = { timeout, cancel };

      return promise;
    };
  }

  /**
   * 実行を待機している呼び出しを全てキャンセルする
   */
  cancel(): void {
    this._clearWaiting();
    super.cancel();
  }

  /**
   * 待機中のタイマーを止め、その呼び出しをキャンセルする
   */
  private _clearWaiting() {
    if (this._waiting) {
      clearTimeout(this._waiting.timeout);
      this._waiting.cancel();
      this._waiting = null;
    }
  }
}
