import * as fs from 'fs';
import * as xml2js from 'xml2js';

export interface Failure {
  message?: string;
  _?: string;
}

export interface TestCase {
  name?: string;
  classname?: string;
  time?: string;
  failure?: (Failure | string)[] | string;
  [key: string]: any;
}

export interface TestSuite {
  name?: string;
  errors?: string;
  failures?: string;
  skipped?: string;
  timestamp?: string;
  time?: string;
  tests?: string;
  testcase?: TestCase[];
  [key: string]: any;
}

export interface TestSuites {
  testsuites?: {
    testsuite?: TestSuite[];
    [key: string]: any;
  };
}

async function processTestSuites(
  testsuites: TestSuite[]
): Promise<TestSuite[]> {
  const processedSuites: TestSuite[] = [];

  for (let i = 0; i < testsuites.length; i++) {
    const currentSuite = testsuites[i];
    const nextSuite = testsuites[i + 1];

    if (currentSuite.name === 'Root Suite' && nextSuite) {
      if (currentSuite.file) {
        nextSuite.file = currentSuite.file;
      }
      i++;
      processedSuites.push(nextSuite);
    } else if (currentSuite.name !== 'Root Suite') {
      processedSuites.push(currentSuite);
    }
  }

  return processedSuites;
}

export async function combineResults(filePaths: string[]): Promise<string> {
  let combinedTestsuites: TestSuites = {
    testsuites: {
      testsuite: [],
    },
  };

  const parser = new xml2js.Parser({
    explicitArray: true,
    mergeAttrs: true,
  });

  for (const filePath of filePaths) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const result = (await parser.parseStringPromise(content)) as TestSuites;

    if (result.testsuites?.testsuite) {
      const processedSuites = await processTestSuites(
        result.testsuites.testsuite
      );
      combinedTestsuites.testsuites = {
        testsuite: [
          ...(combinedTestsuites.testsuites?.testsuite || []),
          ...processedSuites,
        ],
      };
    }
  }

  const builder = new xml2js.Builder();
  return builder.buildObject(combinedTestsuites);
}

export default combineResults;
