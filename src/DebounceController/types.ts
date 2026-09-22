import type { ExecutionControllerBaseOptionsBase } from '../ExecutionControllerBase';
import type { CancelPolicy } from '../types';

export type DebounceControllerOptions<P extends CancelPolicy = 'ignore'> =
  ExecutionControllerBaseOptionsBase<P> & {
    /**
     * 待機時間
     * @default 240
     */
    wait?: number;

    /**
     * 直前に実行された関数が実行中の場合、実行完了後に実行するか
     *
     * - false: 完了を待たずに実行
     * - true: 完了を待ってから実行
     *
     * @default false
     */
    sequential?: boolean;
  };
