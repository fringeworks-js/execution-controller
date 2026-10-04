import type { SyncLooseFunction } from '@fringeworks/types';
import type { WrappedFunction, WrappedReturn } from '../_types';
import { CANCEL } from '../constants';
import ExecutionControllerBase from '../ExecutionControllerBase';
import type { CancelPolicy } from '../types';
import { ExclusiveControllerType } from './constants';
import type { ExclusiveControllerOptions } from './types';

/**
 * 排他実行コントローラー\
 * 同時に一つの関数のみ実行を許可する\
 * すでに実行中の関数がある場合、新しく呼び出された関数は実行されず破棄される
 */
export default class ExclusiveController<
  P extends CancelPolicy = 'ignore',
> extends ExecutionControllerBase<ExclusiveControllerType, P> {
  constructor(options: ExclusiveControllerOptions<P>) {
    // @ts-ignore
    super({ ...options, type: ExclusiveControllerType });
  }

  _wrap<T extends SyncLooseFunction>(fn: T): WrappedFunction<T> {
    const me = this;
    const execute = me._createExecutionFn(fn);
    return (scope: unknown, args: Parameters<T>): WrappedReturn<T> => {
      // 実行しているものがあるかチェック
      if (me.isExecuting) {
        // あったらキャンセル
        return Promise.resolve(CANCEL);
      }

      // fnを非同期で呼び出す
      return execute(scope, args) as WrappedReturn<T>;
    };
  }
}
