import type { SyncLooseFunction } from '@fringeworks/types';
import type { Pending, WrappedFunction, WrappedReturn } from '../_types';
import { CANCEL } from '../constants';
import ExecutionControllerBase from '../ExecutionControllerBase';
import type { CancelPolicy } from '../types';
import { ThrottleControllerType } from './constants';
import type { ThrottleControllerOptions } from './types';

/**
 * 一定間隔実行コントローラー
 * 関数を実行してから指定時間（wait）が経過するまで次の実行を禁止する\
 * クールタイム中の呼び出しは、triggerAtに従って最後のものだけをクールタイム明けに実行するか、キャンセルする
 */
export default class ThrottleController<
  P extends CancelPolicy = 'ignore',
> extends ExecutionControllerBase<ThrottleControllerType, P> {
  // 待ち時間
  private _wait: number;

  // 実行完了を待つか
  private _sequential: boolean;

  // 実行するタイミング
  private _triggerAt: NonNullable<ThrottleControllerOptions['triggerAt']>;

  /**
   * クールタイム（実行禁止期間）のタイマー。クールタイム中でなければundefined
   */
  private _timer: ReturnType<typeof setTimeout> | undefined;

  /**
   * クールタイム明けに実行する呼び出し
   */
  private _trailing: Pending<SyncLooseFunction> | null = null;

  /**
   * 実行中のPromise（sequential用）
   */
  private _tail: Promise<void> = Promise.resolve();

  constructor(options: ThrottleControllerOptions<P> = {}) {
    const { wait, sequential, triggerAt, ...rest } = options;
    super({ ...rest, type: ThrottleControllerType });
    this._wait = wait ?? 240;
    this._sequential = sequential ?? false;
    this._triggerAt = triggerAt ?? 'both';
  }

  /**
   * 関数をラップする
   * 実行されなかった呼び出しは CANCEL で解決される
   */
  protected override _wrap<T extends SyncLooseFunction>(
    fn: T,
  ): WrappedFunction<T> {
    const execute = this._createExecutionFn(fn);

    return (scope: unknown, args: Parameters<T>): WrappedReturn<T> => {
      if (this._timer === undefined) {
        // クールタイム外の最初の呼び出し
        const pending = this._createPending(execute, scope, args);
        if (this._triggerAt === 'end') {
          this._trailing = pending;
        } else {
          this._run(pending);
        }
        this._startCooldown();
        return pending.promise;
      }

      // クールタイム中の呼び出し
      if (this._triggerAt === 'start') {
        return Promise.resolve(CANCEL);
      }
      // 最後の呼び出しだけをクールタイム明けに実行する
      this._trailing?.cancel();
      const pending = this._createPending(execute, scope, args);
      this._trailing = pending;
      return pending.promise;
    };
  }

  /**
   * 実行を待機している呼び出しを全てキャンセルする
   *
   * 実行の間隔を保つため、クールタイムは終わらせない
   */
  override cancel(): void {
    this._trailing = null;
    super.cancel();
  }

  /**
   * クールタイムを開始する
   */
  private _startCooldown() {
    this._timer = setTimeout(() => {
      this._timer = undefined;
      const trailing = this._trailing;
      if (trailing) {
        this._trailing = null;
        this._run(trailing);
        if (this._triggerAt === 'both') {
          // 実行から次の実行まで wait 以上空ける
          this._startCooldown();
        }
      }
    }, this._wait);
  }

  /**
   * 呼び出しを実行する
   */
  private _run(pending: Pending<SyncLooseFunction>) {
    if (this._sequential) {
      // 前の実行が終わるのを待って実行
      // runはrejectされないため、前の実行がエラーでも次へ進む
      this._tail = this._tail.then(pending.run);
    } else {
      // 即時実行
      pending.run();
    }
  }
}
