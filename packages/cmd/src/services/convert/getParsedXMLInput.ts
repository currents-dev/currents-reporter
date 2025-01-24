import { error } from '@logger';
import { readFile } from 'fs-extra';
import { parseStringPromise } from 'xml2js';
import { combineInputFiles, saveXMLInput } from './combineInputFiles';

export async function getParsedXMLInput(
  inputFiles: string[],
  outputDir: string
) {
  let xmlInput = '';
  if (inputFiles.length > 1) {
    xmlInput = await combineInputFiles(inputFiles);
  } else if (inputFiles.length === 1) {
    xmlInput = await readFile(inputFiles[0], 'utf-8');
  }

  const trimmedXMLInput = xmlInput.trim();

  if (trimmedXMLInput) {
    const parsedXMLInput = await parseStringPromise(trimmedXMLInput, {
      explicitArray: false,
      mergeAttrs: true,
    });

    if (!parsedXMLInput) {
      error('Failed to parse XML input');
      return { instanceMap: new Map(), parsedXMLInput: undefined };
    }
    await saveXMLInput(outputDir, trimmedXMLInput);
    return parsedXMLInput;
  }

  return;
}
