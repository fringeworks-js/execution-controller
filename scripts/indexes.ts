import { PRIVATE, TEST_FILE } from '@fringeworks/dev';
import generateIndexFiles from '@fringeworks/dev/generateIndexFiles';

generateIndexFiles({
  exclude: [PRIVATE, TEST_FILE],
});
