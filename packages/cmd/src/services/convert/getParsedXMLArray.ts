import { debug } from '@debug';
import { warn } from '@logger';
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

  if (filesData.length !== parsedXMLInputs.length) {
    warn(
      'Some files could not be parsed. Enable debug logging for more details'
    );
  }

  return parsedXMLInputs;
}

async function getParsedXMLInput(XMLString: string) {
  const trimmedXMLString = XMLString.trim();
  if (!trimmedXMLString) return null;

  try {
    const parsedXMLInput = await parseStringPromise(trimmedXMLString, {
      explicitArray: false,
      mergeAttrs: true,
    });
    return parsedXMLInput || null;
  } catch (e) {
    debug('Error parsing XML input', e);
    return null;
  }
}
