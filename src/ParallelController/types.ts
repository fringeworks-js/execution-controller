import type { ExecutionControllerBaseOptionsBase } from '../ExecutionControllerBase';
import type { CancelPolicy } from '../types';

export type ParallelControllerOptions<P extends CancelPolicy = 'ignore'> =
  ExecutionControllerBaseOptionsBase<P> & {
    /**
     * 同時実行の上限数
     * @default 4
     */
    limit?: number;
  };
