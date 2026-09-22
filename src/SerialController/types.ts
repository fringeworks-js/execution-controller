import type { ExecutionControllerBaseOptionsBase } from '../ExecutionControllerBase';
import type { CancelPolicy } from '../types';

export type SerialControllerOptions<P extends CancelPolicy = 'ignore'> =
  ExecutionControllerBaseOptionsBase<P>;
