# @fringeworks/execution-controller

`@fringeworks/execution-controller` は関数の実行タイミングや同時実行数を高度に制御するための、誰かにとっては便利なライブラリです。\
Debounce, Throttle, Serial, Parallel, Exclusive など、\
実際の開発現場で頻出する実行制御パターンを統一されたインターフェースで提供します。

**[English README is available here](./README.md)**

## 特徴

- 統一された API: 全てのコントローラーが `wrap` および `wrapMethod` を持ち、既存の関数を簡単に拡張できます。
- 柔軟なキャンセルポリシー: 実行されなかった呼び出しの扱いを `ignore`（解決しない）、`reject`（例外）、`resolve`（`CANCEL` を返す）から選択できます。
- TypeScript ネイティブ: 完全な型定義により、ラップされた関数の引数や戻り値の型が維持されます。
- ステートフル: 現在の実行数（`executing`）や実行中かどうか（`isExecuting`）をリアルタイムに確認・購読できます。

## インストール

```sh
npm install @fringeworks/execution-controller
```

## コントローラー一覧

| コントローラー        | 概要                                                 | 主なユースケース                                 |
| --------------------- | ---------------------------------------------------- | ------------------------------------------------ |
| `CapacityController`  | 上限数を超えた呼び出しを破棄                         | 同時リクエスト数の制限、負荷軽減                 |
| `ExclusiveController` | 実行中は他の呼び出しを全て破棄                       | 二重送信防止、モーダル表示制御                   |
| `SerialController`    | 一度につき一つずつ順番に実行                         | 順序が重要な保存処理、アニメーション             |
| `ParallelController`  | 指定した上限数でキューイング実行                     | 大量ファイルの並列アップロード制限               |
| `DebounceController`  | 呼び出しが途切れた後（または最初の呼び出し時）に実行 | 入力補完、リサイズイベントの最適化               |
| `ThrottleController`  | 一定期間に最大1回まで実行                            | スクロール監視、連打防止（`triggerAt: 'start'`） |

## 使い方

### 関数のラップ

```ts
import { CapacityController } from '@fringeworks/execution-controller';

const controller = new CapacityController({
  limit: 2,
  cancelPolicy: 'resolve',
});

const fetchData = controller.wrap(async (id: number) => {
  return await api.get(`/item/${id}`);
});

// 同時に3件呼び出す
const [result1, result2, result3] = await Promise.all([
  fetchData(1), // 実行される
  fetchData(2), // 実行される
  fetchData(3), // 実行枠がいっぱいなので CANCEL が返る
]);
```

### インスタンスメソッドのラップ

クラスのメソッドに対して `this` のコンテキストを維持したままラップできます。

```ts
import { DebounceController } from '@fringeworks/execution-controller';

class SearchComponent {
  private controller = new DebounceController({ wait: 300 });

  constructor() {
    // 自身のメソッドをラップして再定義
    this.handleInput = this.controller.wrapMethod(this, 'handleInput')!;
  }

  async handleInput(query: string) {
    console.log(`Searching for: ${query}`);
  }
}
```

### 実行されなかった呼び出しの判定

`cancelPolicy: 'resolve'` の場合、実行されなかった呼び出しは `CANCEL` で解決されます。`isCanceled` で判定できます。

```ts
import {
  DebounceController,
  isCanceled,
} from '@fringeworks/execution-controller';

const controller = new DebounceController({ cancelPolicy: 'resolve' });
const search = controller.wrap(async (query: string) => api.search(query));

const result = await search('keyword');
if (isCanceled(result)) {
  // 後の呼び出しが優先され、この呼び出しは実行されなかった
  return;
}
```

### 複数の関数をまとめて制御する

実行の状態（実行数、待機中の呼び出し、タイマーなど）はコントローラーごとに持ちます。1つのコントローラーで複数の関数をラップすると、それらは1つのグループとして制御されます。

```ts
const controller = new ExclusiveController();

const save = controller.wrap(saveDocument);
const remove = controller.wrap(removeDocument);

save(); // 実行される
remove(); // save の実行中なので破棄される
```

`DebounceController` では、ある関数の呼び出しが別の関数の待機中の呼び出しをキャンセルします。関数ごとに独立して制御したい場合は、関数ごとにコントローラーを作ってください。

## API

### 全コントローラー共通

すべてのコントローラーは `ExecutionControllerBase` を継承しており、以下のプロパティとメソッドを共通で持ちます。

| プロパティ    | 型                    | 説明                                                  |
| ------------- | --------------------- | ----------------------------------------------------- |
| `type`        | `ControllerType`      | コントローラー種別（`'capacity'`・`'debounce'` など） |
| `id`          | `string \| undefined` | コンストラクターで指定した ID                         |
| `executing`   | `number`              | 現在実行中の関数の件数                                |
| `isExecuting` | `boolean`             | 1件以上の関数が実行中であれば `true`                  |

| メソッド                       | 説明                                                      |
| ------------------------------ | --------------------------------------------------------- |
| `wrap(fn)`                     | 関数をコントローラーの制御下にラップする                  |
| `wrapMethod(instance, method)` | インスタンスのメソッドを、`this` を固定したままラップする |
| `subscribe(listener)`          | 実行状態の変更を購読し、購読を解除する関数を返す          |
| `cancel()`                     | 実行を待機している呼び出しを全てキャンセルする            |

#### `constructor`

各コントローラーのコンストラクターは、次の共通のオプションと、コントローラー固有のオプションを受け取ります。オプションはすべて省略できます。

| オプション      | 型                              | 説明                                                 |
| --------------- | ------------------------------- | ---------------------------------------------------- |
| `id?`           | `string`                        | コントローラーの ID                                  |
| `cancelPolicy?` | [`CancelPolicy`](#cancelpolicy) | 実行されなかった呼び出しの扱い（既定値: `'ignore'`） |

#### `wrap`

```ts
wrap<F extends SyncLooseFunction>(fn: F): ControlledFunction<F, P>
wrap<F extends SyncLooseFunction>(
  fn: F | null | undefined,
): ControlledFunction<F, P> | undefined
```

関数をコントローラーの制御下にラップします。ラップした関数は常に Promise を返します。\
`fn` が `null`・`undefined` の場合は `undefined` を返します。

#### `wrapMethod`

```ts
wrapMethod<I extends object, K extends MethodKeys<I>>(
  instance: I,
  method: K,
): ControlledFunction<MethodType<I, K>, P> | undefined
```

インスタンスのメソッドを、`this` を `instance` に固定したままラップします。\
`instance[method]` が関数でない場合は `undefined` を返します。

| 引数       | 型  | 説明                       |
| ---------- | --- | -------------------------- |
| `instance` | `I` | メソッドを持つインスタンス |
| `method`   | `K` | メソッド名                 |

#### `subscribe`

```ts
subscribe(listener: () => void): () => void
```

実行状態（`executing` / `isExecuting`）の変更を購読し、購読を解除する関数を返します。\
関数の実行が開始・終了するたびに `listener` が呼ばれます。

`listener` が例外を投げても、関数の実行や結果には影響しません。すべての `listener` を呼んだあと、例外は非同期で投げ直されます（複数の場合は `AggregateError` にまとめます）。

#### `cancel`

```ts
cancel(): void
```

実行を待機している呼び出し（キュー待ち、デバウンス待ちなど）を全てキャンセルします。\
キャンセルされた呼び出しは `cancelPolicy` に従って解決されます。既に実行中の関数は中断されません。

### `CapacityController<P>`

同時実行数が上限に達している間の呼び出しを、即座に破棄します。

```ts
new CapacityController<P extends CancelPolicy = 'ignore'>(
  options?: CapacityControllerOptions<P>,
)
```

| オプション | 型       | 説明                                                                                                         |
| ---------- | -------- | ------------------------------------------------------------------------------------------------------------ |
| `limit?`   | `number` | 同時実行の上限数（既定値: `4`）。1未満や `NaN` の場合は既定値を使い、小数は切り捨てる。`Infinity` は上限なし |

### `ExclusiveController<P>`

実行中は、他の呼び出しをすべて破棄します（`CapacityController` の `limit: 1` 相当）。固有のオプションはありません。

```ts
new ExclusiveController<P extends CancelPolicy = 'ignore'>(
  options?: ExclusiveControllerOptions<P>,
)
```

### `SerialController<P>`

すべての呼び出しをキューに蓄積し、呼び出した順に一つずつ実行します。固有のオプションはありません。

```ts
new SerialController<P extends CancelPolicy = 'ignore'>(
  options?: SerialControllerOptions<P>,
)
```

### `ParallelController<P>`

上限数まで並列に実行し、それを超える分はキューに蓄積して、枠が空き次第呼び出した順に実行します。

```ts
new ParallelController<P extends CancelPolicy = 'ignore'>(
  options?: ParallelControllerOptions<P>,
)
```

| オプション | 型       | 説明                                                                                                         |
| ---------- | -------- | ------------------------------------------------------------------------------------------------------------ |
| `limit?`   | `number` | 同時実行の上限数（既定値: `4`）。1未満や `NaN` の場合は既定値を使い、小数は切り捨てる。`Infinity` は上限なし |

### `DebounceController<P>`

呼び出しが `wait` ミリ秒途切れるまでを1まとまりとし、`triggerAt` に従って最初か最後の呼び出しを実行します。実行されなかった呼び出しはキャンセルされます。

```ts
new DebounceController<P extends CancelPolicy = 'ignore'>(
  options?: DebounceControllerOptions<P>,
)
```

| オプション    | 型                           | 説明                                                                                                                                                                  |
| ------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `wait?`       | `number`                     | 待機時間 (ms)（既定値: `240`）                                                                                                                                        |
| `sequential?` | `boolean`                    | `true` の場合、前回の実行完了を待ってから次を開始する（既定値: `false`）                                                                                              |
| `triggerAt?`  | `'end' \| 'start' \| 'both'` | 実行するタイミング。`'end'`: 呼び出しが途切れたときに最後の呼び出し、`'start'`: 最初の呼び出しをすぐに、`'both'`: 両方（呼び出しが1回だけなら1回）（既定値: `'end'`） |

`cancel()` は呼び出しのまとまりも終わらせます。直後の呼び出しは新しいまとまりの最初として扱われます（`triggerAt: 'start'` / `'both'` ではすぐに実行されます）。

### `ThrottleController<P>`

`wait` ミリ秒に最大1回まで実行します。待機中の呼び出しは `triggerAt` に従って扱います。実行されなかった呼び出しはキャンセルされます。

```ts
new ThrottleController<P extends CancelPolicy = 'ignore'>(
  options?: ThrottleControllerOptions<P>,
)
```

| オプション    | 型                           | 説明                                                                                                                                                                                                                                                     |
| ------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `wait?`       | `number`                     | 実行の間隔 (ms)（既定値: `240`）                                                                                                                                                                                                                         |
| `sequential?` | `boolean`                    | `true` の場合、前回の実行完了を待ってから次を開始する（既定値: `false`）                                                                                                                                                                                 |
| `triggerAt?`  | `'both' \| 'start' \| 'end'` | 実行するタイミング。`'both'`: 最初の呼び出しをすぐに、待機中の最後の呼び出しを待機時間の終わりに、`'start'`: 最初の呼び出しをすぐに実行し、待機中の呼び出しはキャンセル、`'end'`: 最初の呼び出しから `wait` ミリ秒後に最後の呼び出し（既定値: `'both'`） |

`cancel()` は実行の間隔を保つため、クールタイム（待機時間）を終わらせません。直後の呼び出しは、クールタイムが明けるまで待ちます。

### `isCanceled`

```ts
isCanceled(value: unknown): value is typeof CANCEL
```

値が `CANCEL`（実行されなかった呼び出しの戻り値）かどうかを返します。

### 定数

| 定数             | 説明                                                                                                                                                      |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CANCEL`         | 実行されなかった呼び出しの値。`cancelPolicy: 'resolve'` では戻り値に、`'reject'` では例外になる。パッケージが複数のバージョンで読み込まれても同じ値になる |
| `ControllerType` | コントローラー種別の一覧（`ControllerType.debounce` など）。同名の型は種別の union                                                                        |

### 型

| 型                                      | 説明                                                                                                                     |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `CancelPolicy`                          | 実行されなかった呼び出しの扱い。下記を参照                                                                               |
| `ControlledFunction<F, P>`              | `wrap` / `wrapMethod` が返す関数。引数は `F` と同じで、`ControlledReturn<F, P>` の Promise を返す                        |
| `ControlledReturn<F, P>`                | ラップした関数の解決値。`F` の戻り値（Promise の場合はその解決値）で、`P` が `'resolve'` の場合は `typeof CANCEL` を含む |
| `ExecutionController<T, P>`             | 全コントローラー共通のインターフェイス                                                                                   |
| `ExecutionControllerBaseOptionsBase<P>` | 全コントローラー共通のオプション                                                                                         |
| `CapacityControllerOptions<P>` など     | 各コントローラーのオプション                                                                                             |

#### `CancelPolicy`

| 値          | 説明                                                           |
| ----------- | -------------------------------------------------------------- |
| `'ignore'`  | Promise を解決せず、呼び出し側を待機状態のままにする（既定値） |
| `'reject'`  | `CANCEL` を理由に Promise を reject する                       |
| `'resolve'` | `CANCEL` で Promise を解決する                                 |

## ライセンス

MIT
