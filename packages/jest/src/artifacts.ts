import { join } from 'path';
import type { Test, TestCaseResult, TestResult } from '@jest/reporters';
import { copyFileAsync, createFolder, debug, generateShortHash, readFileAsync, writeFileAsync } from './lib';
import type { Artifact } from './types';

type AttachmentLog = {
  filePath: string;
  line: number;
};

type StdioLog = {
  message: string;
  type: string;
  line: number;
};

type TestCaseForArtifacts = {
  id: string;
  timestamps: number[];
  title: string[];
  result: TestCaseResult[];
  config: Test['context']['config'];
  location?: {
    column?: number;
    line?: number;
  } | null;
};

type ArtifactsPreparationInput = {
  reportDir: string;
  testResult: TestResult;
  testFilePath: string;
  testCases: TestCaseForArtifacts[];
};

type ArtifactsPreparationResult = {
  artifactsDir: string;
  attachmentsByTestId: Record<string, AttachmentLog[]>;
  stdioByTestId: Record<string, StdioLog[]>;
};

type AttemptArtifactsOptions = {
  artifactsDir: string;
  testCaseId: string;
  attemptIndex: number;
  stderrMessages: string[];
  attachmentsByTestId: Record<string, AttachmentLog[]>;
  stdioByTestId: Record<string, StdioLog[]>;
};

export async function prepareArtifacts({
  reportDir,
  testResult,
  testFilePath,
  testCases,
}: ArtifactsPreparationInput): Promise<ArtifactsPreparationResult> {
  const artifactsDir = await createFolder(join(reportDir, 'artifacts'));

  const attachmentLogs = parseAttachmentLogs(testResult.console);
  const stdioLogs = parseStdioLogs(testResult.console);

  const sortedTestCases = [...testCases].sort(
    (a, b) => (a.location?.line ?? 0) - (b.location?.line ?? 0)
  );

  await updateTestCaseLocationsFromFile(sortedTestCases, testFilePath);

  sortedTestCases.sort(
    (a, b) => (a.location?.line ?? 0) - (b.location?.line ?? 0)
  );

  const attachmentsByTestId = groupAttachmentsByTestId(
    attachmentLogs,
    sortedTestCases
  );
  const stdioByTestId = groupStdioByTestId(stdioLogs, sortedTestCases);

  return {
    artifactsDir,
    attachmentsByTestId,
    stdioByTestId,
  };
}

export async function createAttemptArtifacts({
  artifactsDir,
  testCaseId,
  attemptIndex,
  stderrMessages,
  attachmentsByTestId,
  stdioByTestId,
}: AttemptArtifactsOptions): Promise<Artifact[]> {
  const artifacts: Artifact[] = [];

  if (attemptIndex === 0) {
    const myLogs = stdioByTestId[testCaseId] ?? [];
    const stdoutLogs = myLogs
      .filter((l) => l.type !== 'error' && l.type !== 'warn')
      .map((l) => l.message);
    const stderrLogs = myLogs
      .filter((l) => l.type === 'error' || l.type === 'warn')
      .map((l) => l.message);

    if (stdoutLogs.length > 0) {
      const fileName = `${generateShortHash(testCaseId + 'stdout')}.txt`;
      await writeFileAsync(artifactsDir, fileName, stdoutLogs.join('\n'));
      artifacts.push({
        path: join('artifacts', fileName),
        type: 'stdout',
        contentType: 'text/plain',
      });
    }

    if (stderrLogs.length > 0) {
      const fileName = `${generateShortHash(
        testCaseId + 'stderr-log'
      )}.txt`;
      await writeFileAsync(artifactsDir, fileName, stderrLogs.join('\n'));
      artifacts.push({
        path: join('artifacts', fileName),
        type: 'stdout',
        contentType: 'text/plain',
      });
    }

    if (stderrMessages.length > 0) {
      const fileName = `${generateShortHash(
        testCaseId + attemptIndex + 'stderr'
      )}.txt`;
      await writeFileAsync(artifactsDir, fileName, stderrMessages.join('\n'));
      artifacts.push({
        path: join('artifacts', fileName),
        type: 'stdout',
        contentType: 'text/plain',
      });
    }

    const myAttachments = attachmentsByTestId[testCaseId] ?? [];
    for (const att of myAttachments) {
      const ext = att.filePath.split('.').pop() ?? '';
      let type = 'attachment';
      let contentType = 'application/octet-stream';

      if (['mp4', 'webm'].includes(ext)) {
        type = 'video';
        contentType = ext === 'mp4' ? 'video/mp4' : 'video/webm';
      }
      if (['png', 'jpg', 'jpeg', 'bmp'].includes(ext)) {
        type = 'screenshot';
        contentType =
          ext === 'png'
            ? 'image/png'
            : ext === 'jpg' || ext === 'jpeg'
            ? 'image/jpeg'
            : 'image/bmp';
      }

      const fileName = `${generateShortHash(testCaseId + att.filePath)}.${ext}`;

      try {
        await copyFileAsync(att.filePath, join(artifactsDir, fileName));
        artifacts.push({
          path: join('artifacts', fileName),
          type,
          contentType,
        });
      } catch (e) {
        debug('Failed to copy artifact %s: %o', att.filePath, e);
      }
    }
  }

  return artifacts;
}

function parseAttachmentLogs(
  consoleEntries: TestResult['console']
): AttachmentLog[] {
  return (consoleEntries ?? [])
    .filter((log) => log.message.startsWith('[[ATTACHMENT|'))
    .map((log) => {
      const match = log.message.match(/\[\[ATTACHMENT\|([^\]]+)\]\]/);
      const filePath = match ? match[1] : '';
      const lineMatch = log.origin.match(/:(\d+):\d+\)/);
      const line = lineMatch ? parseInt(lineMatch[1], 10) : 0;
      return { filePath, line };
    })
    .filter((a) => a.filePath);
}

function parseStdioLogs(consoleEntries: TestResult['console']): StdioLog[] {
  return (consoleEntries ?? [])
    .filter((log) => !log.message.startsWith('[[ATTACHMENT|'))
    .map((log) => {
      const lineMatch = log.origin.match(/:(\d+):\d+\)/);
      const line = lineMatch ? parseInt(lineMatch[1], 10) : 0;
      return { message: log.message, type: log.type, line };
    });
}

async function updateTestCaseLocationsFromFile(
  sortedTestCases: TestCaseForArtifacts[],
  testFilePath: string
) {
  try {
    const fileContent = await readFileAsync(testFilePath);
    const fileLines = (fileContent as string).split('\n');

    for (const testCase of sortedTestCases) {
      if ((testCase.location?.line ?? 1) <= 1) {
        const title = testCase.title[testCase.title.length - 1];
        const lineIdx = fileLines.findIndex(
          (l) =>
            l.includes(`it('${title}'`) ||
            l.includes(`it("${title}"`) ||
            l.includes(`test('${title}'`) ||
            l.includes(`test("${title}"`)
        );
        if (lineIdx !== -1) {
          if (!testCase.location) {
            testCase.location = {
              line: lineIdx + 1,
              column: 1,
            };
          } else {
            testCase.location.line = lineIdx + 1;
          }
        }
      }
    }
  } catch (e) {
    debug('Failed to read test file or parse lines: %o', e);
  }
}

function groupAttachmentsByTestId(
  attachmentLogs: AttachmentLog[],
  sortedTestCases: TestCaseForArtifacts[]
): Record<string, AttachmentLog[]> {
  const attachmentsByTestId: Record<string, AttachmentLog[]> = {};

  attachmentLogs.forEach((att) => {
    let owner = sortedTestCases[0];
    for (const tc of sortedTestCases) {
      if ((tc.location?.line ?? 0) <= att.line) {
        owner = tc;
      } else {
        break;
      }
    }
    if (owner) {
      if (!attachmentsByTestId[owner.id]) attachmentsByTestId[owner.id] = [];
      attachmentsByTestId[owner.id].push(att);
    }
  });

  return attachmentsByTestId;
}

function groupStdioByTestId(
  stdioLogs: StdioLog[],
  sortedTestCases: TestCaseForArtifacts[]
): Record<string, StdioLog[]> {
  const stdioByTestId: Record<string, StdioLog[]> = {};

  stdioLogs.forEach((log) => {
    let owner = sortedTestCases[0];
    for (const tc of sortedTestCases) {
      if ((tc.location?.line ?? 0) <= log.line) {
        owner = tc;
      } else {
        break;
      }
    }
    if (owner) {
      if (!stdioByTestId[owner.id]) stdioByTestId[owner.id] = [];
      stdioByTestId[owner.id].push(log);
    }
  });

  return stdioByTestId;
}

