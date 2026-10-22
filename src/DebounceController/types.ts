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

    /**
     * 実行するタイミング
     *
     * - 'end': 呼び出しが待機時間途切れたときに、最後の呼び出しを実行する
     * - 'start': 呼び出しが途切れた後の最初の呼び出しをすぐに実行する
     * - 'both': 'start' と 'end' の両方（最初の呼び出しだけの場合は1回だけ実行する）
     *
     * 実行されなかった呼び出しはキャンセルされる
     *
     * @default 'end'
     */
    triggerAt?: 'end' | 'start' | 'both';
  };
