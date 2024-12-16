import { describe, it, expect } from 'vitest';
import { getSuiteName } from '../utils';

describe('getSuiteName', () => {
  it.each([
    [
      'returns file name when no duplicates',
      { file: 'testFile.js', id: '1' },
      [{ file: 'testFile.js', id: '2' }],
      undefined,
      'testFile.js',
    ],
    [
      'appends id to file name when file is duplicate',
      { file: 'testFile.js', id: '1' },
      [
        { file: 'testFile.js', id: '1' },
        { file: 'testFile.js', id: '2' },
      ],
      undefined,
      'testFile.js - 1',
    ],
    [
      'appends index to file name when file is duplicate, id is duplicate, and index is provided',
      { file: 'testFile.js', id: '1' },
      [
        { file: 'testFile.js', id: '1' },
        { file: 'testFile.js', id: '1' },
      ],
      1,
      'testFile.js - 1',
    ],

    [
      'returns the file name when file is duplicate, id is duplicate, and index is 0',
      { file: 'testFile.js', id: '1' },
      [
        { file: 'testFile.js', id: '1' },
        { file: 'testFile.js', id: '1' },
      ],
      0,
      'testFile.js',
    ],

    [
      'returns name when no duplicates',
      { name: 'testSuite', id: '1' },
      [{ name: 'testSuite', id: '2' }],
      undefined,
      'testSuite',
    ],
    [
      'appends id to name when name is duplicate',
      { name: 'testSuite', id: '1' },
      [
        { name: 'testSuite', id: '1' },
        { name: 'testSuite', id: '2' },
      ],
      undefined,
      'testSuite - 1',
    ],
    [
      'appends index to name when name is duplicate, id is duplicate, and index is provided',
      { name: 'testSuite', id: '1' },
      [
        { name: 'testSuite', id: '1' },
        { name: 'testSuite', id: '1' },
      ],
      1,
      'testSuite - 1',
    ],

    [
      'returns the name when name is duplicate, id is duplicate, and index is 0',
      { name: 'testSuite', id: '1' },
      [
        { name: 'testSuite', id: '1' },
        { name: 'testSuite', id: '1' },
      ],
      0,
      'testSuite',
    ],

    [
      'returns id when no file or name is present',
      { id: '1' },
      [{ id: '2' }],
      undefined,
      '1',
    ],
    [
      'appends index to id when id is duplicate and index is provided',
      { id: '1' },
      [{ id: '1' }, { id: '1' }],
      2,
      '1 - 2',
    ],
    [
      'returns the id when id is duplicate and index is 0',
      { id: '1' },
      [{ id: '1' }, { id: '1' }],
      0,
      '1',
    ],

    [
      'returns "unknown - index" when no file, name, or id is present, and index is provided',
      {},
      [],
      2,
      'unknown - 2',
    ],
    [
      'returns "unknown" when no file, name, or id is present and no index is provided',
      {},
      [],
      undefined,
      'unknown',
    ],
  ])('%s', (_, suite, allSuites, index, expected) => {
    expect(getSuiteName(suite, allSuites, index)).toBe(expected);
  });
});
