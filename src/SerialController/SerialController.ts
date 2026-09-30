import type { SyncLooseFunction } from '@niche-works/types';
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

  constructor(options: SerialControllerOptions) {
    // @ts-ignore
    super({ ...options, type: SerialControllerType });
  }

  _wrap<T extends SyncLooseFunction>(fn: T): WrappedFunction<T> {
    const me = this;
    const execute = me._createExecutionFn(fn);
    return (scope: unknown, args: Parameters<T>): WrappedReturn<T> => {
      // 実行を待機する呼び出しを作成
      const { promise, run } = me._createPending(execute, scope, args);
      // _tail が解決済み（実行中でない）なら即座に実行を開始し、
      // そうでなければ then の中で実行する
      // runはrejectされないため、エラーでも次が続けられる
      me._tail = me.isExecuting ? me._tail.then(run) : run();

      return promise;
    };
  }
}
