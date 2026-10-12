import { CONSTANTS, PRIVATE, TEST_FILE } from '@fringeworks/dev/constants';
import generateIndexFiles from '@fringeworks/dev/generateIndexFiles';

generateIndexFiles({
  exclude: [CONSTANTS, PRIVATE, TEST_FILE],
});
