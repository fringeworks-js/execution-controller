import type { ExecutionControllerBaseOptionsBase } from '../ExecutionControllerBase';
import type { CancelPolicy } from '../types';

export type ExclusiveControllerOptions<P extends CancelPolicy = 'ignore'> =
  ExecutionControllerBaseOptionsBase<P>;
