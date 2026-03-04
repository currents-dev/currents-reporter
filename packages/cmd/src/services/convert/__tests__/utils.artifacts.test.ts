
import { describe, expect, it } from 'vitest';
import { getSpecArtifacts } from '../artifacts';
import { getTestCase } from '../utils';
import { TestCase, TestSuite } from '../types';

describe('Artifact Parsing', () => {
  describe('getSpecArtifacts', () => {
    it('parses instance level artifacts from properties', () => {
      const suite: TestSuite = {
        properties: {
          property: [
            { name: 'currents.artifact.instance.path', value: 'path/to/artifact' },
            { name: 'currents.artifact.instance.type', value: 'video' },
            { name: 'currents.artifact.instance.contentType', value: 'video/mp4' },
            { name: 'currents.artifact.instance.name', value: 'My Artifact' },
          ],
        },
      };

      const artifacts = getSpecArtifacts(suite);
      expect(artifacts).toHaveLength(1);
      expect(artifacts[0]).toEqual({
        path: 'path/to/artifact',
        type: 'video',
        contentType: 'video/mp4',
        name: 'My Artifact',
        level: 'spec',
      });
    });

    it('parses multiple instance level artifacts', () => {
      const suite: TestSuite = {
        properties: {
          property: [
            { name: 'currents.artifact.instance.path', value: 'p1' },
            { name: 'currents.artifact.instance.type', value: 't1' },
            { name: 'currents.artifact.instance.contentType', value: 'c1' },
            
            { name: 'currents.artifact.instance.path', value: 'p2' },
            { name: 'currents.artifact.instance.type', value: 't2' },
            { name: 'currents.artifact.instance.contentType', value: 'c2' },
          ],
        },
      };

      const artifacts = getSpecArtifacts(suite);
      expect(artifacts).toHaveLength(2);
      expect(artifacts[0].path).toBe('p1');
      expect(artifacts[1].path).toBe('p2');
    });
  });

  describe('getTestCase (Artifacts)', () => {
    const mockSuite: TestSuite = {
      name: 'suite',
      timestamp: new Date().toISOString(),
      file: 'file.js',
    };
    const mockTime = 1000;
    const mockSuiteName = 'suite';

    it('parses test level artifacts', () => {
      const testCase: TestCase = {
        name: 'test',
        classname: 'class',
        time: '1',
        failure: [],
        properties: {
          property: [
            { name: 'currents.artifact.test.path', value: 'p1' },
            { name: 'currents.artifact.test.type', value: 't1' },
            { name: 'currents.artifact.test.contentType', value: 'c1' },
          ],
        },
      };

      const result = getTestCase(testCase, mockSuite, mockTime, mockSuiteName);
      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts![0]).toEqual({
        path: 'p1',
        type: 't1',
        contentType: 'c1',
        level: 'test',
      });
    });

    it('parses attempt level artifacts when no attempts structure exists (assigns to attempt 0)', () => {
      const testCase: TestCase = {
        name: 'test',
        classname: 'class',
        time: '1',
        failure: [], // Passed test
        properties: {
          property: [
            { name: 'currents.artifact.attempt.path', value: 'p1' },
            { name: 'currents.artifact.attempt.type', value: 't1' },
            { name: 'currents.artifact.attempt.contentType', value: 'c1' },
          ],
        },
      };

      const result = getTestCase(testCase, mockSuite, mockTime, mockSuiteName);
      expect(result.attempts).toHaveLength(1);
      expect(result.attempts[0].attempt).toBe(0);
      expect(result.attempts[0].artifacts).toHaveLength(1);
      expect(result.attempts[0].artifacts![0]).toEqual({
        path: 'p1',
        type: 't1',
        contentType: 'c1',
        level: 'attempt',
      });
    });

    it('parses indexed attempt level artifacts without attempts structure (all assigned to attempt 0)', () => {
        // Logic change: Indexed artifacts are only assigned to their specific attempt index.
        // They are NOT rolled up to attempt 0 if they don't match the attempt index.
        // In this test case, we have 2 failures (fail0, fail1), so we have attempt 0 and attempt 1.
        
        const testCase: TestCase = {
            name: 'test',
            classname: 'class',
            time: '1',
            failure: ['fail0', 'fail1'], 
            properties: {
                property: [
                    // Attempt 0
                    { name: 'currents.artifact.attempt.0.path', value: 'a0p' },
                    { name: 'currents.artifact.attempt.0.type', value: 't' },
                    { name: 'currents.artifact.attempt.0.contentType', value: 'c' },
                    
                    // Attempt 1
                    { name: 'currents.artifact.attempt.1.path', value: 'a1p' },
                    { name: 'currents.artifact.attempt.1.type', value: 't' },
                    { name: 'currents.artifact.attempt.1.contentType', value: 'c' },
                ]
            }
        };

        const result = getTestCase(testCase, mockSuite, mockTime, mockSuiteName);
        
        expect(result.attempts[0].artifacts).toHaveLength(1);
        expect(result.attempts[0].artifacts![0].path).toBe('a0p');
        
        expect(result.attempts[1].artifacts).toHaveLength(1);
        expect(result.attempts[1].artifacts![0].path).toBe('a1p');
    });

    it('parses mixed indexed and unindexed attempt level artifacts (all assigned to attempt 0)', () => {
        // Logic change: Unindexed artifacts are assigned to attempt 0.
        // Indexed artifacts are assigned to their specific attempt.
        
        const testCase: TestCase = {
            name: 'test',
            classname: 'class',
            time: '1',
            failure: ['fail0', 'fail1'], 
            properties: {
                property: [
                    // Indexed Attempt 1
                    { name: 'currents.artifact.attempt.1.path', value: 'a1p' },
                    { name: 'currents.artifact.attempt.1.type', value: 't' },
                    { name: 'currents.artifact.attempt.1.contentType', value: 'c' },
                    
                    // Unindexed (goes to attempt 0)
                    { name: 'currents.artifact.attempt.path', value: 'a0p' },
                    { name: 'currents.artifact.attempt.type', value: 't' },
                    { name: 'currents.artifact.attempt.contentType', value: 'c' },
                ]
            }
        };

        const result = getTestCase(testCase, mockSuite, mockTime, mockSuiteName);
        
        expect(result.attempts[0].artifacts).toHaveLength(1);
        expect(result.attempts[0].artifacts![0].path).toBe('a0p');
        
        expect(result.attempts[1].artifacts).toHaveLength(1);
        expect(result.attempts[1].artifacts![0].path).toBe('a1p');
    });

    it('parses instance level artifacts from direct property children of testsuite', () => {
        // Simulating the structure where property is direct child of suite, not nested in properties
        const suite: TestSuite = {
            name: 'suite',
            timestamp: new Date().toISOString(),
            file: 'file.js',
            property: [
                { name: 'currents.artifact.instance.path', value: 'path/to/artifact' },
                { name: 'currents.artifact.instance.type', value: 'video' },
                { name: 'currents.artifact.instance.contentType', value: 'video/mp4' },
                { name: 'currents.artifact.instance.name', value: 'My Artifact' },
            ]
        } as any;

        const artifacts = getSpecArtifacts(suite);
        expect(artifacts).toHaveLength(1);
        expect(artifacts[0]).toEqual({
            path: 'path/to/artifact',
            type: 'video',
            contentType: 'video/mp4',
            name: 'My Artifact',
            level: 'spec',
        });
    });
  });
});
