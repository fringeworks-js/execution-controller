# @niche-works/execution-controller

`@niche-works/execution-controller` is a niche library for advanced control over function execution timing and concurrency.  
It provides common execution control patterns—such as Debounce, Throttle, Serial, Parallel, and Exclusive—through a unified interface suitable for real-world development.

**[日本語版 README はこちら](./README.ja.md)**

## Features

- **Unified API**: All controllers provide `wrap` and `wrapMethod`, allowing you to easily extend existing functions.
- **Flexible cancellation policies**: Choose behavior when execution limits are exceeded:
  - `ignore` (never resolves)
  - `reject` (throws an error)
  - `resolve` (returns a `CANCEL` value)
- **TypeScript native**: Full type definitions ensure that argument and return types are preserved after wrapping.
- **Stateful**: You can inspect the current number of running executions (`executing`) and whether anything is running (`isExecuting`) in real time.

## Installation

```sh
npm install @niche-works/execution-controller
```

## Controllers

| Controller          | Description                             | Common Use Cases                           |
| ------------------- | --------------------------------------- | ------------------------------------------ |
| CapacityController  | Discards calls exceeding a limit        | Limiting concurrent requests, load control |
| ExclusiveController | Discards all calls while executing      | Preventing duplicate submissions, modals   |
| SerialController    | Executes calls one by one in order      | Ordered saves, animations                  |
| ParallelController  | Executes with concurrency limit + queue | Controlled parallel uploads                |
| DebounceController  | Executes after inactivity delay         | Autocomplete, resize optimization          |
| ThrottleController  | Blocks execution for a fixed interval   | Scroll handling, click throttling          |

## Usage

### Wrapping a Function

```ts
import { CapacityController } from '@niche-works/execution-controller';

const controller = new CapacityController({
  id: 'api-limit',
  limit: 2,
  cancelPolicy: 'resolve',
});

const fetchData = controller.wrap(async (id: number) => {
  return await api.get(`/item/${id}`);
});

// Execution
const result1 = await fetchData(1); // executed
const result2 = await fetchData(2); // executed
const result3 = await fetchData(3); // returns CANCEL due to limit
```

### Wrapping an Instance Method

You can wrap class methods while preserving the `this` context.

```ts
import { DebounceController } from '@niche-works/execution-controller';

class SearchComponent {
  private controller = new DebounceController({
    id: 'search',
    wait: 300,
  });

  constructor() {
    this.handleInput = this.controller.wrapMethod(this, 'handleInput')!;
  }

  async handleInput(query: string) {
    console.log(`Searching for: ${query}`);
  }
}
```

## API

Detailed reference for classes and interfaces provided by `@niche-works/execution-controller`.

### Common to All Controllers

All controllers extend `ExecutionControllerBase` and share the following:

#### Constructor Options

| Property        | Type                            | Description                                                 |
| --------------- | ------------------------------- | ----------------------------------------------------------- |
| `id?`           | `string`                        | Unique controller ID                                        |
| `cancelPolicy?` | [`CancelPolicy`](#cancelpolicy) | Behavior when execution is restricted (default: `'ignore'`) |

#### Properties (Read-only)

| Property      | Type      | Description                                  |
| ------------- | --------- | -------------------------------------------- |
| `type`        | `string`  | Controller type                              |
| `id`          | `string`  | Controller ID                                |
| `executing`   | `number`  | Number of currently executing functions      |
| `isExecuting` | `boolean` | `true` if at least one function is executing |

#### Methods

##### wrap

```ts
wrap<F>(fn: F): ControlledFunction<F, P>
```

Wraps a function with controller logic.

- **Argument**: `fn` — function to wrap
- **Returns**: a new function with execution control applied

##### wrapMethod

```ts
wrapMethod<I, K>(instance: I, method: K): ControlledFunction<...>
```

Wraps an instance method while preserving its `this` context.

- **Arguments**:
  - `instance`: object instance containing the method
  - `method`: method name (string)

- **Returns**: wrapped function with `this` bound to the instance

---

### Controller-Specific Options

#### CapacityController

Discards calls that exceed the execution limit.

| Property | Type     | Description                            |
| -------- | -------- | -------------------------------------- |
| `limit?` | `number` | Max concurrent executions (default: 4) |

#### ExclusiveController

Discards all other calls while one is executing (equivalent to `limit: 1`).
_No additional options._

#### SerialController

Queues all calls and executes them sequentially.
_No additional options._

#### ParallelController

Executes up to a limit in parallel, queues the rest.

| Property | Type     | Description                            |
| -------- | -------- | -------------------------------------- |
| `limit?` | `number` | Max concurrent executions (default: 4) |

#### DebounceController

Groups rapid calls and executes after a delay from the last call.

| Property      | Type      | Description                                                                           |
| ------------- | --------- | ------------------------------------------------------------------------------------- |
| `wait?`       | `number`  | Delay in ms (default: 240)                                                            |
| `sequential?` | `boolean` | If true, waits for previous execution to finish before starting next (default: false) |

#### ThrottleController

Allows execution once, then blocks for a specified interval.

| Property      | Type      | Description                                                                         |
| ------------- | --------- | ----------------------------------------------------------------------------------- |
| `wait?`       | `number`  | Block duration in ms (default: 240)                                                 |
| `sequential?` | `boolean` | If true, waits for previous execution to finish before re-enabling (default: false) |

---

### Types & Constants

#### CancelPolicy

- `'ignore'`: Leaves the Promise pending (never resolves)
- `'reject'`: Rejects the Promise with `CANCEL`
- `'resolve'`: Resolves the Promise with `CANCEL`

#### CANCEL (Symbol / Constant)

Returned or thrown when execution is skipped or canceled:

- Returned when `cancelPolicy: 'resolve'`
- Thrown when `cancelPolicy: 'reject'`

## License

MIT
