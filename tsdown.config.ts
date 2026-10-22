import createTsdownConfig from '@fringeworks/dev/createTsdownConfig';

export default createTsdownConfig({
  exports: { include: [/\/isCanceled\.ts$/] },
});
