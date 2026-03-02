
import { join } from 'path';
import { prepareArtifacts, createAttemptArtifacts } from './artifacts';
import * as lib from './lib';
import * as fs from 'fs';

// Mock dependencies
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  unlinkSync: jest.fn(),
}));

jest.mock('./lib', () => ({
  createFolder: jest.fn(),
  readFileAsync: jest.fn(),
  copyFileAsync: jest.fn(),
  generateShortHash: jest.fn((str) => 'hash'),
  getArtifactsDir: jest.fn(),
  debug: jest.fn(),
}));

describe('artifacts', () => {
  const mockReportDir = '/tmp/report';
  const mockTestFilePath = '/path/to/test.ts';
  const mockArtifactsDir = '/tmp/report/artifacts';

  beforeEach(() => {
    jest.clearAllMocks();
    (lib.createFolder as jest.Mock).mockResolvedValue(mockArtifactsDir);
    (lib.getArtifactsDir as jest.Mock).mockReturnValue('/tmp/artifacts');
    (lib.copyFileAsync as jest.Mock).mockResolvedValue(undefined);
  });

  describe('prepareArtifacts', () => {
    it('should process spec-level artifacts from logs', async () => {
      const testResult = {
        console: [
          {
            message: 'currents.artifact.spec.0.path=/path/to/spec.png',
            origin: 'stack',
            type: 'log',
          },
          {
            message: 'currents.artifact.spec.0.type=screenshot',
            origin: 'stack',
            type: 'log',
          },
          {
            message: 'currents.artifact.spec.0.contentType=image/png',
            origin: 'stack',
            type: 'log',
          },
        ],
      } as any;

      const result = await prepareArtifacts({
        reportDir: mockReportDir,
        testResult,
        testFilePath: mockTestFilePath,
        testCases: [],
      });

      expect(lib.createFolder).toHaveBeenCalledWith(join(mockReportDir, 'artifacts'));
      expect(result.specArtifacts).toHaveLength(1);
      expect(result.specArtifacts[0]).toEqual({
        path: 'artifacts/hash-spec.png',
        type: 'screenshot',
        contentType: 'image/png',
      });
      expect(lib.copyFileAsync).toHaveBeenCalledWith(
        '/path/to/spec.png',
        join(mockArtifactsDir, 'hash-spec.png')
      );
    });

    it('should process spec-level artifacts from JSON logs', async () => {
      const artifact = {
        path: '/path/to/spec.json',
        type: 'attachment',
        contentType: 'application/json',
        level: 'spec',
      };
      const testResult = {
        console: [
          {
            message: `currents.artifact.${JSON.stringify(artifact)}`,
            origin: 'stack',
            type: 'log',
          },
        ],
      } as any;

      const result = await prepareArtifacts({
        reportDir: mockReportDir,
        testResult,
        testFilePath: mockTestFilePath,
        testCases: [],
      });

      expect(result.specArtifacts).toHaveLength(1);
      expect(result.specArtifacts[0]).toEqual({
        path: 'artifacts/hash-spec.json',
        type: 'attachment',
        contentType: 'application/json',
        level: 'spec',
      });
    });

    it('should process file-based spec artifacts', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(
        JSON.stringify({
          artifact: {
            path: '/path/to/file-spec.png',
            type: 'screenshot',
            contentType: 'image/png',
            level: 'spec',
          },
        })
      );

      const result = await prepareArtifacts({
        reportDir: mockReportDir,
        testResult: { console: [] } as any,
        testFilePath: mockTestFilePath,
        testCases: [],
      });

      expect(result.specArtifacts).toHaveLength(1);
      expect(result.specArtifacts[0]).toEqual({
        path: 'artifacts/hash-file-spec.png',
        type: 'screenshot',
        contentType: 'image/png',
        level: 'spec',
      });
      expect(fs.unlinkSync).toHaveBeenCalled();
    });

    it('should group property logs by test ID', async () => {
      const testResult = {
        console: [
          {
            message: 'currents.artifact.test.0.path=/path/to/test.png',
            origin: `${mockTestFilePath}:10:1`, // Line 10
            type: 'log',
          },
        ],
      } as any;

      const testCases = [
        {
          id: 'test-1',
          title: ['test 1'],
          location: { line: 10, column: 1 },
        },
      ];

      (lib.readFileAsync as jest.Mock).mockResolvedValue(''); // Mock file content for location update

      const result = await prepareArtifacts({
        reportDir: mockReportDir,
        testResult,
        testFilePath: mockTestFilePath,
        testCases: testCases as any,
      });

      expect(result.propertyLogsByTestId['test-1']).toHaveLength(1);
      expect(result.propertyLogsByTestId['test-1'][0].key).toBe('test.0.path');
    });

    it('should parse attachment logs', async () => {
      const testResult = {
        console: [
          {
            message: '[[CURRENTS.ATTACHMENT|/path/to/attach.txt]]',
            origin: `${mockTestFilePath}:10:1`,
            type: 'log',
          },
        ],
      } as any;

      const testCases = [
        {
          id: 'test-1',
          title: ['test 1'],
          location: { line: 10, column: 1 },
        },
      ];

      (lib.readFileAsync as jest.Mock).mockResolvedValue('');

      const result = await prepareArtifacts({
        reportDir: mockReportDir,
        testResult,
        testFilePath: mockTestFilePath,
        testCases: testCases as any,
      });

      expect(result.propertyLogsByTestId['test-1']).toHaveLength(1);
      const log = result.propertyLogsByTestId['test-1'][0];
      expect(log.key).toBe('JSON_ARTIFACT');
      const artifact = JSON.parse(log.value);
      expect(artifact).toEqual({
        path: '/path/to/attach.txt',
        type: 'attachment',
        contentType: 'application/octet-stream',
        level: 'attempt',
      });
    });
  });

  describe('createAttemptArtifacts', () => {
    it('should process test-level artifacts when attemptIndex is 0', async () => {
      const propertyLogsByTestId = {
        'test-1': [
          { key: 'test.0.path', value: '/path/to/test.png', line: 10 },
          { key: 'test.0.type', value: 'screenshot', line: 10 },
          { key: 'test.0.contentType', value: 'image/png', line: 10 },
        ],
      };

      const result = await createAttemptArtifacts({
        artifactsDir: mockArtifactsDir,
        testCaseId: 'test-1',
        attemptIndex: 0,
        propertyLogsByTestId,
      });

      expect(result.testArtifacts).toHaveLength(1);
      expect(result.testArtifacts[0]).toEqual({
        path: 'artifacts/hash-test.png',
        type: 'screenshot',
        contentType: 'image/png',
      });
      expect(lib.copyFileAsync).toHaveBeenCalledWith(
        '/path/to/test.png',
        join(mockArtifactsDir, 'hash-test.png')
      );
    });

    it('should NOT process test-level artifacts when attemptIndex is > 0', async () => {
      const propertyLogsByTestId = {
        'test-1': [
          { key: 'test.0.path', value: '/path/to/test.png', line: 10 },
          { key: 'test.0.type', value: 'screenshot', line: 10 },
          { key: 'test.0.contentType', value: 'image/png', line: 10 },
        ],
      };

      const result = await createAttemptArtifacts({
        artifactsDir: mockArtifactsDir,
        testCaseId: 'test-1',
        attemptIndex: 1,
        propertyLogsByTestId,
      });

      expect(result.testArtifacts).toHaveLength(0);
    });

    it('should process attempt-level artifacts', async () => {
      const propertyLogsByTestId = {
        'test-1': [
          { key: 'attempt.0.0.path', value: '/path/to/attempt.png', line: 10 },
          { key: 'attempt.0.0.type', value: 'screenshot', line: 10 },
          { key: 'attempt.0.0.contentType', value: 'image/png', line: 10 },
          // Should ignore attempt 1
          { key: 'attempt.1.0.path', value: '/path/to/other.png', line: 10 },
        ],
      };

      const result = await createAttemptArtifacts({
        artifactsDir: mockArtifactsDir,
        testCaseId: 'test-1',
        attemptIndex: 0,
        propertyLogsByTestId,
      });

      expect(result.attemptArtifacts).toHaveLength(1);
      expect(result.attemptArtifacts[0]).toEqual({
        path: 'artifacts/hash-attempt.png',
        type: 'screenshot',
        contentType: 'image/png',
      });
    });

    it('should process JSON artifacts with correct level', async () => {
      const testArtifact = {
        path: '/path/to/test.json',
        type: 'attachment',
        contentType: 'application/json',
        level: 'test',
      };
      const attemptArtifact = {
        path: '/path/to/attempt.json',
        type: 'attachment',
        contentType: 'application/json',
        level: 'attempt',
        attempt: 0,
      };

      const propertyLogsByTestId = {
        'test-1': [
          { key: 'JSON_ARTIFACT', value: JSON.stringify(testArtifact), line: 10 },
          { key: 'JSON_ARTIFACT', value: JSON.stringify(attemptArtifact), line: 10 },
        ],
      };

      const result = await createAttemptArtifacts({
        artifactsDir: mockArtifactsDir,
        testCaseId: 'test-1',
        attemptIndex: 0,
        propertyLogsByTestId,
      });

      expect(result.testArtifacts).toHaveLength(1);
      expect(result.attemptArtifacts).toHaveLength(1);
    });
  });
});
