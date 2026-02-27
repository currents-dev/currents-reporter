import { join } from 'path';
import { createHash } from 'crypto';
import { existsSync, readFileSync, unlinkSync } from 'fs';
import type { Test, TestCaseResult, TestResult } from '@jest/reporters';
import { copyFileAsync, createFolder, debug, generateShortHash, readFileAsync } from './lib';
import type { Artifact, ArtifactLevel } from './types';

// Prefix for property-like log messages: "currents.artifact.level.index.key=value"
const PROPERTY_LOG_PREFIX = 'currents.artifact.';

type PropertyLog = {
  key: string;
  value: string;
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

type StdioLog = {
  message: string;
  type: string;
  line: number;
};

type ArtifactsPreparationResult = {
  artifactsDir: string;
  propertyLogsByTestId: Record<string, PropertyLog[]>;
  stdioByTestId: Record<string, StdioLog[]>;
  specArtifacts: Artifact[];
};

type AttemptArtifactsOptions = {
  artifactsDir: string;
  testCaseId: string;
  attemptIndex: number;
  propertyLogsByTestId: Record<string, PropertyLog[]>;
};

export async function prepareArtifacts({
  reportDir,
  testResult,
  testFilePath,
  testCases,
}: ArtifactsPreparationInput): Promise<ArtifactsPreparationResult> {
  const artifactsDir = await createFolder(join(reportDir, 'artifacts'));

  const propertyLogs = parsePropertyLogs(testResult.console, testFilePath);
  const attachmentLogs = parseAttachmentLogs(testResult.console, testFilePath);
  const stdioLogs = parseStdioLogs(testResult.console, testFilePath);

  // Read file-based artifacts
  const fileArtifacts = readFileArtifacts(testFilePath);
  
  // Extract Spec Level Artifacts (from logs and file)
  const specLevelProps = propertyLogs.filter(
    (l) => {
      if (l.key.startsWith('spec.') || l.key.startsWith('instance.')) return true;
      if (l.key === 'JSON_ARTIFACT') {
        try {
          const artifact = JSON.parse(l.value);
          return artifact.level === 'spec';
        } catch (e) {
          return false;
        }
      }
      return false;
    }
  );
  
  // Add file-based spec artifacts
  const specFileArtifacts = fileArtifacts.filter(fa => !fa.currentTestName || fa.artifact.level === 'spec').map(fa => fa.artifact);
  
  const specArtifacts = await processSpecArtifacts(specLevelProps, artifactsDir);
  // Merge file-based spec artifacts
  for (const artifact of specFileArtifacts) {
    const savedPath = await saveArtifact(artifact, artifactsDir, 'spec-' + artifact.path);
    if (savedPath) {
      artifact.path = savedPath;
      specArtifacts.push(artifact);
    }
  }

  const sortedTestCases = [...testCases].sort(
    (a, b) => (a.location?.line ?? 0) - (b.location?.line ?? 0)
  );

  await updateTestCaseLocationsFromFile(sortedTestCases, testFilePath);

  sortedTestCases.sort(
    (a, b) => (a.location?.line ?? 0) - (b.location?.line ?? 0)
  );

  const propertyLogsByTestId = groupPropertyLogsByTestId(
    propertyLogs.filter((l) => {
      if (l.key.startsWith('spec.') || l.key.startsWith('instance.')) return false;
      if (l.key === 'JSON_ARTIFACT') {
        try {
          const artifact = JSON.parse(l.value);
          return artifact.level !== 'spec';
        } catch (e) {
          return true;
        }
      }
      return true;
    }),
    sortedTestCases
  );

  // Group attachment logs and merge them into propertyLogsByTestId
  const attachmentLogsByTestId = groupPropertyLogsByTestId(attachmentLogs, sortedTestCases);
  for (const [testId, logs] of Object.entries(attachmentLogsByTestId)) {
    if (!propertyLogsByTestId[testId]) {
      propertyLogsByTestId[testId] = [];
    }
    propertyLogsByTestId[testId].push(...logs);
  }
  
  // Distribute file-based test artifacts to tests
  const testFileArtifacts = fileArtifacts.filter(fa => fa.currentTestName && fa.artifact.level !== 'spec');
  
  for (const fa of testFileArtifacts) {
    const testId = findTestId(fa.currentTestName!, sortedTestCases);
    if (testId) {
      if (!propertyLogsByTestId[testId]) {
        propertyLogsByTestId[testId] = [];
      }
      propertyLogsByTestId[testId].push({
        key: 'JSON_ARTIFACT',
        value: JSON.stringify(fa.artifact),
        line: 0 // Dummy line
      });
    }
  }
  
  const stdioByTestId = groupStdioByTestId(
    stdioLogs,
    sortedTestCases
  );

  return {
    artifactsDir,
    propertyLogsByTestId,
    stdioByTestId,
    specArtifacts,
  };
}

async function processSpecArtifacts(
  logs: PropertyLog[],
  artifactsDir: string
): Promise<Artifact[]> {
  const parsedSpecArtifacts = parseSpecArtifactsFromLogs(logs);
  const specArtifacts: Artifact[] = [];

  for (const artifact of parsedSpecArtifacts) {
    const savedPath = await saveArtifact(artifact, artifactsDir, 'spec-' + artifact.path);
    if (savedPath) {
      artifact.path = savedPath;
      specArtifacts.push(artifact);
    }
  }
  return specArtifacts;
}

function parseSpecArtifactsFromLogs(logs: PropertyLog[]): Artifact[] {
  const artifactMap = new Map<number, Partial<Artifact>>();
  const jsonArtifacts: Artifact[] = [];

  for (const log of logs) {
    if (log.key === 'JSON_ARTIFACT') {
        try {
            const artifact = JSON.parse(log.value);
            if (artifact.path && artifact.type && artifact.contentType && artifact.level === 'spec') {
                jsonArtifacts.push(artifact);
            }
        } catch (e) {}
        continue;
    }

    const match = log.key.match(/^(?:spec|instance)\.(\d+)\.(.+)$/);
    if (!match) continue;

    const [, indexStr, field] = match;
    const index = parseInt(indexStr, 10);

    if (!artifactMap.has(index)) {
      artifactMap.set(index, {});
    }

    const artifact = artifactMap.get(index)!;
    if (field === 'path' || field === 'type' || field === 'contentType' || field === 'name') {
      (artifact as any)[field] = log.value;
    }
  }

  const indexedArtifacts = Array.from(artifactMap.values())
    .filter((a) => a.path && a.type && a.contentType && a.type !== 'stdout' && (a.type as string) !== 'stderr') as Artifact[];

  return [...indexedArtifacts, ...jsonArtifacts];
}

export async function createAttemptArtifacts({
  artifactsDir,
  testCaseId,
  attemptIndex,
  propertyLogsByTestId,
}: AttemptArtifactsOptions): Promise<{
  testArtifacts: Artifact[];
  attemptArtifacts: Artifact[];
}> {
  const testLogs = propertyLogsByTestId[testCaseId] ?? [];
  const testArtifacts: Artifact[] = [];
  const attemptArtifacts: Artifact[] = [];

  // Parse Test Level Artifacts (only once, regardless of attempt, but we process them here)
  if (attemptIndex === 0) {
    const testLevelProps = testLogs.filter(
      (l) => l.key.startsWith('test.') || l.key === 'JSON_ARTIFACT'
    );
    const parsedTestArtifacts = parseArtifactsFromLogs(testLevelProps, 'test');
    for (const artifact of parsedTestArtifacts) {
      const savedPath = await saveArtifact(artifact, artifactsDir, testCaseId);
      if (savedPath) {
        artifact.path = savedPath;
        testArtifacts.push(artifact);
      }
    }
  }

  // Parse Attempt Level Artifacts
  const attemptLevelProps = testLogs.filter((l) =>
    l.key.startsWith(`attempt.${attemptIndex}.`) || l.key === 'JSON_ARTIFACT'
  );
  const parsedAttemptArtifacts = parseArtifactsFromLogs(attemptLevelProps, 'attempt', attemptIndex);
  for (const artifact of parsedAttemptArtifacts) {
    const savedPath = await saveArtifact(artifact, artifactsDir, testCaseId + attemptIndex);
    if (savedPath) {
      artifact.path = savedPath;
      attemptArtifacts.push(artifact);
    }
  }

  return { testArtifacts, attemptArtifacts };
}

async function saveArtifact(artifact: Artifact, artifactsDir: string, hashKey: string): Promise<string | null> {
  try {
    const ext = artifact.path.split('.').pop() || 'bin';
    const originalName = artifact.path.split(/[/\\]/).pop() || 'artifact';
    // Use the original filename but prepend a short hash to avoid collisions while keeping it readable
    const fileName = `${generateShortHash(hashKey + artifact.path)}-${originalName}`;
    await copyFileAsync(artifact.path, join(artifactsDir, fileName));
    return join('artifacts', fileName);
  } catch (e) {
    debug('Failed to copy artifact %s: %o', artifact.path, e);
    return null;
  }
}

function parseArtifactsFromLogs(logs: PropertyLog[], level: ArtifactLevel, attemptIndex?: number): Artifact[] {
  const artifactMap = new Map<number, Partial<Artifact>>();
  // To handle JSON artifacts which don't have indices, we store them separately
  // or assign them a virtual index starting after the highest numeric index found.
  const jsonArtifacts: Artifact[] = [];

  for (const log of logs) {
    if (log.key === 'JSON_ARTIFACT') {
        try {
            const artifact = JSON.parse(log.value);
            const artifactLevel = artifact.level || 'attempt';
            
            if (artifact.path && artifact.type && artifact.contentType) {
                if (level === 'test' && artifactLevel === 'test') {
                    jsonArtifacts.push(artifact);
                } else if (level === 'attempt' && artifactLevel === 'attempt') {
                    if (artifact.attempt !== undefined && attemptIndex !== undefined && artifact.attempt !== attemptIndex) {
                        continue;
                    }
                    jsonArtifacts.push(artifact);
                }
            }
        } catch (e) {}
        continue;
    }

    // key format: "test.0.path" or "attempt.0.0.path"
    // we already filtered by prefix, so let's match the rest
    let match;
    if (level === 'test') {
      match = log.key.match(/^test\.(\d+)\.(.+)$/);
    } else {
      // attempt.0.0.path -> we already filtered by attempt.0. so we match the rest: 0.path
      // wait, the key in PropertyLog is the full key after "currents.artifact."
      // e.g. "attempt.0.0.path"
      // we need to extract the artifact index (second number)
      match = log.key.match(/^attempt\.\d+\.(\d+)\.(.+)$/);
    }

    if (!match) continue;

    const [, indexStr, field] = match;
    const index = parseInt(indexStr, 10);

    if (!artifactMap.has(index)) {
      artifactMap.set(index, {});
    }

    const artifact = artifactMap.get(index)!;
    if (field === 'path' || field === 'type' || field === 'contentType' || field === 'name') {
      (artifact as any)[field] = log.value;
    }
  }

  const indexedArtifacts = Array.from(artifactMap.values())
    .filter((a) => a.path && a.type && a.contentType && a.type !== 'stdout' && (a.type as string) !== 'stderr') as Artifact[];

  return [...indexedArtifacts, ...jsonArtifacts];
}

/** Prefer line from stack frame that references the test file so logs group to the right test. */
function getLineFromOrigin(
  origin: string | undefined,
  testFilePath: string
): number {
  if (!origin) return 0;
  const testFileName = testFilePath.split(/[/\\]/).pop() ?? '';
  const lines = origin.split('\n');
  // Prefer the frame that references the test file (user code)
  for (const line of lines) {
    if (testFileName && line.includes(testFileName)) {
      const lineMatch = line.match(/:(\d+):\d+/);
      if (lineMatch) return parseInt(lineMatch[1], 10);
    }
  }
  // Fallback: use last frame in stack (deepest = user code); Jest origin may not contain path
  const allMatches = [...origin.matchAll(/:(\d+):\d+/g)];
  const last = allMatches[allMatches.length - 1];
  return last ? parseInt(last[1], 10) : 0;
}

function parsePropertyLogs(
  consoleEntries: TestResult['console'],
  testFilePath: string
): PropertyLog[] {
  return (consoleEntries ?? [])
    .filter((log) => log.message.startsWith(PROPERTY_LOG_PREFIX))
    .map((log) => {
      // message: "currents.artifact.key=value" or "currents.artifact={json}"
      const content = log.message.substring(PROPERTY_LOG_PREFIX.length);
      const eqIndex = content.indexOf('=');
      const line = getLineFromOrigin(log.origin, testFilePath);

      // Handle JSON format: currents.artifact={"path":"...", "type":"..."}
      // Or just currents.artifact={...} (eqIndex would be -1 or check if content starts with {)
      if (content.trim().startsWith('{')) {
        try {
          const json = JSON.parse(content);
          return { key: 'JSON_ARTIFACT', value: JSON.stringify(json), line };
        } catch (e) {
          // Not JSON, fall through to key=value parsing
        }
      }

      if (eqIndex === -1) return null;
      
      const key = content.substring(0, eqIndex).trim();
      const value = content.substring(eqIndex + 1).trim();
      
      return { key, value, line };
    })
    .filter((a): a is PropertyLog => a !== null);
}

function parseAttachmentLogs(
  consoleEntries: TestResult['console'],
  testFilePath: string
): PropertyLog[] {
  return (consoleEntries ?? [])
    .map((log) => {
      // Look for [[CURRENTS.ATTACHMENT|path]] or [[CURRENTS.ATTACHMENT|path|level]] pattern
      
      // We use a regex that optionally captures a second parameter (level)
      // Format: [[CURRENTS.ATTACHMENT|path]] or [[CURRENTS.ATTACHMENT|path|level]]
      // The path cannot contain ']', so we use [^\]|]+ for path segment if followed by another |?
      // Simpler: [[CURRENTS.ATTACHMENT| part1 (| part2)? ]]
      
      const matches = [...log.message.matchAll(/\[\[CURRENTS\.ATTACHMENT\|([^|\]]+)(?:\|([^\]]+))?\]\]/g)];
      if (matches.length === 0) return [];
      
      const line = getLineFromOrigin(log.origin, testFilePath);
      
      return matches.map(match => {
        const filePath = match[1].trim();
        const levelRaw = match[2]?.trim();
        
        // Validate level if provided, default to 'attempt'
        let level = 'attempt';
        if (levelRaw && ['spec', 'test', 'attempt'].includes(levelRaw)) {
          level = levelRaw;
        }

        const artifact = {
          path: filePath,
          type: inferArtifactType(filePath),
          contentType: 'application/octet-stream', 
          level: level, 
        };
        
        return {
          key: 'JSON_ARTIFACT',
          value: JSON.stringify(artifact),
          line
        };
      });
    })
    .flat();
}

function inferArtifactType(filePath: string): Artifact['type'] {
  const ext = filePath.split('.').pop()?.toLowerCase();
  if (!ext) return 'attachment';
  
  if (['png', 'jpg', 'jpeg', 'gif'].includes(ext)) return 'screenshot';
  if (['mp4', 'webm', 'mov'].includes(ext)) return 'video';
  if (['json', 'txt', 'log', 'xml'].includes(ext)) return 'attachment';
  
  return 'attachment';
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

function readFileArtifacts(testFilePath: string): Array<{currentTestName?: string, artifact: Artifact}> {
  try {
    const hash = createHash('md5').update(testFilePath).digest('hex');
    const artifactsDir = join(process.cwd(), '.currents-artifacts');
    const filePath = join(artifactsDir, `${hash}.jsonl`);
    
    if (!existsSync(filePath)) return [];
    
    const content = readFileSync(filePath, 'utf8');
    // Clean up file after reading
    try { unlinkSync(filePath); } catch(e) {}
    
    return content.split('\n')
      .filter(line => line.trim())
      .map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch (e) {
    debug('Failed to read artifact file for %s: %o', testFilePath, e);
    return [];
  }
}

function findTestId(testName: string, testCases: TestCaseForArtifacts[]): string | undefined {
  // Try exact match first
  const exact = testCases.find(tc => tc.title.join(' ') === testName);
  if (exact) return exact.id;
  
  // Jest sometimes modifies test names or we might have partial matches?
  // Usually title.join(' ') matches expect.getState().currentTestName
  return undefined;
}

function groupByTestId<T>(
  items: T[],
  sortedTestCases: TestCaseForArtifacts[],
  getLine: (item: T) => number
): Record<string, T[]> {
  const byTestId: Record<string, T[]> = {};

  items.forEach((item) => {
    let owner = sortedTestCases[0];
    for (const tc of sortedTestCases) {
      if ((tc.location?.line ?? 0) <= getLine(item)) {
        owner = tc;
      } else {
        break;
      }
    }
    if (owner) {
      if (!byTestId[owner.id]) byTestId[owner.id] = [];
      byTestId[owner.id].push(item);
    }
  });

  return byTestId;
}

function groupPropertyLogsByTestId(
  logs: PropertyLog[],
  sortedTestCases: TestCaseForArtifacts[]
): Record<string, PropertyLog[]> {
  return groupByTestId(logs, sortedTestCases, (l) => l.line);
}

function parseStdioLogs(
  consoleEntries: TestResult['console'],
  testFilePath: string
): StdioLog[] {
  return (consoleEntries ?? [])
    .filter((log) => !log.message.startsWith(PROPERTY_LOG_PREFIX))
    .map((log) => {
      const line = getLineFromOrigin(log.origin, testFilePath);
      return { message: log.message, type: log.type, line };
    });
}

function groupStdioByTestId(
  stdioLogs: StdioLog[],
  sortedTestCases: TestCaseForArtifacts[]
): Record<string, StdioLog[]> {
  return groupByTestId(stdioLogs, sortedTestCases, (log) => log.line);
}
