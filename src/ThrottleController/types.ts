import type { ExecutionControllerBaseOptionsBase } from '../ExecutionControllerBase';
import type { CancelPolicy } from '../types';

export type ThrottleControllerOptions<P extends CancelPolicy = 'ignore'> =
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
     * - 'both': 最初の呼び出しですぐに実行し、待機中の呼び出しは最後のものを待機時間の終わりに実行する
     * - 'start': 最初の呼び出しですぐに実行し、待機中の呼び出しはキャンセルする
     * - 'end': 最初の呼び出しから待機時間が経過したときに、最後の呼び出しを実行する
     *
     * 実行されなかった呼び出しはキャンセルされる
     *
     * @default 'both'
     */
    triggerAt?: 'both' | 'start' | 'end';
  };
