import { CANCEL } from '../constants';
import ExclusiveController from '../ExclusiveController';

describe('ExclusiveController', () => {
  it('実行中に呼び出された場合、新しい呼び出しを破棄すること', async () => {
    const controller = new ExclusiveController({
      id: 'test',
      cancelPolicy: 'resolve',
    });

    let resolveTask: (val: string) => void;
    const taskPromise = new Promise<string>((res) => {
      resolveTask = res;
    });

    const fn = vi.fn(() => taskPromise);
    const wrapped = controller.wrap(fn);

    // 1回目の呼び出し（実行開始）
    const p1 = wrapped!();
    expect(controller.isExecuting).toBe(true);
    expect(fn).toHaveBeenCalledTimes(1);

    // 2回目の呼び出し（実行中のため破棄されるはず）
    const p2 = wrapped!();
    expect(await p2).toBe(CANCEL);
    expect(fn).toHaveBeenCalledTimes(1); // 2回目は呼ばれていない

    // 1回目を完了させる
    resolveTask!('done');
    expect(await p1).toBe('done');
    expect(controller.isExecuting).toBe(false);
  });

  it('実行完了後は再び呼び出しが可能になること', async () => {
    const controller = new ExclusiveController({
      id: 'test',
    });

    const fn = vi.fn(async (val: string) => val);
    const wrapped = controller.wrap(fn);

    // 1回目
    const res1 = await wrapped!('first');
    expect(res1).toBe('first');

    // 2回目（1回目が終わっているので実行できるはず）
    const res2 = await wrapped!('second');
    expect(res2).toBe('second');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('エラーが発生しても実行中フラグが正しくリセットされ、次が実行できること', async () => {
    const controller = new ExclusiveController({
      id: 'test',
    });

    const fn = vi.fn().mockRejectedValue(new Error('fail'));
    const wrapped = controller.wrap(fn);

    await expect(wrapped!()).rejects.toThrow('fail');
    expect(controller.isExecuting).toBe(false);

    // エラー後も次が実行できること
    fn.mockResolvedValue('recovered');
    expect(await wrapped!()).toBe('recovered');
  });

  it('インスタンスメソッドに対しても排他制御が効くこと', async () => {
    const controller = new ExclusiveController({
      id: 'test',
      cancelPolicy: 'resolve',
    });

    const actor = {
      count: 0,
      async play() {
        await new Promise((res) => setTimeout(res, 50));
        this.count++;
        return this.count;
      },
    };

    const wrapped = controller.wrapMethod(actor, 'play')!;

    const p1 = wrapped();
    const p2 = wrapped(); // 即座に呼ぶ

    const [res1, res2] = await Promise.all([p1, p2]);

    expect(res1).toBe(1);
    expect(res2).toBe(CANCEL);
    expect(actor.count).toBe(1);
  });

  it('オプションを省略した場合は既定値で動作すること', async () => {
    const controller = new ExclusiveController();
    const fn = vi.fn(async () => 'ok');

    expect(await controller.wrap(fn)()).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
