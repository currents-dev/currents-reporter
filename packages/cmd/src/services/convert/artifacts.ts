import { debug } from '@debug';
import { copyFileAsync, generateShortHash } from '@lib';
import { extname, isAbsolute, join, relative, resolve } from 'path';
import { Artifact } from '../../types';
import { Property, TestCase, TestSuite } from './types';

export const processArtifacts = async (
  artifacts: Artifact[] | undefined,
  hashKey: string,
  artifactsDir: string,
  workspaceRoot: string
) => {
  if (!artifacts) return;

  for (const artifact of artifacts) {
    try {
      const resolvedPath = resolve(workspaceRoot, artifact.path);
      const relativePath = relative(workspaceRoot, resolvedPath);

      if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
        debug(
          'Skipping artifact outside workspace: %s (resolved: %s)',
          artifact.path,
          resolvedPath
        );
        continue;
      }

      const fileName = `${generateShortHash(
        hashKey + artifact.path
      )}.${extname(artifact.path).slice(1) || 'bin'}`;
      await copyFileAsync(resolvedPath, join(artifactsDir, fileName));
      // Update path to relative path in artifacts folder
      artifact.path = join('artifacts', fileName);
    } catch (e) {
      debug('Failed to copy artifact %s: %o', artifact.path, e);
    }
  }
};

export function getSpecArtifacts(suite: TestSuite): Artifact[] {
  // Properties can be nested in <properties> or direct children of <testsuite>
  const properties = ensureArray<Property>(
    suite.properties?.property ?? (suite as any).property
  );
  return parseArtifacts(properties, 'currents.artifact.instance.', 'spec');
}

export function getTestAndAttemptArtifacts(testCase: TestCase): {
  testArtifacts: Artifact[];
  attemptArtifacts: Map<number, Artifact[]>;
} {
  const properties = ensureArray<Property>(testCase.properties?.property);
  const testArtifacts = parseArtifacts(
    properties,
    'currents.artifact.test.',
    'test'
  );
  const attemptArtifacts = new Map<number, Artifact[]>();

  // Parse explicitly indexed artifacts from testCase properties
  const indexedArtifactsMap = parseIndexedAttemptArtifacts(properties);
  indexedArtifactsMap.forEach((artifacts, index) => {
    if (!attemptArtifacts.has(index)) {
      attemptArtifacts.set(index, []);
    }
    attemptArtifacts.get(index)!.push(...artifacts);
  });

  // Parse unindexed artifacts from testCase properties (assigned to attempt 0)
  const defaultArtifacts = parseArtifacts(
    properties,
    'currents.artifact.attempt.',
    'attempt'
  );
  if (defaultArtifacts.length > 0) {
    if (!attemptArtifacts.has(0)) {
      attemptArtifacts.set(0, []);
    }
    attemptArtifacts.get(0)!.push(...defaultArtifacts);
  }

  return { testArtifacts, attemptArtifacts };
}

function parseIndexedAttemptArtifacts(
  properties: Property[]
): Map<number, Artifact[]> {
  const result = new Map<number, Artifact[]>();
  const regex = /^currents\.artifact\.attempt\.(\d+)\.(.+)$/;

  // Group properties by attempt index
  const attemptProperties = new Map<number, Property[]>();

  for (const prop of properties) {
    const value = prop.value ?? prop._;
    if (!prop.name || !value) continue;
    const match = prop.name.match(regex);
    if (!match) continue;

    const [, indexStr, key] = match;
    const index = parseInt(indexStr, 10);

    if (!attemptProperties.has(index)) {
      attemptProperties.set(index, []);
    }

    attemptProperties.get(index)!.push({
      name: `currents.artifact.attempt.${key}`,
      value: value,
    });
  }

  for (const [index, props] of attemptProperties.entries()) {
    const artifacts = parseArtifacts(
      props,
      'currents.artifact.attempt.',
      'attempt'
    );
    if (artifacts.length > 0) {
      result.set(index, artifacts);
    }
  }

  return result;
}

function parseArtifacts(
  properties: Property[],
  prefix: string,
  level: Artifact['level']
): Artifact[] {
  const artifacts: Artifact[] = [];
  let currentArtifact: Partial<Artifact> = {};

  for (const prop of properties) {
    const value = prop.value ?? prop._;
    if (!prop.name || !value) continue;
    if (!prop.name.startsWith(prefix)) continue;

    const key = prop.name.slice(prefix.length);
    // Valid keys: path, type, contentType, name
    // Also ignore keys that start with a number (indexed artifacts handled separately)
    if (/^\d+\./.test(key)) continue;

    if (!['path', 'type', 'contentType', 'name'].includes(key)) continue;

    // If key already exists in current artifact, it means we are starting a new artifact
    // (assuming properties are grouped by artifact)
    if (currentArtifact[key as keyof Artifact]) {
      if (isValidArtifact(currentArtifact)) {
        artifacts.push({ ...currentArtifact, level } as Artifact);
      }
      currentArtifact = {};
    }

    (currentArtifact as any)[key] = value;
  }

  // Push the last artifact
  if (isValidArtifact(currentArtifact)) {
    artifacts.push({ ...currentArtifact, level } as Artifact);
  }

  return artifacts;
}

function isValidArtifact(a: Partial<Artifact>): boolean {
  return !!(a.path && a.type && a.contentType);
}

function ensureArray<T>(value: unknown): T[] {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : ([value] as T[]);
}
