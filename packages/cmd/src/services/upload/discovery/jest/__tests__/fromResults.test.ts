import { describe, expect, it } from 'vitest';
import { InstanceReport } from '../../../../../types';
import { FullTestSuite } from '../../types';
import { addTestsFromResults, fullTestSuiteFromResults } from '../fromResults';

const configId = 'c2b1e7d8f0a94e6b8d3c5a7f9e1b2d4c';

function instance(groupId: string, spec: string, titles: string[][]) {
  return {
    groupId,
    spec,
    results: {
      tests: titles.map((title, i) => ({
        testId: `${spec}-${i}`,
        title,
      })),
    },
  } as unknown as InstanceReport;
}

describe('fullTestSuiteFromResults', () => {
  it('names a single project without displayName root', () => {
    expect(
      fullTestSuiteFromResults([
        instance(configId, 'a.test.js', [['a', 'works @smoke']]),
        instance(configId, 'b.test.js', [['b', 'works']]),
      ])
    ).toEqual([
      {
        name: 'root',
        tags: [],
        tests: [
          {
            spec: 'a.test.js',
            testId: 'a.test.js-0',
            title: ['a', 'works @smoke'],
            tags: ['smoke'],
          },
          {
            spec: 'b.test.js',
            testId: 'b.test.js-0',
            title: ['b', 'works'],
            tags: [],
          },
        ],
      },
    ]);
  });

  it('keeps the projects of a multi-project config', () => {
    const fullTestSuite = fullTestSuiteFromResults([
      instance('unit', 'a.test.js', [['a']]),
      instance(configId, 'b.test.js', [['b']]),
    ]);

    expect(fullTestSuite.map((p) => p.name)).toEqual(['unit', configId]);
  });
});

describe('addTestsFromResults', () => {
  it('adds the tests of the results and returns the files without results', () => {
    const fullTestSuite = [
      {
        name: 'e2e',
        tags: [],
        tests: [],
      },
      {
        name: 'unit',
        tags: [],
        tests: [],
      },
    ];

    const specsNotInResults = addTestsFromResults(
      fullTestSuite,
      [
        { projectId: 'e2e', spec: 'launch.test.js' },
        { projectId: 'e2e', spec: 'other.test.js' },
      ],
      [instance('e2e', 'launch.test.js', [['launch']])]
    );

    expect(specsNotInResults).toEqual(['other.test.js']);
    expect(fullTestSuite[0].tests).toEqual([
      {
        spec: 'launch.test.js',
        testId: 'launch.test.js-0',
        title: ['launch'],
        tags: [],
      },
    ]);
    expect(fullTestSuite[1].tests).toEqual([]);
  });

  it('takes the tests of the file from the project that ran it', () => {
    const fullTestSuite: FullTestSuite = [
      { name: 'node', tags: [], tests: [] },
      { name: 'jsdom', tags: [], tests: [] },
    ];

    addTestsFromResults(
      fullTestSuite,
      [{ projectId: 'jsdom', spec: 'a.test.js' }],
      [
        instance('node', 'a.test.js', [['in node']]),
        instance('jsdom', 'a.test.js', [['in jsdom']]),
      ]
    );

    expect(fullTestSuite[1].tests.map((test) => test.title)).toEqual([
      ['in jsdom'],
    ]);
  });

  it('takes the tests of a Detox project, whose id differs in discovery', () => {
    const fullTestSuite: FullTestSuite = [
      { name: 'root', tags: [], tests: [] },
    ];

    addTestsFromResults(
      fullTestSuite,
      [{ projectId: 'discovery-config-id', spec: 'launch.e2e.js' }],
      [instance(configId, 'launch.e2e.js', [['launch']])]
    );

    expect(fullTestSuite[0].tests.map((test) => test.title)).toEqual([
      ['launch'],
    ]);
  });

  it('takes no tests from another project that ran the same file', () => {
    const fullTestSuite: FullTestSuite = [
      { name: 'node', tags: [], tests: [] },
      { name: 'jsdom', tags: [], tests: [] },
    ];

    const specsNotInResults = addTestsFromResults(
      fullTestSuite,
      [{ projectId: 'jsdom', spec: 'a.test.js' }],
      [instance('node', 'a.test.js', [['in node']])]
    );

    expect(specsNotInResults).toEqual(['a.test.js']);
    expect(fullTestSuite[1].tests).toEqual([]);
  });
});
