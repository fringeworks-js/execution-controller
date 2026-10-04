import indexes from '@fringeworks/dev/indexes';
import {
  CONSTANTS,
  PRIVATE,
  TEST_FILE,
} from '@fringeworks/dev/indexes/constants';

indexes({
  exclude: [CONSTANTS, PRIVATE, TEST_FILE],
});
