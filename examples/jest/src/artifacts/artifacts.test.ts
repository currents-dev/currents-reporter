import * as fs from 'fs';
import * as path from 'path';
import { attachFile } from '@currents/jest';

const artifactsDir = path.join(__dirname, '..', '..', 'artifacts');
if (!fs.existsSync(artifactsDir)) {
  fs.mkdirSync(artifactsDir, { recursive: true });
}

describe('Artifacts Test', () => {
  it('should upload spec, test, and attempt level artifacts', () => {
    // Prepare artifact files
    const specArtifact = path.join(artifactsDir, 'spec-artifact.txt');
    fs.writeFileSync(specArtifact, 'Spec level artifact content\n', 'utf8');
    
    const testArtifact = path.join(artifactsDir, 'test-artifact.txt');
    fs.writeFileSync(testArtifact, 'Test level artifact content\n', 'utf8');
    
    const attemptArtifact = path.join(artifactsDir, 'attempt-artifact.txt');
    fs.writeFileSync(attemptArtifact, 'Attempt level artifact content\n', 'utf8');

    attachFile(specArtifact, undefined, 'spec');
    attachFile(testArtifact, undefined, 'test');
    attachFile(attemptArtifact);

    expect(true).toBe(true);
  });

  // Jest retry support
  // Jest.retryTimes(n) allows retrying failed tests.
  // We can simulate failure on first attempt and success on second.
  // We need to persist state between retries. Since Jest runs tests in isolation, we use a file.

  it('generates artifacts for multiple attempts', () => {
    const artifactsDir = path.join(__dirname, '..', '..', 'artifacts');
    const attemptFile = path.join(artifactsDir, 'jest-attempt-count.txt');
    
    let attempt = 0;
    if (fs.existsSync(attemptFile)) {
      attempt = parseInt(fs.readFileSync(attemptFile, 'utf8'), 10);
    }
    attempt++;
    fs.writeFileSync(attemptFile, attempt.toString(), 'utf8');

    const artifactPath = path.join(artifactsDir, `jest-attempt-${attempt}.txt`);
    fs.writeFileSync(artifactPath, `Jest Artifact for attempt ${attempt}`, 'utf8');
    
    // Attach artifact using helper (default level is attempt)
    attachFile(artifactPath);

    if (attempt < 2) {
      throw new Error('Simulated Jest failure for attempt ' + attempt);
    }
    
    expect(true).toBe(true);
  });
});

jest.retryTimes(2);
