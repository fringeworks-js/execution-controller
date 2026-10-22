import type { SyncLooseFunction } from '@fringeworks/types';
import ExecutionControllerBase from '../ExecutionControllerBase';
import type { WrappedFunction, WrappedReturn } from '../_types';
import type { CancelPolicy } from '../types';
import { SerialControllerType } from './constants';
import type { SerialControllerOptions } from './types';

/**
 * 直列実行コントローラー
 * 関数を一度に一つずつ順番に実行する\
 * 実行中に関数が呼ばれた場合、それらはキュー（待ち行列）に追加され、\
 * 現在の処理が完了し次第、古い順から順次実行される
 */
export default class SerialController<
  P extends CancelPolicy = 'ignore',
> extends ExecutionControllerBase<SerialControllerType, P> {
  /**
   * 最後に実行した関数のpromise
   */
  private _tail: Promise<void> = Promise.resolve();

  /**
   * 完了していない呼び出し（実行中と待機中）の件数
   */
  private _unfinished = 0;

  constructor(options: SerialControllerOptions<P> = {}) {
    super({ ...options, type: SerialControllerType });
  }

  protected override _wrap<T extends SyncLooseFunction>(
    fn: T,
  ): WrappedFunction<T> {
    const execute = this._createExecutionFn(fn);
    return (scope: unknown, args: Parameters<T>): WrappedReturn<T> => {
      // 実行を待機する呼び出しを作成
      const { promise, run } = this._createPending(execute, scope, args);
      // 実行中かどうかで判断すると、前の関数の終了から次の開始までの間に
      // 呼ばれたものが追い越してしまうため、完了していない件数で判断する
      const isIdle = this._unfinished++ === 0;

      // 関数の中から同期的に呼ばれた場合も後ろにつながるよう、
      // 実行を始める前に _tail を差し替える
      const previous = this._tail;
      let finish!: () => void;
      this._tail = new Promise<void>((resolve) => {
        finish = resolve;
      });
      // runはrejectされないため、エラーでも次が続けられる
      const task = async () => {
        await run();
        this._unfinished--;
        finish();
      };

      if (isIdle) {
        task();
      } else {
        previous.then(task);
      }

      return promise;
    };
  }
}
