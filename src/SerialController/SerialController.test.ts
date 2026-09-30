import { CANCEL } from '../constants';
import SerialController from '../SerialController';

describe('SerialController', () => {
  it('複数の呼び出しが順番に（直列に）実行されること', async () => {
    const controller = new SerialController({
      id: 'test',
    });

    const results: number[] = [];
    const fn = async (id: number, ms: number) => {
      await new Promise((res) => setTimeout(res, ms));
      results.push(id);
      return id;
    };

    const wrapped = controller.wrap(fn);

    // 同時に3つ投下
    const p1 = wrapped!(1, 30);
    const p2 = wrapped!(2, 10);
    const p3 = wrapped!(3, 5);

    // 【重要】マイクロタスクを回して、1つ目のタスクの _start() を確実に実行させる
    await Promise.resolve();

    // これで executing が 1 になっているはず
    expect(controller.isExecuting).toBe(true);
    expect(controller.executing).toBe(1);

    await Promise.all([p1, p2, p3]);

    expect(results).toEqual([1, 2, 3]);
    expect(controller.executing).toBe(0);
  });

  it('前のタスクが完了するまで次のタスクが開始されないこと', async () => {
    const controller = new SerialController({
      id: 'test',
    });

    let isFirstFinished = false;
    const firstTask = controller.wrap(async () => {
      await new Promise((res) => setTimeout(res, 50));
      isFirstFinished = true;
    });

    const secondTask = controller.wrap(async () => {
      // 呼び出された瞬間に firstTask が終わっているかチェック
      return isFirstFinished;
    });

    const p1 = firstTask!();
    const p2 = secondTask!();

    const [_, secondResult] = await Promise.all([p1, p2]);

    // secondTask が始まったときには既に firstTask は終わっていたはず
    expect(secondResult).toBe(true);
  });

  it('途中のタスクが失敗しても、後続のタスクが実行されること', async () => {
    const controller = new SerialController({
      id: 'test',
    });

    const fn1 = vi.fn().mockRejectedValue(new Error('fail'));
    const fn2 = vi.fn().mockResolvedValue('ok');

    const wrapped1 = controller.wrap(fn1);
    const wrapped2 = controller.wrap(fn2);

    const p1 = wrapped1!();
    const p2 = wrapped2!();

    // 1つ目は失敗
    await expect(p1).rejects.toThrow('fail');

    // 2つ目は1つ目の失敗に関わらず実行され、成功する
    const result2 = await p2;
    expect(result2).toBe('ok');
    expect(fn2).toHaveBeenCalledTimes(1);
  });

  it('実行中のインスタンスメソッドの this が正しく保持されること', async () => {
    const controller = new SerialController({
      id: 'test',
    });

    const counter = {
      count: 0,
      async increment() {
        await new Promise((res) => setTimeout(res, 10));
        this.count++;
        return this.count;
      },
    };

    const wrapped = controller.wrapMethod(counter, 'increment')!;

    const [r1, r2, r3] = await Promise.all([wrapped(), wrapped(), wrapped()]);

    expect(r1).toBe(1);
    expect(r2).toBe(2);
    expect(r3).toBe(3);
    expect(counter.count).toBe(3);
  });

  describe('cancel', () => {
    it('待機中の呼び出しはキャンセルされ、実行中の関数は完了すること', async () => {
      const controller = new SerialController({
        id: 'test',
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
      const p3 = wrapped!(3);

      controller.cancel();
      expect(await p2).toBe(CANCEL);
      expect(await p3).toBe(CANCEL);

      resolveFirst!(1);
      expect(await p1).toBe(1);
      expect(fn).toHaveBeenCalledTimes(1);

      // キャンセル後の呼び出しは通常通り実行される
      expect(await wrapped!(4)).toBe(4);
    });
  });
});
