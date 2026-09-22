import type { SyncLooseFunction } from '@niche-works/types';
import { CANCEL } from '../constants';
import ExecutionControllerBase from '../ExecutionControllerBase';
import type { WrappedFunction } from '../types';

// テスト用の具体的な実装クラス
class TestController<
  P extends 'ignore' | 'reject' | 'resolve' = 'ignore',
> extends ExecutionControllerBase<'test', P> {
  public shouldCancel = false;

  protected _wrap<F extends SyncLooseFunction>(fn: F): WrappedFunction<F> {
    const executionFn = this._createExecutionFn(fn);
    return async (scope, args) => {
      if (this.shouldCancel) return CANCEL;
      return executionFn(scope, args);
    };
  }
}

describe('ExecutionControllerBase', () => {
  it('基本情報（type, id）が正しく取得できること', () => {
    const controller = new TestController({ type: 'test', id: 'id-1' });
    expect(controller.type).toBe('test');
    expect(controller.id).toBe('id-1');
  });

  describe('実行状態の管理', () => {
    it('executing カウントが実行中に増加し、終了後に減少すること', async () => {
      const controller = new TestController({ type: 'test', id: 'test' });
      let resolveFn: (val: string) => void;
      const promise = new Promise<string>((resolve) => {
        resolveFn = resolve;
      });

      const wrapped = controller.wrap(async () => await promise);

      const execution = wrapped!();
      expect(controller.executing).toBe(1);
      expect(controller.isExecuting).toBe(true);

      resolveFn!('done');
      await execution;

      expect(controller.executing).toBe(0);
      expect(controller.isExecuting).toBe(false);
    });
  });

  describe('スコープ（this）の制御', () => {
    it('wrapMethod はインスタンスをスコープとして固定すること', async () => {
      const controller = new TestController({ type: 'test', id: 'test' });
      const instance = {
        name: 'MyInstance',
        getName() {
          return this.name;
        },
      };

      const wrapped = controller.wrapMethod(instance, 'getName');
      const result = await wrapped!();
      expect(result).toBe('MyInstance');
    });

    it('wrap は呼び出し時の this をスコープとして使用すること', async () => {
      const controller = new TestController({ type: 'test', id: 'test' });
      const context = { name: 'Context' };
      function getName(this: any) {
        return this.name;
      }

      const wrapped = controller.wrap(getName);
      const result = await wrapped!.call(context);
      expect(result).toBe('Context');
    });
  });

  describe('対象なし', () => {
    it('wrapMethod は対象のメソッドが関数であること', async () => {
      const controller = new TestController({ type: 'test', id: 'test' });
      const instance = {
        name: 'MyInstance',
        getName() {
          return this.name;
        },
      };
      instance.getName = 'MyInstance' as any;

      const result = controller.wrapMethod(instance, 'getName');
      expect(result).toBeUndefined();
    });

    it('wrap はnull,undefindでないこと', async () => {
      const controller = new TestController({ type: 'test', id: 'test' });

      const result = controller.wrap(null);
      expect(result).toBeUndefined();
    });
  });

  describe('CancelPolicy の挙動', () => {
    it('ignore (デフォルト): キャンセル時に Promise が解決されないこと', async () => {
      const controller = new TestController({ type: 'test', id: 'test' });
      controller.shouldCancel = true;

      const wrapped = controller.wrap(async () => 'ok');
      const promise = wrapped!();

      // resolve も reject もされないことを確認するために一定時間待機
      const race = Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject('timeout'), 50)),
      ]);

      await expect(race).rejects.toBe('timeout');
    });

    it('reject: キャンセル時に CANCEL で例外を投げること', async () => {
      const controller = new TestController({
        type: 'test',
        id: 'test',
        cancelPolicy: 'reject',
      });
      controller.shouldCancel = true;

      const wrapped = controller.wrap(async () => 'ok');
      await expect(wrapped!()).rejects.toBe(CANCEL);
    });

    it('resolve: キャンセル時に CANCEL 値を返すこと', async () => {
      const controller = new TestController({
        type: 'test',
        id: 'test',
        cancelPolicy: 'resolve',
      });
      controller.shouldCancel = true;

      const wrapped = controller.wrap(async () => 'ok');
      const result = await wrapped!();
      expect(result).toBe(CANCEL);
    });
  });
});
