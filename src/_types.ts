import type { SyncLooseFunction } from '@niche-works/types';
import { CANCEL } from './constants';

/**
 * オブジェクトのメソッドのキーのみを抽出する
 */
export type MethodKeys<T extends object> = {
  [K in keyof T]: T[K] extends SyncLooseFunction ? K : never;
}[keyof T];

/**
 * メソッドの型を取得する
 */
export type MethodType<
  T extends object,
  K extends keyof T,
> = T[K] extends SyncLooseFunction ? T[K] : never;

/**
 * コントローラー種別毎の処理でラップされた関数の戻り値(promise)
 */
export type WrappedReturn<T extends SyncLooseFunction> =
  | Promise<ReturnType<T>>
  | Promise<typeof CANCEL>;

/**
 * コントローラー種別毎の処理でラップされた関数
 */
export type WrappedFunction<T extends SyncLooseFunction> = (
  scope: unknown,
  args: Parameters<T>,
) => WrappedReturn<T>;

/**
 * 実行を待機している呼び出し
 */
export type Pending<T extends SyncLooseFunction> = {
  /**
   * 呼び出しの結果
   */
  promise: WrappedReturn<T>;

  /**
   * 実行する。キャンセル済みの場合は実行しない\
   * 返却されるpromiseは実行の完了で解決され、rejectされることはない
   */
  run: () => Promise<void>;

  /**
   * この呼び出しのみをキャンセルする
   */
  cancel: () => void;
};
