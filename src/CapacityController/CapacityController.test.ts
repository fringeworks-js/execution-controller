import CapacityController from '../CapacityController';
import { CANCEL } from '../constants';

describe('CapacityController', () => {
  it('デフォルトのリミット（4）が適用されること', async () => {
    const controller = new CapacityController({ id: 'test' });
    const promises: Promise<any>[] = [];

    // 4つまでは実行される
    for (let i = 0; i < 4; i++) {
      const wrapped = controller.wrap(
        async () => new Promise((res) => setTimeout(res, 10)),
      );
      promises.push(wrapped!());
    }
    expect(controller.executing).toBe(4);

    // 5つ目はキャンセルされる (デフォルト policy は ignore なので解決しない。ここでは resolve ポリシーでテスト)
    const controllerResolve = new CapacityController({
      id: 'test-resolve',
      limit: 1,
      cancelPolicy: 'resolve',
    });

    const p1 = controllerResolve.wrap(
      async () => new Promise((res) => setTimeout(res, 10)),
    )!();
    const p2 = controllerResolve.wrap(async () => 'ok')!();

    expect(await p2).toBe(CANCEL);
    await p1;
  });

  it('指定した上限数を超えた呼び出しを破棄すること', async () => {
    const limit = 2;
    const controller = new CapacityController({
      id: 'test',
      limit,
      cancelPolicy: 'resolve',
    });

    let resolve1: (v: string) => void;
    const task1 = controller.wrap(
      () =>
        new Promise<string>((res) => {
          resolve1 = res;
        }),
    )!();

    let resolve2: (v: string) => void;
    const task2 = controller.wrap(
      () =>
        new Promise<string>((res) => {
          resolve2 = res;
        }),
    )!();

    // 既に 2 つ実行中
    expect(controller.executing).toBe(2);

    // 3 つ目の呼び出し
    const task3 = controller.wrap(async () => 'ignored')!();

    // task3 は即座に CANCEL を返す
    expect(await task3).toBe(CANCEL);

    // 既存のタスクを終わらせる
    resolve1!('done1');
    resolve2!('done2');
    await Promise.all([task1, task2]);

    expect(controller.executing).toBe(0);
  });

  it('タスク完了後に新しいタスクが実行可能になること', async () => {
    const controller = new CapacityController({
      id: 'test',
      limit: 1,
      cancelPolicy: 'resolve',
    });

    const wrapped = controller.wrap(async (val: string) => val);

    // 1つ目
    const p1 = wrapped!('first');
    expect(controller.executing).toBe(1);
    expect(await p1).toBe('first');
    expect(controller.executing).toBe(0);

    // 1つ目が終わったので2つ目がいけるはず
    const p2 = wrapped!('second');
    expect(controller.executing).toBe(1);
    expect(await p2).toBe('second');
  });

  it('異なるインスタンスメソッドでも同一コントローラーなら制限がかかること', async () => {
    const controller = new CapacityController({
      id: 'test',
      limit: 1,
      cancelPolicy: 'resolve',
    });

    const instance = {
      name: 'A',
      async action() {
        await new Promise((res) => setTimeout(res, 20));
        return this.name;
      },
    };

    const wrapped = controller.wrapMethod(instance, 'action')!;

    const p1 = wrapped();
    const p2 = wrapped(); // 同時に呼ぶ

    expect(await p2).toBe(CANCEL);
    expect(await p1).toBe('A');
  });

  describe('limit の正規化', () => {
    it.each([
      [0, 4],
      [-1, 4],
      [NaN, 4],
      [2.7, 2],
    ])(
      'limit: %s の場合は %s 件まで同時に実行すること',
      async (limit, expected) => {
        const controller = new CapacityController({
          limit,
          cancelPolicy: 'resolve',
        });
        const wrapped = controller.wrap(() => new Promise<void>(() => {}));

        for (let i = 0; i < expected; i++) {
          wrapped();
        }
        expect(controller.executing).toBe(expected);
        expect(await wrapped()).toBe(CANCEL);
      },
    );
  });

  it('オプションを省略した場合は既定値で動作すること', () => {
    const controller = new CapacityController();
    const wrapped = controller.wrap(() => new Promise<void>(() => {}));

    for (let i = 0; i < 6; i++) {
      wrapped();
    }
    expect(controller.executing).toBe(4);
  });
});
