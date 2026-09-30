import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CANCEL } from '../constants';
import DebounceController from '../DebounceController';

describe('DebounceController', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('デフォルト', async () => {
    const controller = new DebounceController({
      id: 'test',
    });

    const fn = vi.fn().mockResolvedValue('ok');
    const wrapped = controller.wrap(fn);

    const promise = wrapped!();

    // 50ms経過（まだ実行されない）
    vi.advanceTimersByTime(50);
    expect(fn).not.toHaveBeenCalled();

    // さらに200ms経過（合計250ms）
    vi.advanceTimersByTime(200);
    // 非同期処理を確実に回す
    await vi.runAllTicks();
    await vi.runAllTicks();

    const result = await promise;
    expect(fn).toHaveBeenCalledTimes(1);
    expect(result).toBe('ok');
  });

  it('指定した待ち時間（wait）後に実行されること', async () => {
    const controller = new DebounceController({
      id: 'test',
      wait: 100,
      cancelPolicy: 'resolve',
    });

    const fn = vi.fn().mockResolvedValue('ok');
    const wrapped = controller.wrap(fn);

    const promise = wrapped!();

    // 50ms経過（まだ実行されない）
    vi.advanceTimersByTime(50);
    expect(fn).not.toHaveBeenCalled();

    // さらに50ms経過（合計100ms）
    vi.advanceTimersByTime(50);
    // 非同期処理を確実に回す
    await vi.runAllTicks();
    await vi.runAllTicks();

    const result = await promise;
    expect(fn).toHaveBeenCalledTimes(1);
    expect(result).toBe('ok');
  });

  it('連続して呼び出した場合、最後の呼び出しのみが実行されること', async () => {
    const controller = new DebounceController({
      id: 'test',
      wait: 100,
      cancelPolicy: 'resolve',
    });

    const fn = vi.fn((n: number) => Promise.resolve(n));
    const wrapped = controller.wrap(fn);

    const p1 = wrapped!(1);
    vi.advanceTimersByTime(50);
    const p2 = wrapped!(2);
    vi.advanceTimersByTime(50);
    const p3 = wrapped!(3);

    // p1, p2 はキャンセルされるはず
    vi.advanceTimersByTime(100);
    await vi.runAllTicks();
    await vi.runAllTicks();

    expect(await p1).toBe(CANCEL);
    expect(await p2).toBe(CANCEL);
    expect(await p3).toBe(3);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  describe('sequential オプション', () => {
    it('sequential: false (デフォルト) の場合、前回の完了を待たずに実行されること', async () => {
      const controller = new DebounceController({
        id: 'test',
        wait: 10,
        sequential: false,
      });

      let executingCount = 0;
      const fn = async () => {
        executingCount++;
        // 実行中の待機
        await new Promise((res) => setTimeout(res, 50));
        executingCount--;
      };

      const wrapped = controller.wrap(fn);

      // 1回目の実行
      wrapped!();
      vi.advanceTimersByTime(10);
      await vi.runAllTicks();
      await vi.runAllTicks();
      expect(executingCount).toBe(1);

      // 2回目の実行を仕込む
      vi.advanceTimersByTime(20);
      wrapped!();
      vi.advanceTimersByTime(10);
      await vi.runAllTicks();
      await vi.runAllTicks();

      // 同時に2つ動いている
      expect(executingCount).toBe(2);

      vi.advanceTimersByTime(50);
      await vi.runAllTicks();
      await vi.runAllTicks();
    });

    it('sequential: true の場合、前回の完了を待ってから次が実行されること', async () => {
      const controller = new DebounceController({
        id: 'test',
        wait: 10,
        sequential: true,
      });

      let executingCount = 0;
      const fn = async () => {
        executingCount++;
        // fn自体の実行時間(50ms)
        await new Promise((res) => {
          setTimeout(res, 50);
        });
        executingCount--;
      };

      const wrapped = controller.wrap(fn);

      // 1回目：デバウンス10ms + 実行50ms
      wrapped!();
      await vi.advanceTimersByTimeAsync(10);
      expect(executingCount).toBe(1);

      // 1回目が実行中(現在時刻10ms)に、2回目を仕込む
      await vi.advanceTimersByTimeAsync(20); // 時刻30ms
      wrapped!();
      await vi.advanceTimersByTimeAsync(10); // 時刻40ms (2回目のデバウンス終了)

      // sequential: true なので、1回目が終わるまで2回目は開始されない
      expect(executingCount).toBe(1);

      // 1回目が終わる時間（10ms + 50ms = 60ms）まで進める
      await vi.advanceTimersByTimeAsync(20); // 時刻60ms

      // 1回目が終わり、2回目が始まっているはず
      expect(executingCount).toBe(1);

      // 全て完了（2回目の50msが終わるまで）
      await vi.advanceTimersByTimeAsync(50);
      expect(executingCount).toBe(0);
    });
  });

  describe('cancel', () => {
    it('待機中の呼び出しはキャンセルされ、実行されないこと', async () => {
      const controller = new DebounceController({
        id: 'test',
        wait: 100,
        cancelPolicy: 'resolve',
      });

      const fn = vi.fn().mockResolvedValue('ok');
      const wrapped = controller.wrap(fn);

      const promise = wrapped!();
      controller.cancel();
      expect(await promise).toBe(CANCEL);

      vi.advanceTimersByTime(200);
      await vi.runAllTicks();
      expect(fn).not.toHaveBeenCalled();
    });

    it('sequential: 前回の完了を待っている呼び出しもキャンセルされること', async () => {
      const controller = new DebounceController({
        id: 'test',
        wait: 100,
        sequential: true,
        cancelPolicy: 'resolve',
      });

      const fn = vi.fn().mockResolvedValue('ok');
      const wrapped = controller.wrap(fn);

      const promise = wrapped!();
      // タイマーは発火したが、_tail の解決を待っている状態
      vi.advanceTimersByTime(100);
      controller.cancel();

      expect(await promise).toBe(CANCEL);
      await vi.runAllTicks();
      expect(fn).not.toHaveBeenCalled();
    });
  });
});
