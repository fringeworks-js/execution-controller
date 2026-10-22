import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CANCEL } from '../constants';
import ThrottleController from '../ThrottleController';

describe('ThrottleController', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('デフォルト（wait: 240, triggerAt: both）', async () => {
    const controller = new ThrottleController({
      id: 'test',
      cancelPolicy: 'resolve',
    });

    const fn = vi.fn(async (value: string) => value);
    const wrapped = controller.wrap(fn)!;

    // 1回目はすぐに実行
    const p1 = wrapped('a');
    await vi.advanceTimersByTimeAsync(0);
    expect(fn).toHaveBeenCalledTimes(1);

    // クールタイム中の呼び出しは最後のものだけが残る
    await vi.advanceTimersByTimeAsync(50);
    const p2 = wrapped('b');
    const p3 = wrapped('c');
    expect(await p2).toBe(CANCEL);
    expect(fn).toHaveBeenCalledTimes(1);

    // クールタイム明け（240ms）に最後の呼び出しを実行
    await vi.advanceTimersByTimeAsync(189);
    expect(fn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fn).toHaveBeenCalledTimes(2);

    expect(await p1).toBe('a');
    expect(await p3).toBe('c');
  });

  describe('triggerAt オプション', () => {
    it('both: クールタイム明けに実行した後も、次の実行まで wait 空けること', async () => {
      const controller = new ThrottleController({ wait: 100 });
      const fn = vi.fn();
      const wrapped = controller.wrap(fn)!;

      wrapped(); // 0ms: 即時実行
      await vi.advanceTimersByTimeAsync(50);
      wrapped(); // 保留
      await vi.advanceTimersByTimeAsync(50);
      expect(fn).toHaveBeenCalledTimes(2); // 100ms: 保留分を実行

      await vi.advanceTimersByTimeAsync(1);
      wrapped(); // 前回の実行から wait 経っていないので保留
      await vi.advanceTimersByTimeAsync(0);
      expect(fn).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(99);
      expect(fn).toHaveBeenCalledTimes(3); // 200ms: 保留分を実行
    });

    it('both: クールタイム中に呼び出しが無ければ、次の呼び出しはすぐに実行されること', async () => {
      const controller = new ThrottleController({ wait: 100 });
      const fn = vi.fn();
      const wrapped = controller.wrap(fn)!;

      wrapped();
      await vi.advanceTimersByTimeAsync(100);
      wrapped();
      await vi.advanceTimersByTimeAsync(0);
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('end: 最初の呼び出しから wait 後に、最後の呼び出しを実行すること', async () => {
      const controller = new ThrottleController({
        wait: 100,
        triggerAt: 'end',
        cancelPolicy: 'resolve',
      });
      const fn = vi.fn(async (value: string) => value);
      const wrapped = controller.wrap(fn)!;

      const p1 = wrapped('a');
      await vi.advanceTimersByTimeAsync(0);
      expect(fn).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(50);
      const p2 = wrapped('b');
      expect(await p1).toBe(CANCEL);

      await vi.advanceTimersByTimeAsync(50);
      expect(fn).toHaveBeenCalledTimes(1);
      expect(await p2).toBe('b');

      // 次の呼び出しから新しい期間が始まる
      const p3 = wrapped('c');
      await vi.advanceTimersByTimeAsync(99);
      expect(fn).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(await p3).toBe('c');
    });
  });

  it('triggerAt: start の場合、初回実行は即座に行われ、指定時間（wait）内は次の呼び出しがキャンセルされること', async () => {
    const controller = new ThrottleController({
      id: 'test',
      wait: 100,
      cancelPolicy: 'resolve',
      triggerAt: 'start',
    });

    const fn = vi.fn().mockResolvedValue('ok');
    const wrapped = controller.wrap(fn);

    // 1回目の実行
    const p1 = wrapped!();
    await vi.runAllTicks(); // 非同期開始を待機
    expect(fn).toHaveBeenCalledTimes(1);

    // クールタイム中の2回目
    vi.advanceTimersByTime(50);
    const p2 = wrapped!();
    expect(await p2).toBe(CANCEL);
    expect(fn).toHaveBeenCalledTimes(1); // 増えていないこと

    // クールタイム明けの3回目
    vi.advanceTimersByTime(51);
    wrapped!();
    await vi.runAllTicks();
    expect(fn).toHaveBeenCalledTimes(2);

    expect(await p1).toBe('ok');
  });

  describe('sequential オプション', () => {
    it('sequential: false (デフォルト) の場合、前回の完了を待たずに即時実行されること', async () => {
      const controller = new ThrottleController({
        id: 'test',
        wait: 100,
        sequential: false,
      });

      let executingCount = 0;
      const fn = async () => {
        executingCount++;
        // 実行に150msかかる（waitの100msより長い）
        await new Promise((res) => setTimeout(res, 150));
        executingCount--;
      };

      const wrapped = controller.wrap(fn);

      // 1回目実行開始
      wrapped!();
      vi.advanceTimersByTime(10);
      await vi.runAllTicks();
      expect(executingCount).toBe(1);

      // wait(100ms)経過後に2回目実行
      vi.advanceTimersByTime(100);
      wrapped!();
      vi.advanceTimersByTime(10);
      await vi.runAllTicks();

      // sequential: false なので、1回目が終わる(150ms)前に2回目が始まり、並行数が2になる
      expect(executingCount).toBe(2);

      vi.advanceTimersByTime(200);
      await vi.runAllTicks();
      expect(executingCount).toBe(0);
    });

    it('sequential: true の場合、前回の実行完了を待ってから開始されること', async () => {
      const controller = new ThrottleController({
        id: 'test',
        wait: 50,
        sequential: true,
      });

      let executingCount = 0;
      const results: string[] = [];
      const fn = async (name: string) => {
        executingCount++;
        // 実行に100ms
        await new Promise((res) => setTimeout(res, 100));
        results.push(name);
        executingCount--;
      };

      const wrapped = controller.wrap(fn);

      // 1回目実行開始
      wrapped!('first');
      await vi.advanceTimersByTimeAsync(10);
      expect(executingCount).toBe(1);

      // 50ms後（クールタイム明け）に2回目を呼ぶ
      await vi.advanceTimersByTimeAsync(50);
      const p2 = wrapped!('second');
      await vi.advanceTimersByTimeAsync(0);

      // 1回目が終わるまで待機中
      expect(executingCount).toBe(1);
      expect(results).not.toContain('second');

      // 1回目の完了(100ms)まで進める
      await vi.advanceTimersByTimeAsync(50);

      // 2回目が始まっていることを確認
      expect(results).toContain('first');
      expect(executingCount).toBe(1);

      // 2回目の完了(さらに100ms)まで進める
      await vi.advanceTimersByTimeAsync(100);
      await p2;

      expect(results).toEqual(['first', 'second']);
      expect(executingCount).toBe(0);
    });
  });

  it('エラーが発生してもクールタイム制御に影響を与えないこと', async () => {
    const controller = new ThrottleController({
      id: 'test',
      wait: 100,
      cancelPolicy: 'resolve',
      triggerAt: 'start',
    });

    const fn = vi.fn().mockRejectedValue(new Error('fail'));
    const wrapped = controller.wrap(fn);

    // 初回実行（エラー）
    const p1 = wrapped!();
    await expect(p1).rejects.toThrow('fail');

    // クールタイム中（50ms時点）はやはりキャンセルされる
    vi.advanceTimersByTime(50);
    expect(await wrapped!()).toBe(CANCEL);

    // クールタイム明け（さらに60ms）は実行できる
    vi.advanceTimersByTime(60);
    await expect(wrapped!()).rejects.toThrow('fail');
  });

  describe('cancel', () => {
    it('クールタイム明けを待っている呼び出しはキャンセルされること', async () => {
      const controller = new ThrottleController({
        wait: 100,
        cancelPolicy: 'resolve',
      });
      const fn = vi.fn().mockResolvedValue('ok');
      const wrapped = controller.wrap(fn)!;

      wrapped();
      const promise = wrapped();
      controller.cancel();

      expect(await promise).toBe(CANCEL);
      await vi.advanceTimersByTimeAsync(100);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('sequential: 前回の完了を待っている呼び出しはキャンセルされること', async () => {
      const controller = new ThrottleController({
        id: 'test',
        wait: 50,
        sequential: true,
        cancelPolicy: 'resolve',
      });

      const fn = vi.fn().mockResolvedValue('ok');
      const wrapped = controller.wrap(fn);

      // _tail の解決を待っている状態でキャンセル
      const promise = wrapped!();
      controller.cancel();

      expect(await promise).toBe(CANCEL);
      await vi.runAllTicks();
      expect(fn).not.toHaveBeenCalled();
    });
  });

  it('オプションを省略した場合は既定値で動作すること', async () => {
    const controller = new ThrottleController();
    const fn = vi.fn(async () => 'ok');

    expect(await controller.wrap(fn)()).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('triggerAt: end と sequential: true の場合、前の実行の完了を待ってから実行すること', async () => {
    const controller = new ThrottleController({
      wait: 100,
      triggerAt: 'end',
      sequential: true,
    });
    const log: string[] = [];
    const wrapped = controller.wrap(async (name: string) => {
      log.push(`start ${name}`);
      // 実行に150ms
      await new Promise((res) => setTimeout(res, 150));
      log.push(`end ${name}`);
    });

    // 時刻100msに a を実行開始
    wrapped('a');
    await vi.advanceTimersByTimeAsync(100);
    expect(log).toEqual(['start a']);

    // 時刻200msに b の期間が終わるが、a の完了（250ms）を待つ
    wrapped('b');
    await vi.advanceTimersByTimeAsync(100);
    expect(log).toEqual(['start a']);

    await vi.advanceTimersByTimeAsync(50);
    expect(log).toEqual(['start a', 'end a', 'start b']);

    await vi.advanceTimersByTimeAsync(150);
    expect(log).toEqual(['start a', 'end a', 'start b', 'end b']);
  });

  it('cancelPolicy: reject の場合、実行されなかった呼び出しは CANCEL で reject されること', async () => {
    const controller = new ThrottleController({
      wait: 100,
      cancelPolicy: 'reject',
    });
    const fn = vi.fn(async (value: string) => value);
    const wrapped = controller.wrap(fn);

    const p1 = wrapped('a');
    const rejected = expect(wrapped('b')).rejects.toBe(CANCEL);
    const p3 = wrapped('c');
    await rejected;

    await vi.advanceTimersByTimeAsync(100);
    expect(await p1).toBe('a');
    expect(await p3).toBe('c');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('cancel してもクールタイムは終わらないこと', async () => {
    const controller = new ThrottleController({
      wait: 100,
      cancelPolicy: 'resolve',
    });
    const fn = vi.fn(async (value: string) => value);
    const wrapped = controller.wrap(fn);

    expect(await wrapped('a')).toBe('a');
    controller.cancel();

    // クールタイム中なので、明けるまで実行されない
    const p2 = wrapped('b');
    await vi.advanceTimersByTimeAsync(99);
    expect(fn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await p2).toBe('b');
  });

  it('同じコントローラーでラップした関数どうしで、クールタイムを共有すること', async () => {
    const controller = new ThrottleController({
      wait: 100,
      triggerAt: 'start',
      cancelPolicy: 'resolve',
    });
    const fnA = vi.fn(async () => 'a');
    const fnB = vi.fn(async () => 'b');

    expect(await controller.wrap(fnA)()).toBe('a');
    expect(await controller.wrap(fnB)()).toBe(CANCEL);
    expect(fnB).not.toHaveBeenCalled();
  });
});
