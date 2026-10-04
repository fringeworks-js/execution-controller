import type { SyncLooseFunction } from '@fringeworks/types';
import type {
  MethodKeys,
  MethodType,
  Pending,
  WrappedFunction,
  WrappedReturn,
} from '../_types';
import { CANCEL } from '../constants';
import type {
  CancelPolicy,
  ControlledFunction,
  ExecutionController,
} from '../types';
import type { ExecutionControllerBaseOptions } from './types';

// キャンセル処理用の関数
const CANCEL_FUNCTIONS = {
  reject: () => {
    // rejectの場合は、CANCELをthrow
    throw CANCEL;
  },
  resolve: () => {
    // resolveの場合は、そのままCANCELを返す
    return CANCEL;
  },
  ignore: () => {
    // ignoreの場合は、解決しないPromiseを返して呼び出し側を待機状態にする
    return new Promise(() => {});
  },
} as const;

/**
 * コントローラーの基底クラス
 */
export default abstract class ExecutionControllerBase<
  T extends string,
  P extends CancelPolicy = 'ignore',
> implements ExecutionController<T, P> {
  /**
   * コントローラー種別
   */
  protected _type: T;

  /**
   * ID
   */
  private _id: string;

  /**
   * キャンセル時の動作
   */
  private _cancelPolicy: CancelPolicy;

  /**
   * 実行している関数の件数
   */
  private _executing = 0;

  /**
   * 実行状態の変更を購読しているリスナー
   */
  private _listeners = new Set<() => void>();

  /**
   * 実行を待機している呼び出しのキャンセル処理
   */
  private _pendings = new Set<() => void>();

  constructor(options: ExecutionControllerBaseOptions<T, P>) {
    this._type = options.type;
    this._id = options.id;
    this._cancelPolicy = options.cancelPolicy || 'ignore';
  }

  /**
   * コントローラー種別
   */
  get type(): T {
    return this._type;
  }

  /**
   * ID
   */
  get id(): string {
    return this._id;
  }

  /**
   * 実行している関数・メソッドの件数
   */
  get executing(): number {
    return this._executing;
  }

  /**
   * 実行している関数・メソッドの有無
   */
  get isExecuting(): boolean {
    return this._executing > 0;
  }

  /**
   * 実行状態（executing, isExecuting）の変更を購読する
   *
   * @param listener 実行状態が変わった際に呼ばれる関数
   * @returns 購読を解除する関数
   */
  subscribe(listener: () => void): () => void {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  }

  /**
   * 実行を待機している呼び出しを全てキャンセルする
   *
   * キャンセルされた呼び出しはcancelPolicyに従って解決される。
   * 既に実行中の関数は中断されない。
   */
  cancel(): void {
    const pendings = [...this._pendings];
    this._pendings.clear();
    pendings.forEach((cancel) => cancel());
  }

  /**
   * 実行状態の変更をリスナーに通知する
   */
  private _notify() {
    this._listeners.forEach((listener) => listener());
  }

  /**
   * 実行の開始
   */
  protected _start() {
    this._executing++;
    this._notify();
  }

  /**
   * 実行の終了
   */
  protected _finish() {
    this._executing--;
    this._notify();
  }

  /**
   * 実行を待機する呼び出しを作成する共通処理
   *
   * `run` を呼ぶまで関数は実行されない。
   * それまでに `cancel` された場合、`promise` はCANCELで解決され、`run` を呼んでも実行されない。
   *
   * @param execute `_createExecutionFn` で作成した関数
   * @param scope スコープ
   * @param args 引数
   * @returns
   */
  protected _createPending<T extends SyncLooseFunction>(
    execute: (scope: unknown, args: unknown[]) => Promise<unknown>,
    scope: unknown,
    args: Parameters<T>,
  ): Pending<T> {
    let resolve!: (value: unknown) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<unknown>((res, rej) => {
      resolve = res;
      reject = rej;
    }) as WrappedReturn<T>;

    const cancel = () => {
      this._pendings.delete(cancel);
      resolve(CANCEL);
    };
    this._pendings.add(cancel);

    const run = async () => {
      // キャンセル済みであれば実行しない
      if (!this._pendings.delete(cancel)) {
        return;
      }
      await execute(scope, args).then(resolve, reject);
    };

    return { promise, run, cancel };
  }

  /**
   * 対象の関数を非同期で実行する関数を作成する共通処理
   *
   * @param fn 対象の関数
   * @returns
   */
  protected _createExecutionFn<T extends SyncLooseFunction>(fn: T) {
    // 開始終了を捕捉できる非同期の関数
    return async (scope: unknown, args: unknown[]) => {
      try {
        this._start();
        return (await fn.apply(scope, args)) as WrappedReturn<T>;
      } finally {
        this._finish();
      }
    };
  }

  /**
   * cancelPolicyに従ってPromiseを解決する関数を作成する共通処理
   *
   * `wrap` と `wrapMethod` でcancelPolicyの処理が重複しないよう切り出したもの。
   * scopeがnullの場合は呼び出し時点の`this`をscopeとして使用する。
   *
   * @param wrapedFn ラップ済みの関数
   * @param scope 固定するスコープ。nullの場合は呼び出し時点のthisを使用する
   * @returns
   */
  private _applyCancelPolicy<T extends SyncLooseFunction>(
    wrapedFn: WrappedFunction<T>,
    scope?: unknown | null,
  ): ControlledFunction<T, P> {
    const cancelFn = CANCEL_FUNCTIONS[this._cancelPolicy];

    return async function (
      this: unknown,
      ...args: Parameters<T>
    ): Promise<any> {
      const result = await wrapedFn(scope !== undefined ? scope : this, args);

      if (result === CANCEL) {
        return cancelFn();
      } else {
        return result;
      }
    };
  }

  /**
   * 関数をラップする
   *
   * @param fn
   * @returns
   */
  wrap<T extends SyncLooseFunction>(
    fn: T | null | undefined,
  ): ControlledFunction<T, P> | undefined {
    if (!fn) {
      return undefined;
    }

    return this._applyCancelPolicy(this._wrap(fn));
  }

  /**
   * インスタンスのメソッドをラップする
   *
   * `wrap` と異なりscopeをinstanceに固定するため、
   * ユーザーがbindを意識する必要がない。
   *
   * @param instance メソッドを持つインスタンス
   * @param method メソッド名
   * @returns
   */
  wrapMethod<I extends object, K extends MethodKeys<I>>(
    instance: I,
    method: K,
  ): ControlledFunction<MethodType<I, K>, P> | undefined {
    const fn = instance[method];
    if (typeof fn !== 'function') {
      return undefined;
    }

    // scopeをinstanceに固定することで、メソッドのthisが失われない
    return this._applyCancelPolicy(
      this._wrap(fn as SyncLooseFunction),
      instance,
    ) as ControlledFunction<MethodType<I, K>, P>;
  }

  /**
   * 関数をラップする
   * @param fn
   */
  protected abstract _wrap<T extends SyncLooseFunction>(
    fn: T,
  ): WrappedFunction<T>;
}
