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
