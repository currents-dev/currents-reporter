/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { codeFrameColumns } from '@babel/code-frame';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import StackUtils from 'stack-utils';
import url from 'url';
import { ErrorSchema, LocationSchema } from '../types';

function parseErrorString(errorString: string) {
  // Remove ANSI escape codes for easier parsing
  const cleanString = errorString.replace(/\u001b\[[0-9;]*m/g, '');

  // Extract the error name, message, and stack trace
  const nameMatch = cleanString.match(/^(.+?):/);
  const messageMatch = cleanString.match(/^[^:]+: ([\s\S]*?)\n\s*at /);
  const stackMatch = cleanString.match(/(at [\s\S]*)/);

  const name = nameMatch ? nameMatch[1] : null;
  const message = messageMatch ? messageMatch[1] : null;
  const stack = stackMatch ? stackMatch[1] : null;

  // Extract the code frame information
  const codeFrameMatch = cleanString.match(/at (.+):(\d+):(\d+)/);
  const fileWithFunction = codeFrameMatch ? codeFrameMatch[1] : null;
  const file = fileWithFunction
    ? fileWithFunction.replace(/^.*\(([^)]+)\).*$/, '$1')
    : null;
  const line = codeFrameMatch ? parseInt(codeFrameMatch[2], 10) : null;
  const column = codeFrameMatch ? parseInt(codeFrameMatch[3], 10) : null;

  const codeFrame = {
    line,
    column,
    file,
    frame: null, // frame is not provided in the given example, set to null
  };

  // Construct the error object
  const errorObject = {
    name,
    message,
    stack,
    codeFrame,
  };

  // Check if all fields are null
  const allFieldsAreNull = [
    name,
    message,
    stack,
    codeFrame.file,
    codeFrame.line,
    codeFrame.column,
    codeFrame.frame,
  ].every((field) => field === null);

  // Return null if all fields are null, otherwise return the error object
  return allFieldsAreNull ? null : errorObject;
}

function getLocation(location: LocationSchema, rootDir: string) {
  return {
    column: location.column,
    file: relativeFilePath(location.file, rootDir),
    line: location.line,
  };
}

function belongsToNodeModules(file: string) {
  return file.includes(`${path.sep}node_modules${path.sep}`);
}

function relativeFilePath(rootDir: string, file: string): string {
  return path.relative(rootDir, file) || path.basename(file);
}

function prepareErrorStack(stack: string): {
  message: string;
  stackLines: string[];
  location?: LocationSchema;
} {
  const lines = stack.split('\n');
  let firstStackLine = lines.findIndex((line) => line.startsWith('    at '));
  if (firstStackLine === -1) firstStackLine = lines.length;
  const message = lines.slice(0, firstStackLine).join('\n');
  const stackLines = lines.slice(firstStackLine);
  let location: LocationSchema | undefined;
  for (const line of stackLines) {
    const { frame: parsed, fileName: resolvedFile } = parseStackTraceLine(line);
    if (!parsed || !resolvedFile) continue;
    if (belongsToNodeModules(resolvedFile)) continue;
    location = {
      file: resolvedFile,
      column: parsed.column || 0,
      line: parsed.line || 0,
    };
    break;
  }
  return { message, stackLines, location };
}

const stackUtils = new StackUtils();
function parseStackTraceLine(line: string): {
  frame: StackUtils.StackLineData | null;
  fileName: string | null;
} {
  const frame = stackUtils.parseLine(line);
  if (!frame) return { frame: null, fileName: null };
  let fileName: string | null = null;
  if (frame.file) {
    // ESM files return file:// URLs, see here: https://github.com/tapjs/stack-utils/issues/60
    fileName = frame.file.startsWith('file://')
      ? url.fileURLToPath(frame.file)
      : path.resolve(process.cwd(), frame.file);
  }
  return {
    frame,
    fileName,
  };
}

export function formatError(
  rootDir: string,
  error: Error,
  highlightCode: boolean,
  file?: string
) {
  const stack = error.stack;
  const tokens: string[] = [];
  let location: LocationSchema | undefined;
  if (stack) {
    // Now that we filter out internals from our stack traces, we can safely render
    // the helper / original exception locations.
    const parsed = prepareErrorStack(stack);
    tokens.push(parsed.message);
    location = parsed.location;
    if (location) {
      // Convert /var/folders to /private/var/folders on Mac.
      if (
        // @ts-ignore
        !error.snippet &&
        (!file || fs.realpathSync(`${rootDir}/${file}`) !== location.file)
      ) {
        tokens.push('');
        tokens.push(
          chalk.gray(`   at `) +
            `${relativeFilePath(rootDir, location.file)}:${location.line}`
        );
      }
      tokens.push('');
      // @ts-ignore
      if (error.snippet) {
        // @ts-ignore
        tokens.push(error.snippet);
      } else {
        try {
          const source = fs.readFileSync(location.file, 'utf8');
          const codeFrame = codeFrameColumns(
            source,
            { start: location },
            { highlightCode }
          );
          tokens.push(codeFrame);
        } catch (e) {
          // Failed to read the source file - that's ok.
        }
      }
    }
    tokens.push('');
    tokens.push(parsed.stackLines.join('\n'));
  } else if (error.message) {
    tokens.push(error.message);
    // @ts-ignore
  } else if (error.value) {
    // @ts-ignore
    tokens.push(error.value);
  }
  return {
    location,
    message: tokens.join('\n'),
  };
}

export function getError(error: ErrorSchema, rootDir: string) {
  return {
    message: error.message,
    stack: error.stack,
    value: error.value,
    snippet: error.snippet,
    location: error.location ? getLocation(error.location, rootDir) : undefined,
  };
}
