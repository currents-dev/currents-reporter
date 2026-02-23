import * as fs from 'fs';
import * as path from 'path';

describe('Artifacts Test', () => {
  it('should generate stdout and stderr', () => {
    console.log('This is a stdout message from the test');
    console.error('This is a stderr message from the test');
    expect(true).toBe(true);
  });

  it('should upload an attachment', () => {
    const artifactsDir = path.join(__dirname, '..', '..', 'artifacts');
    if (!fs.existsSync(artifactsDir)) {
      fs.mkdirSync(artifactsDir, { recursive: true });
    }
    const attachmentPath = path.join(artifactsDir, 'attachment-sample.txt');
    fs.writeFileSync(attachmentPath, 'Sample attachment content for upload\n', 'utf8');
    console.log(`[[ATTACHMENT|${attachmentPath}]]`);
    expect(fs.existsSync(attachmentPath)).toBe(true);
  });
});
