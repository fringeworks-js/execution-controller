# @fringeworks/execution-controller

`@fringeworks/execution-controller` is a library some will find handy, for advanced control over function execution timing and concurrency.\
It provides common execution control patterns—such as Debounce, Throttle, Serial, Parallel, and Exclusive—through a unified interface suitable for real-world development.

**[日本語のREADMEはこちら](./README.ja.md)**

## Features

- **Unified API**: All controllers provide `wrap` and `wrapMethod`, allowing you to easily extend existing functions.
- **Flexible cancellation policies**: Choose how calls that are not executed are settled: `ignore` (never resolves), `reject` (throws `CANCEL`), or `resolve` (returns `CANCEL`).
- **TypeScript native**: Full type definitions ensure that argument and return types are preserved after wrapping.
- **Stateful**: You can inspect and subscribe to the current number of running executions (`executing`) and whether anything is running (`isExecuting`).

## Installation

```sh
npm install @fringeworks/execution-controller
```

## Controllers

| Controller            | Description                                        | Common Use Cases                                         |
| --------------------- | -------------------------------------------------- | -------------------------------------------------------- |
| `CapacityController`  | Discards calls exceeding a limit                   | Limiting concurrent requests, load control               |
| `ExclusiveController` | Discards all calls while executing                 | Preventing duplicate submissions, modals                 |
| `SerialController`    | Executes calls one by one in order                 | Ordered saves, animations                                |
| `ParallelController`  | Executes with concurrency limit + queue            | Controlled parallel uploads                              |
| `DebounceController`  | Executes after calls settle (or on the first call) | Autocomplete, resize optimization                        |
| `ThrottleController`  | Executes at most once per interval                 | Scroll handling, click throttling (`triggerAt: 'start'`) |

## Usage

### Wrapping a Function

```ts
import { CapacityController } from '@fringeworks/execution-controller';

const controller = new CapacityController({
  limit: 2,
  cancelPolicy: 'resolve',
});

const fetchData = controller.wrap(async (id: number) => {
  return await api.get(`/item/${id}`);
});

// Call three times at once
const [result1, result2, result3] = await Promise.all([
  fetchData(1), // executed
  fetchData(2), // executed
  fetchData(3), // returns CANCEL because the limit is reached
]);
```

### Wrapping an Instance Method

You can wrap class methods while preserving the `this` context.

```ts
import { DebounceController } from '@fringeworks/execution-controller';

class SearchComponent {
  private controller = new DebounceController({ wait: 300 });

  constructor() {
    // Wrap and redefine its own method
    this.handleInput = this.controller.wrapMethod(this, 'handleInput')!;
  }

  async handleInput(query: string) {
    console.log(`Searching for: ${query}`);
  }
}
```

### Detecting Calls That Were Not Executed

With `cancelPolicy: 'resolve'`, calls that are not executed resolve with `CANCEL`. Use `isCanceled` to check for it.

```ts
import {
  DebounceController,
  isCanceled,
} from '@fringeworks/execution-controller';

const controller = new DebounceController({ cancelPolicy: 'resolve' });
const search = controller.wrap(async (query: string) => api.search(query));

const result = await search('keyword');
if (isCanceled(result)) {
  // A later call took priority, so this call was not executed
  return;
}
```

### Controlling Multiple Functions Together

Each controller holds its own execution state (running count, waiting calls, timers, and so on). Functions wrapped by the same controller are controlled as one group.

```ts
const controller = new ExclusiveController();

const save = controller.wrap(saveDocument);
const remove = controller.wrap(removeDocument);

save(); // executed
remove(); // discarded because save is executing
```

With `DebounceController`, a call to one function cancels the waiting call of another. To control functions independently, create a controller for each function.

## API

### Common to All Controllers

All controllers extend `ExecutionControllerBase` and share the following properties and methods.

| Property      | Type                  | Description                                             |
| ------------- | --------------------- | ------------------------------------------------------- |
| `type`        | `ControllerType`      | Controller type (`'capacity'`, `'debounce'`, and so on) |
| `id`          | `string \| undefined` | ID passed to the constructor                            |
| `executing`   | `number`              | Number of currently executing functions                 |
| `isExecuting` | `boolean`             | `true` if at least one function is executing            |

| Method                         | Description                                                       |
| ------------------------------ | ----------------------------------------------------------------- |
| `wrap(fn)`                     | Wraps a function with the controller's execution control          |
| `wrapMethod(instance, method)` | Wraps an instance method, keeping `this` bound to the instance    |
| `subscribe(listener)`          | Subscribes to execution state changes and returns an unsubscriber |
| `cancel()`                     | Cancels all calls that are waiting to be executed                 |

#### `constructor`

Each controller's constructor takes the following common options plus controller-specific options. All options are optional.

| Option          | Type                            | Description                                                       |
| --------------- | ------------------------------- | ----------------------------------------------------------------- |
| `id?`           | `string`                        | Controller ID                                                     |
| `cancelPolicy?` | [`CancelPolicy`](#cancelpolicy) | How calls that are not executed are settled (default: `'ignore'`) |

#### `wrap`

```ts
wrap<F extends SyncLooseFunction>(fn: F): ControlledFunction<F, P>
wrap<F extends SyncLooseFunction>(
  fn: F | null | undefined,
): ControlledFunction<F, P> | undefined
```

Wraps a function with the controller's execution control. The wrapped function always returns a Promise.\
Returns `undefined` if `fn` is `null` or `undefined`.

#### `wrapMethod`

```ts
wrapMethod<I extends object, K extends MethodKeys<I>>(
  instance: I,
  method: K,
): ControlledFunction<MethodType<I, K>, P> | undefined
```

Wraps an instance method, keeping `this` bound to `instance`.\
Returns `undefined` if `instance[method]` is not a function.

| Parameter  | Type | Description                  |
| ---------- | ---- | ---------------------------- |
| `instance` | `I`  | Instance that has the method |
| `method`   | `K`  | Method name                  |

#### `subscribe`

```ts
subscribe(listener: () => void): () => void
```

Subscribes to changes in the execution state (`executing` / `isExecuting`) and returns a function that unsubscribes.\
`listener` is called whenever a function starts or finishes executing.

If `listener` throws, the execution and the result of the function are not affected. After all listeners are called, the error is rethrown asynchronously (multiple errors are combined into an `AggregateError`).

#### `cancel`

```ts
cancel(): void
```

Cancels all calls that are waiting to be executed (queued, debouncing, and so on).\
Canceled calls are settled according to `cancelPolicy`. Functions that are already executing are not interrupted.

### `CapacityController<P>`

Immediately discards calls made while the number of concurrent executions is at the limit.

```ts
new CapacityController<P extends CancelPolicy = 'ignore'>(
  options?: CapacityControllerOptions<P>,
)
```

| Option   | Type     | Description                                                                                                                                    |
| -------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `limit?` | `number` | Max concurrent executions (default: `4`). Values below 1 and `NaN` fall back to the default, decimals are truncated, `Infinity` means no limit |

### `ExclusiveController<P>`

Discards all other calls while one is executing (equivalent to `CapacityController` with `limit: 1`). It has no specific options.

```ts
new ExclusiveController<P extends CancelPolicy = 'ignore'>(
  options?: ExclusiveControllerOptions<P>,
)
```

### `SerialController<P>`

Queues all calls and executes them one by one in the order they were called. It has no specific options.

```ts
new SerialController<P extends CancelPolicy = 'ignore'>(
  options?: SerialControllerOptions<P>,
)
```

### `ParallelController<P>`

Executes calls in parallel up to the limit, queues the rest, and executes them in call order as slots become available.

```ts
new ParallelController<P extends CancelPolicy = 'ignore'>(
  options?: ParallelControllerOptions<P>,
)
```

| Option   | Type     | Description                                                                                                                                    |
| -------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `limit?` | `number` | Max concurrent executions (default: `4`). Values below 1 and `NaN` fall back to the default, decimals are truncated, `Infinity` means no limit |

### `DebounceController<P>`

Groups calls until there are no calls for `wait` ms, and executes the first or last call depending on `triggerAt`. Calls that are not executed are canceled.

```ts
new DebounceController<P extends CancelPolicy = 'ignore'>(
  options?: DebounceControllerOptions<P>,
)
```

| Option        | Type                         | Description                                                                                                                                                           |
| ------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `wait?`       | `number`                     | Delay in ms (default: `240`)                                                                                                                                          |
| `sequential?` | `boolean`                    | If `true`, waits for the previous execution to finish before starting the next (default: `false`)                                                                     |
| `triggerAt?`  | `'end' \| 'start' \| 'both'` | When to execute. `'end'`: the last call after calls settle; `'start'`: the first call immediately; `'both'`: both (once if there is only one call) (default: `'end'`) |

`cancel()` also ends the current group of calls. The next call is treated as the first call of a new group (it is executed immediately with `triggerAt: 'start'` / `'both'`).

### `ThrottleController<P>`

Executes at most once every `wait` ms. Calls during the interval are handled depending on `triggerAt`. Calls that are not executed are canceled.

```ts
new ThrottleController<P extends CancelPolicy = 'ignore'>(
  options?: ThrottleControllerOptions<P>,
)
```

| Option        | Type                         | Description                                                                                                                                                                                                                                                    |
| ------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `wait?`       | `number`                     | Interval in ms (default: `240`)                                                                                                                                                                                                                                |
| `sequential?` | `boolean`                    | If `true`, waits for the previous execution to finish before starting the next (default: `false`)                                                                                                                                                              |
| `triggerAt?`  | `'both' \| 'start' \| 'end'` | When to execute. `'both'`: the first call immediately, and the last call during the interval at its end; `'start'`: the first call immediately, canceling calls during the interval; `'end'`: the last call `wait` ms after the first call (default: `'both'`) |

`cancel()` does not end the cooldown, to keep the interval between executions. The next call waits until the cooldown is over.

### `isCanceled`

```ts
isCanceled(value: unknown): value is typeof CANCEL
```

Returns whether the value is `CANCEL` (the value of a call that was not executed).

### Constants

| Constant         | Description                                                                                                                                                                                                 |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CANCEL`         | Value of a call that was not executed. It is the return value with `cancelPolicy: 'resolve'` and the thrown value with `'reject'`. It is the same value even if multiple versions of the package are loaded |
| `ControllerType` | List of controller types (`ControllerType.debounce` and so on). The type of the same name is the union of the types                                                                                         |

### Types

| Type                                    | Description                                                                                                                                   |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `CancelPolicy`                          | How calls that are not executed are settled. See below                                                                                        |
| `ControlledFunction<F, P>`              | Function returned by `wrap` / `wrapMethod`. Takes the same arguments as `F` and returns a Promise of `ControlledReturn<F, P>`                 |
| `ControlledReturn<F, P>`                | Resolved value of a wrapped function: the return value of `F` (awaited if it is a Promise), including `typeof CANCEL` when `P` is `'resolve'` |
| `ExecutionController<T, P>`             | Interface common to all controllers                                                                                                           |
| `ExecutionControllerBaseOptionsBase<P>` | Options common to all controllers                                                                                                             |
| `CapacityControllerOptions<P>` etc.     | Options of each controller                                                                                                                    |

#### `CancelPolicy`

| Value       | Description                                                       |
| ----------- | ----------------------------------------------------------------- |
| `'ignore'`  | Leaves the Promise pending, so the caller keeps waiting (default) |
| `'reject'`  | Rejects the Promise with `CANCEL`                                 |
| `'resolve'` | Resolves the Promise with `CANCEL`                                |

## License

MIT
