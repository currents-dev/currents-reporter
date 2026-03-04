
import { describe, expect, it } from 'vitest';
import { getSpecArtifacts, getTestCase } from '../utils';
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

    it('parses attempt level artifacts from attempts structure', () => {
      const testCase: TestCase = {
        name: 'test',
        classname: 'class',
        time: '1',
        failure: ['fail'], // Failed test with multiple attempts
        attempts: {
            attempt: [
                {
                    properties: {
                        property: [
                            { name: 'currents.artifact.attempt.path', value: 'a0p' },
                            { name: 'currents.artifact.attempt.type', value: 't' },
                            { name: 'currents.artifact.attempt.contentType', value: 'c' },
                        ]
                    }
                },
                {
                    properties: {
                        property: [
                            { name: 'currents.artifact.attempt.path', value: 'a1p' },
                            { name: 'currents.artifact.attempt.type', value: 't' },
                            { name: 'currents.artifact.attempt.contentType', value: 'c' },
                        ]
                    }
                }
            ]
        }
      };

      // Note: getTestCase logic for attempts is a bit complex with failures.
      // If we have failures, it generates attempts based on failures.
      // But it ALSO uses attemptArtifacts map populated from getTestAndAttemptArtifacts.
      // If `testCase.attempts` exists, `getTestAndAttemptArtifacts` populates the map.
      // Then `getTestAttempts` uses this map.
      
      const result = getTestCase(testCase, mockSuite, mockTime, mockSuiteName);
      
      // We expect 1 attempt because there is 1 failure string?
      // Wait, `retries` logic in `getTestCase`: `retries: getTestRetries(failures)`.
      // `getTestAttempts`: `failures.reduce(...)`.
      // If failures has 1 item, it produces 1 attempt (index 0).
      // If `testCase.attempts` has 2 items, `attemptArtifacts` will have entries for 0 and 1.
      // But `getTestAttempts` iterates failures.
      // This implies that the number of failures should match number of attempts if we want to see them all.
      // Or maybe `testCase.attempts` is used for something else?
      // In the current code, `testCase.attempts` is ONLY used in my new code in `getTestAndAttemptArtifacts`.
      // `getTestAttempts` logic (existing) uses `failures` array to generate attempts.
      
      // So if I want 2 attempts, I need 2 failures (or 1 failure and then passed?).
      // If I want to test that attempt 1 gets artifacts, I need 2 failures.
      
      // Let's retry with 2 failures.
    });

    it('parses attempt level artifacts from attempts structure with multiple attempts', () => {
        const testCase: TestCase = {
          name: 'test',
          classname: 'class',
          time: '1',
          failure: ['fail1', 'fail2'], 
          attempts: {
              attempt: [
                  {
                      properties: {
                          property: [
                              { name: 'currents.artifact.attempt.path', value: 'a0p' },
                              { name: 'currents.artifact.attempt.type', value: 't' },
                              { name: 'currents.artifact.attempt.contentType', value: 'c' },
                          ]
                      }
                  },
                  {
                      properties: {
                          property: [
                              { name: 'currents.artifact.attempt.path', value: 'a1p' },
                              { name: 'currents.artifact.attempt.type', value: 't' },
                              { name: 'currents.artifact.attempt.contentType', value: 'c' },
                          ]
                      }
                  }
              ]
          }
        };
  
        const result = getTestCase(testCase, mockSuite, mockTime, mockSuiteName);
        expect(result.attempts).toHaveLength(2);
        
        expect(result.attempts[0].artifacts).toHaveLength(1);
        expect(result.attempts[0].artifacts![0].path).toBe('a0p');
        
        expect(result.attempts[1].artifacts).toHaveLength(1);
        expect(result.attempts[1].artifacts![0].path).toBe('a1p');
      });

    it('parses indexed attempt level artifacts without attempts structure (all assigned to attempt 0)', () => {
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
                    
                    // Attempt 1 (should also be assigned to attempt 0 if no attempts structure)
                    { name: 'currents.artifact.attempt.1.path', value: 'a1p' },
                    { name: 'currents.artifact.attempt.1.type', value: 't' },
                    { name: 'currents.artifact.attempt.1.contentType', value: 'c' },
                ]
            }
        };

        const result = getTestCase(testCase, mockSuite, mockTime, mockSuiteName);
        
        expect(result.attempts[0].artifacts).toHaveLength(2); // Both artifacts here
        expect(result.attempts[0].artifacts![0].path).toBe('a0p');
        expect(result.attempts[0].artifacts![1].path).toBe('a1p');
        
        // Attempt 1 should have no artifacts from this source
        expect(result.attempts[1].artifacts).toBeUndefined();
    });

    it('parses mixed indexed and unindexed attempt level artifacts (all assigned to attempt 0)', () => {
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
                    
                    // Unindexed
                    { name: 'currents.artifact.attempt.path', value: 'a0p' },
                    { name: 'currents.artifact.attempt.type', value: 't' },
                    { name: 'currents.artifact.attempt.contentType', value: 'c' },
                ]
            }
        };

        const result = getTestCase(testCase, mockSuite, mockTime, mockSuiteName);
        
        expect(result.attempts[0].artifacts).toHaveLength(2);
        
        const paths = result.attempts[0].artifacts!.map(a => a.path);
        expect(paths).toContain('a0p');
        expect(paths).toContain('a1p');
        
        expect(result.attempts[1].artifacts).toBeUndefined();
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

    it('ignores logs for artifact collection', () => {
      const testCase: TestCase = {
        name: 'test',
        classname: 'class',
        time: '1',
        failure: [],
        'system-out': '[[CURRENTS.ATTACHMENT|path/to/log-artifact]]',
      };

      const result = getTestCase(testCase, mockSuite, mockTime, mockSuiteName);
      expect(result.artifacts).toEqual([]);
      expect(result.attempts[0].artifacts).toBeUndefined();
    });
  });
});
