import { CANCEL } from '../constants';
import ParallelController from '../ParallelController';

describe('ParallelController', () => {
  it('デフォルト', async () => {
    const controller = new ParallelController({
      id: 'test',
    });

    const fn = vi.fn(() => new Promise((res) => setTimeout(res, 50)));
    const wrapped = controller.wrap(fn);

    // 5つ同時に呼び出す
    const p1 = wrapped!();
    const p2 = wrapped!();
    const p3 = wrapped!();
    const p4 = wrapped!();
    const p5 = wrapped!();

    // 即座に確認（4つだけが実行中で、1つはキュー待ち）
    expect(controller.executing).toBe(4);
    expect(fn).toHaveBeenCalledTimes(4);

    await Promise.all([p1, p2, p3, p4, p5]);
    expect(controller.executing).toBe(0);
    expect(fn).toHaveBeenCalledTimes(5);
  });

  it('指定された上限数（limit）まで並列実行できること', async () => {
    const limit = 3;
    const controller = new ParallelController({
      id: 'test',
      limit,
    });

    const fn = vi.fn(() => new Promise((res) => setTimeout(res, 50)));
    const wrapped = controller.wrap(fn);

    // 5つ同時に呼び出す
    const p1 = wrapped!();
    const p2 = wrapped!();
    const p3 = wrapped!();
    const p4 = wrapped!();
    const p5 = wrapped!();

    // 即座に確認（3つだけが実行中で、2つはキュー待ち）
    expect(controller.executing).toBe(limit);
    expect(fn).toHaveBeenCalledTimes(limit);

    await Promise.all([p1, p2, p3, p4, p5]);
    expect(controller.executing).toBe(0);
    expect(fn).toHaveBeenCalledTimes(5);
  });

  it('タスクが完了するたびにキューから次のタスクが開始されること', async () => {
    const controller = new ParallelController({
      id: 'test',
      limit: 1,
    });

    let resolveFirst: (v: string) => void;
    const p1 = controller.wrap(
      () =>
        new Promise<string>((res) => {
          resolveFirst = res;
        }),
    )!();

    const fnSecond = vi.fn().mockResolvedValue('second');
    const p2 = controller.wrap(fnSecond)!();

    // まだ p1 が実行中なので p2 は呼ばれていない
    expect(controller.executing).toBe(1);
    expect(fnSecond).not.toHaveBeenCalled();

    // p1 を完了させる
    resolveFirst!('first');
    expect(await p1).toBe('first');

    // p1 完了後に p2 が自動で開始される
    const result2 = await p2;
    expect(result2).toBe('second');
    expect(fnSecond).toHaveBeenCalledTimes(1);
  });

  it('タスクがエラーになっても後続のタスクが実行されること', async () => {
    const controller = new ParallelController({
      id: 'test',
      limit: 1,
    });

    const p1 = controller.wrap(() => Promise.reject(new Error('fail')))!();
    const p2 = controller.wrap(() => Promise.resolve('ok'))!();

    // p1 は失敗する
    await expect(p1).rejects.toThrow('fail');

    // p1 失敗後も p2 は正常に実行される
    expect(await p2).toBe('ok');
    expect(controller.executing).toBe(0);
  });

  it('複数のタスクが完了した際に一気に枠が埋まること', async () => {
    const controller = new ParallelController({
      id: 'test',
      limit: 2,
    });

    // 同時に 4 つ投入
    const tasks = [
      controller.wrap(() => new Promise((res) => setTimeout(res, 20)))!(),
      controller.wrap(() => new Promise((res) => setTimeout(res, 20)))!(),
      controller.wrap(() => new Promise((res) => setTimeout(res, 20)))!(),
      controller.wrap(() => new Promise((res) => setTimeout(res, 20)))!(),
    ];

    expect(controller.executing).toBe(2);

    await Promise.all(tasks);
    expect(controller.executing).toBe(0);
  });

  it('スコープと引数が正しく引き継がれること', async () => {
    const controller = new ParallelController({
      id: 'test',
      limit: 1,
    });

    const obj = {
      prefix: 'Hello',
      async greet(name: string) {
        return `${this.prefix} ${name}`;
      },
    };

    const wrapped = controller.wrapMethod(obj, 'greet')!;
    const result = await wrapped('World');

    expect(result).toBe('Hello World');
  });

  describe('cancel', () => {
    it('キュー待ちの呼び出しはキャンセルされ、実行中の関数は完了すること', async () => {
      const controller = new ParallelController({
        id: 'test',
        limit: 1,
        cancelPolicy: 'resolve',
      });

      let resolveFirst: (value: number) => void;
      const fn = vi.fn((n: number) =>
        n === 1
          ? new Promise<number>((resolve) => (resolveFirst = resolve))
          : Promise.resolve(n),
      );
      const wrapped = controller.wrap(fn);

      const p1 = wrapped!(1);
      const p2 = wrapped!(2);

      controller.cancel();
      expect(await p2).toBe(CANCEL);

      resolveFirst!(1);
      expect(await p1).toBe(1);
      expect(fn).toHaveBeenCalledTimes(1);

      // キャンセル後の呼び出しは通常通り実行される
      expect(await wrapped!(3)).toBe(3);
    });
  });
});
