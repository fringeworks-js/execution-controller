# @niche-works/execution-controller

`@niche-works/execution-controller` は関数の実行タイミングや同時実行数を高度に制御するためのニッチなライブラリです。\
Debounce, Throttle, Serial, Parallel, Exclusive など、\
実際の開発現場で頻出する実行制御パターンを統一されたインターフェースで提供します。

**[English README is available here](./README.md)**

## 特徴

- 統一された API: 全てのコントローラーが wrap および wrapMethod を持ち、既存の関数を簡単に拡張できます。
- 柔軟なキャンセルポリシー: 実行制限時の挙動を ignore (解決しない), reject (例外), resolve (CANCEL値を返す) から選択可能。
- TypeScript ネイティブ: 完全な型定義により、ラップされた関数の引数や戻り値の型が維持されます。
- ステートフル: 現在の実行数（executing）や実行中かどうかのフラグ（isExecuting）をリアルタイムに確認できます。

## インストール

```sh
npm install @niche-works/execution-controller
```

## コントローラー一覧

| コントローラー      | 概要                               | 主なユースケース                     |
| ------------------- | ---------------------------------- | ------------------------------------ |
| CapacityController  | 上限数を超えた呼び出しを破棄       | 同時リクエスト数の制限、負荷軽減     |
| ExclusiveController | 実行中は他の呼び出しを全て破棄     | 二重送信防止、モーダル表示制御       |
| SerialController    | 一度につき一つずつ順番に実行       | 順序が重要な保存処理、アニメーション |
| ParallelController  | 指定した上限数でキューイング実行   | 大量ファイルの並列アップロード制限   |
| DebounceController  | 最後の呼び出しから一定時間後に実行 | 入力補完、リサイズイベントの最適化   |
| ThrottleController  | 一度実行したら一定期間は実行を禁止 | スクロール監視、連打防止             |

## 使い方

### 基本的な関数のラップ

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

// 実行
const result1 = await fetchData(1); // 実行される
const result2 = await fetchData(2); // 実行される
const result3 = await fetchData(3); // 実行枠がいっぱいなので CANCEL が返る
```

### インスタンスメソッドのラップ

クラスのメソッドに対して this のコンテキストを維持したままラップできます。

```ts
import { DebounceController } from '@niche-works/execution-controller';

class SearchComponent {
  private controller = new DebounceController({
    id: 'search',
    wait: 300,
  });

  constructor() {
    // 自身のメソッドをラップして再定義
    this.handleInput = this.controller.wrapMethod(this, 'handleInput')!;
  }

  async handleInput(query: string) {
    console.log(`Searching for: ${query}`);
  }
}
```

## API

@niche-works/execution-controller が提供する各クラスおよびインターフェースの詳細リファレンスです。

### 全コントローラー共通

すべてのコントローラーは ExecutionControllerBase を継承しており、以下のプロパティとメソッドを共通で保持しています。

#### Constructor Options

| プロパティ      | 型                              | 説明                                       |
| --------------- | ------------------------------- | ------------------------------------------ |
| `id?`           | `string`                        | コントローラーのユニークID                 |
| `cancelPolicy?` | [`CancelPolicy`](#CancelPolicy) | 実行制限時の挙動（デフォルト: `'ignore'`） |

#### Properties (Read-only)

| プロパティ    | 型        | 説明                                          |
| ------------- | --------- | --------------------------------------------- |
| `type`        | `string`  | コントローラー種別を返します                  |
| `id`          | `string`  | コントローラーのIDを返します                  |
| `executing`   | `number`  | 現在実行中の関数の件数を返します              |
| `isExecuting` | `boolean` | 1件以上の関数が実行中であれば true を返します |

#### Methods

##### wrap

```ts
wrap<F>(fn: F): ControlledFunction<F, P>
```

関数をコントローラーの制御下にラップします。

- 引数: `fn`: ラップ対象の関数
- 戻り値: 制御ロジックが追加された新しい関数

##### wrapMethod

```ts
wrapMethod<I, K>(instance: I, method: K): ControlledFunction<...>
```

インスタンスのメソッドを、this コンテキストを維持したままラップします。

- 引数:
  - `instance`: メソッドを保持するオブジェクトインスタンス
  - `method`: メソッド名の文字列
- 戻り値: 制御ロジックが追加された新しい関数（this は instance に固定されます）

##### subscribe

```ts
subscribe(listener: () => void): () => void
```

実行状態（`executing` / `isExecuting`）の変更を購読します。\
関数の実行が開始・終了するたびに listener が呼ばれます。

- 引数: `listener`: 実行状態が変わった際に呼ばれる関数
- 戻り値: 購読を解除する関数

##### cancel

```ts
cancel(): void
```

実行を待機している呼び出し（キュー待ち、デバウンス待ちなど）を全てキャンセルします。\
キャンセルされた呼び出しは `cancelPolicy` に従って解決されます。既に実行中の関数は中断されません。

### コントローラー固有

#### CapacityController

実行上限を超えた呼び出しを即座に破棄します。

| プロパティ | 型       | 説明                            |
| ---------- | -------- | ------------------------------- |
| `limit?`   | `number` | 最大同時実行数（デフォルト: 4） |

#### ExclusiveController

実行中、他の呼び出しをすべて破棄します（CapacityController の limit: 1 相当）。\
※ 固有オプションはありません。

#### SerialController

すべての呼び出しをキューに蓄積し、一つずつ順番に実行します。\
※ 固有オプションはありません。

#### ParallelController

上限数まで並列実行し、それを超える分はキューに蓄積して空き次第実行します。

| プロパティ | 型       | 説明                            |
| ---------- | -------- | ------------------------------- |
| `limit?`   | `number` | 最大同時実行数（デフォルト: 4） |

#### DebounceController

連続した呼び出しをグループ化し、最後の呼び出しから指定時間経過後に実行します。

| プロパティ    | 型        | 説明                                                                       |
| ------------- | --------- | -------------------------------------------------------------------------- |
| `wait?`       | `number`  | 待機時間 (ms)（デフォルト: 240）                                           |
| `sequential?` | `boolean` | true の場合、前回の実行完了を待ってから次を開始します（デフォルト: false） |

#### ThrottleController

一度実行すると、指定時間は次の実行を禁止します。

| プロパティ    | 型        | 説明                                                                               |
| ------------- | --------- | ---------------------------------------------------------------------------------- |
| `wait?`       | `number`  | 禁止時間 (ms)（デフォルト: 240）                                                   |
| `sequential?` | `boolean` | true の場合、前回の実行完了を待ってから次の許可判定を行います（デフォルト: false） |

### 型 & 固定値

#### CancelPolicy

- `'ignore'`: Promise を解決せず、呼び出し側を待機状態（Pending）にします。
- `'reject'`: CANCEL を理由に Promise をリジェクトします。
- `'resolve'`: CANCEL を戻り値として Promise を解決します。

#### CANCEL (Symbol / Constant)

実行がスキップまたはキャンセルされた際に、返されるまたはスローされる値です。

- 返される場合: `cancelPolicy: 'resolve'`
- スローされる場合: `cancelPolicy: 'reject'`

## ライセンス

MIT
