import { writeFileAsync } from '@lib';
import { readFile } from 'fs-extra';
import { join } from 'path';
import * as xml2js from 'xml2js';
import { TestSuite, TestSuites } from './types';

export async function combineInputFiles(inputFiles: string[]): Promise<string> {
  const combinedTestSuites: TestSuites = {
    testsuites: {
      testsuite: [],
    },
  };

  const parser = new xml2js.Parser({
    explicitArray: false,
    mergeAttrs: true,
  });

  for (const filePath of inputFiles) {
    const content = await readFile(filePath, 'utf-8');
    const result = (await parser.parseStringPromise(content)) as TestSuites;

    if (result.testsuites?.testsuite) {
      const processedSuites = await processTestSuites(
        result.testsuites.testsuite
      );
      combinedTestSuites.testsuites = {
        testsuite: [
          ...(combinedTestSuites.testsuites?.testsuite || []),
          ...processedSuites,
        ],
      };
    }
  }

  const builder = new xml2js.Builder();
  return builder.buildObject(combinedTestSuites);
}

export async function saveXMLInput(outputDir: string, xmlInput: string) {
  return writeFileAsync(join(outputDir, 'currents.results.xml'), xmlInput);
}

async function processTestSuites(
  testsuites: TestSuite[]
): Promise<TestSuite[]> {
  return testsuites.reduce<TestSuite[]>(
    (processedSuites, currentSuite, index) => {
      const nextSuite = testsuites[index + 1];

      if (currentSuite.name === 'Root Suite' && nextSuite) {
        if (currentSuite.file) {
          nextSuite.file = currentSuite.file;
        }
        processedSuites.push(nextSuite);
      } else if (currentSuite.name !== 'Root Suite') {
        processedSuites.push(currentSuite);
      }

      return processedSuites;
    },
    []
  );
}
