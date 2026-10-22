import type { SyncLooseFunction } from '@fringeworks/types';
import type { Pending, WrappedFunction, WrappedReturn } from '../_types';
import { CANCEL } from '../constants';
import ExecutionControllerBase from '../ExecutionControllerBase';
import type { CancelPolicy } from '../types';
import { DebounceControllerType } from './constants';
import type { DebounceControllerOptions } from './types';

/**
 * デバウンスコントローラー
 * 呼び出しが指定時間（wait）途切れるまでを1まとまりとし、triggerAtに従って最初か最後の呼び出しを実行する。\
 * 実行されなかった呼び出しはキャンセルされる
 */
export default class DebounceController<
  P extends CancelPolicy = 'ignore',
> extends ExecutionControllerBase<DebounceControllerType, P> {
  // 待ち時間
  private _wait: number;

  // 実行完了を待つか
  private _sequential: boolean;

  // 実行するタイミング
  private _triggerAt: NonNullable<DebounceControllerOptions['triggerAt']>;

  /**
   * 呼び出しが途切れたことを検知するタイマー。呼び出しが続いていなければundefined
   */
  private _timer: ReturnType<typeof setTimeout> | undefined;

  /**
   * 呼び出しが途切れたときに実行する呼び出し
   */
  private _trailing: Pending<SyncLooseFunction> | null = null;

  /**
   * 実行中のPromise（sequential用）
   */
  private _tail: Promise<void> = Promise.resolve();

  constructor(options: DebounceControllerOptions<P> = {}) {
    const { wait, sequential, triggerAt, ...rest } = options;
    super({ ...rest, type: DebounceControllerType });
    this._wait = wait ?? 240;
    this._sequential = sequential ?? false;
    this._triggerAt = triggerAt ?? 'end';
  }

  protected override _wrap<T extends SyncLooseFunction>(
    fn: T,
  ): WrappedFunction<T> {
    const execute = this._createExecutionFn(fn);

    return (scope: unknown, args: Parameters<T>): WrappedReturn<T> => {
      const isFirst = this._timer === undefined;
      // 呼び出しのたびに、途切れたと見なすまでの時間を延ばす
      clearTimeout(this._timer);
      this._timer = setTimeout(() => this._onQuiet(), this._wait);

      if (isFirst && this._triggerAt !== 'end') {
        // 呼び出しが途切れた後の最初の呼び出しはすぐに実行する
        const pending = this._createPending(execute, scope, args);
        this._run(pending);
        return pending.promise;
      }
      if (this._triggerAt === 'start') {
        return Promise.resolve(CANCEL);
      }
      // 最新の呼び出しを優先し、待機中の呼び出しはキャンセルする
      this._trailing?.cancel();
      const pending = this._createPending(execute, scope, args);
      this._trailing = pending;
      return pending.promise;
    };
  }

  /**
   * 実行を待機している呼び出しを全てキャンセルする
   *
   * 呼び出しのまとまりも終わらせるため、直後の呼び出しは新しいまとまりの最初として扱う
   */
  override cancel(): void {
    clearTimeout(this._timer);
    this._timer = undefined;
    this._trailing = null;
    super.cancel();
  }

  /**
   * 呼び出しが途切れたときの処理
   */
  private _onQuiet() {
    this._timer = undefined;
    const trailing = this._trailing;
    if (trailing) {
      this._trailing = null;
      this._run(trailing);
    }
  }

  /**
   * 呼び出しを実行する
   */
  private _run(pending: Pending<SyncLooseFunction>) {
    if (this._sequential) {
      // 前回の関数の実行が終わるのを待ってから、今回の実行を開始する
      // runはrejectされないため、前の実行がエラーでも次へ進む
      this._tail = this._tail.then(pending.run);
    } else {
      // sequentialがfalseの場合は、完了を待たずに即実行
      pending.run();
    }
  }
}
