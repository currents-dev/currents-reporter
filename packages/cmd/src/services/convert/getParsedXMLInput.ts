import { error } from '@logger';
import { readFile } from 'fs-extra';
import { parseStringPromise } from 'xml2js';
import { saveXMLInput } from './combineInputFiles';

export async function getParsedXMLInput(
  inputFiles: string[],
  outputDir: string
) {
  const filesData: string[] = await Promise.all(
    inputFiles.map((item) => readFile(item, 'utf-8'))
  );

  const parsedXMLInputs = await Promise.all(
    filesData.map(async (item) => {
      let xmlInput = item;
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
    })
  );

  return parsedXMLInputs;
}
