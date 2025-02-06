import { readFile } from 'fs-extra';
import { parseStringPromise } from 'xml2js';
import { TestSuites } from './types';

export async function getParsedXMLArray(
  inputFiles: string[]
): Promise<TestSuites[]> {
  const filesData: string[] = await Promise.all(
    inputFiles.map((item) => readFile(item, 'utf-8'))
  );

  const parsedXMLInputs = (
    await Promise.all(filesData.map(getParsedXMLInput))
  ).filter(Boolean);

  return parsedXMLInputs;
}

const getParsedXMLInput = async (XMLString: string) => {
  if (XMLString.trim()) {
    const parsedXMLInput = await parseStringPromise(XMLString.trim(), {
      explicitArray: false,
      mergeAttrs: true,
    });

    if (parsedXMLInput) {
      return parsedXMLInput;
    }
  }
};
