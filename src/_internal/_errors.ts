/**
 * 溜めていた例外を1つにまとめる\
 * 1件ならそのまま、複数なら AggregateError にまとめる
 */
export function toError(
  errors: readonly unknown[],
  message = 'Multiple errors were thrown by listeners',
): unknown {
  return errors.length === 1 ? errors[0] : new AggregateError(errors, message);
}

/**
 * 溜めていた例外を、呼び出し元に影響しないよう非同期で投げ直す\
 * 未捕捉の例外として扱われる
 */
export function reportErrors(errors: readonly unknown[]): void {
  if (errors.length > 0) {
    const error = toError(errors);
    queueMicrotask(() => {
      throw error;
    });
  }
}
