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

  it('デフォルト', async () => {
    const controller = new ThrottleController({
      id: 'test',
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
    expect(fn).toHaveBeenCalledTimes(1); // 増えていないこと

    // クールタイム明けの3回目
    vi.advanceTimersByTime(200);
    const p3 = wrapped!();
    await vi.runAllTicks();
    expect(fn).toHaveBeenCalledTimes(2);

    expect(await p1).toBe('ok');
  });

  it('初回実行は即座に行われ、指定時間（wait）内は次の呼び出しがキャンセルされること', async () => {
    const controller = new ThrottleController({
      id: 'test',
      wait: 100,
      cancelPolicy: 'resolve',
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
    const p3 = wrapped!();
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
});
