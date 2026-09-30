import type { SyncLooseFunction } from '@niche-works/types';
import type { MethodKeys, MethodType } from './_types';
import { CANCEL } from './constants';

/**
 * 関数の実行がキャンセルされた場合の動作
 *
 * - 'ignore': 何もしない
 * - 'resolve': 正常処理の戻り値にCANCELを返す
 * - 'reject': 例外処理の戻り値にCANCELを返す
 */
export type CancelPolicy = 'ignore' | 'resolve' | 'reject';

/**
 * 実行をコントロールされた関数の戻り値
 */
export type ControlledReturn<
  F extends SyncLooseFunction,
  P extends CancelPolicy,
> = P extends 'resolve' ? ReturnType<F> | typeof CANCEL : ReturnType<F>;

/**
 * 実行をコントロールされた関数
 */
export type ControlledFunction<
  F extends SyncLooseFunction,
  P extends CancelPolicy,
> = (...args: Parameters<F>) => Promise<ControlledReturn<F, P>>;

/**
 * 関数制御インターフェイス
 */
export interface ExecutionController<T extends string, P extends CancelPolicy> {
  /**
   * コントローラー種別
   */
  get type(): T;

  /**
   * ID
   */
  get id(): string;

  /**
   * 実行中の件数
   */
  get executing(): number;

  /**
   * 実行中か
   */
  get isExecuting(): boolean;

  /**
   * 実行状態の変更を購読する
   * @param listener
   * @returns 購読を解除する関数
   */
  subscribe(listener: () => void): () => void;

  /**
   * 実行を待機している呼び出しを全てキャンセルする
   */
  cancel(): void;

  /**
   * 関数をラップする
   * @param fn
   */
  wrap<T extends SyncLooseFunction>(
    fn: T | null | undefined,
  ): ControlledFunction<T, P> | null | undefined;

  /**
   * メソッドをラップする
   * @param instance
   * @param method
   */
  wrapMethod<I extends object, K extends MethodKeys<I>>(
    instance: I,
    method: K,
  ): ControlledFunction<MethodType<I, K>, P> | undefined;
}
