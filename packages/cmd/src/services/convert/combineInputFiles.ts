import { readFileSync, writeFileSync } from 'fs';
import * as xml2js from 'xml2js';
import { TestSuite, TestSuites } from './types';

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

export async function combineResults(inputFiles: string[]): Promise<string> {
  let combinedTestsuites: TestSuites = {
    testsuites: {
      testsuite: [],
    },
  };

  const parser = new xml2js.Parser({
    explicitArray: false,
    mergeAttrs: true,
  });

  for (const filePath of inputFiles) {
    const content = readInputFile(filePath);
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

export async function saveCombinedResultsFile(
  combinedResults: string,
  outputDir: string
) {
  writeFileSync(`${outputDir}/currents.results.xml`, combinedResults);
}

export function readInputFile(filePath: string) {
  return readFileSync(filePath, 'utf-8');
}
