import { attachArtifact } from '@currents/cmd/helpers';
import fs from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

describe('Vitest JUnit artifacts', () => {
  const artifactsDir = join(process.cwd(), 'artifacts');

  beforeAll(() => {
    if (!fs.existsSync(artifactsDir)) {
      fs.mkdirSync(artifactsDir, { recursive: true });
    }
    // Reset attempt counter for retry test
    const attemptFile = join(artifactsDir, 'attempt-count.txt');
    if (fs.existsSync(attemptFile)) {
      fs.unlinkSync(attemptFile);
    }
  });

  it('generates stdout and stderr', () => {
    console.log('This is a stdout message from the test');
    console.error('This is a stderr message from the test');
    expect(true).toBe(true);
  });

  it('generates spec, test, and attempt level artifacts via JSON logs', () => {
    // Prepare artifact files
    const specArtifact = join(artifactsDir, 'spec-artifact.json.txt');
    fs.writeFileSync(
      specArtifact,
      'Spec level artifact content (JSON)\n',
      'utf8'
    );

    const testArtifact = join(artifactsDir, 'test-artifact.json.txt');
    fs.writeFileSync(
      testArtifact,
      'Test level artifact content (JSON)\n',
      'utf8'
    );

    const attemptArtifact = join(artifactsDir, 'attempt-artifact.json.txt');
    fs.writeFileSync(
      attemptArtifact,
      'Attempt level artifact content (JSON)\n',
      'utf8'
    );

    // 1. Spec Level Artifact via JSON
    attachArtifact(specArtifact, 'attachment', 'text/plain', 'spec');

    // 2. Test Level Artifact via JSON
    attachArtifact(testArtifact, 'attachment', 'text/plain', 'test');

    // 3. Attempt Level Artifact via JSON
    attachArtifact(attemptArtifact, 'attachment', 'text/plain', 'attempt');

    expect(true).toBe(true);
  });

  it('generates artifacts via [[CURRENTS.ATTACHMENT]] tag with explicit levels', () => {
    const specPath = join(artifactsDir, 'spec-attachment.txt');
    fs.writeFileSync(specPath, 'Spec attachment', 'utf8');

    const testPath = join(artifactsDir, 'test-attachment.txt');
    fs.writeFileSync(testPath, 'Test attachment', 'utf8');

    const attemptPath = join(artifactsDir, 'attempt-attachment.txt');
    fs.writeFileSync(attemptPath, 'Attempt attachment', 'utf8');

    // [[CURRENTS.ATTACHMENT|path|level]]
    console.log(`[[CURRENTS.ATTACHMENT|${specPath}|spec]]`);
    console.log(`[[CURRENTS.ATTACHMENT|${testPath}|test]]`);
    console.log(`[[CURRENTS.ATTACHMENT|${attemptPath}|attempt]]`);

    // Default is attempt
    const defaultPath = join(artifactsDir, 'default-attachment.txt');
    fs.writeFileSync(defaultPath, 'Default attachment', 'utf8');
    console.log(`[[CURRENTS.ATTACHMENT|${defaultPath}]]`);

    expect(true).toBe(true);
  });

  it('attaches log files as artifacts', () => {
    const logPath = join(artifactsDir, 'app.log');
    fs.writeFileSync(
      logPath,
      '2024-01-01 12:00:00 [INFO] Application started\n2024-01-01 12:00:01 [WARN] Low memory',
      'utf8'
    );

    // Attach as a generic file/log
    attachArtifact(logPath, 'attachment', 'text/plain', 'test');

    expect(true).toBe(true);
  });

  it('generates a video artifact and logs attachment marker', () => {
    const videoPath = join(artifactsDir, 'vitest-video.mp4');
    const validMp4Base64 =
      'AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAAAAZtZGF0AAAC6W1vb3YAAABsbXZoZAAAAAAAAAAAAAAAAAAAA+gAAAPoAAEAAAEAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIAAABZdHJhawAAAFx0a2hkAAAAAwAAAAAAAAAAAAAAAQAAAAAAAAPoAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAQAAAAAAIAAAACAAAAAAAJGVkdHMAAAAcZWxzdAAAAAAAAAABAAAD6AAAAAAAAQAAAAABTmdkaWEAAAAgbWRoZAAAAAAAAAAAAAAAAAAAQAAAAEAAVcQAAAAAAC1oZGxyAAAAAAAAAAB2aWRlAAAAAAAAAAAAAAAAVmlkZW9IYW5kbGVyAAAAAVxtaW5mAAAAFHZtaGQAAAABAAAAAAAAAAAAAAAkZGluZgAAABxkcmVmAAAAAAAAAAEAAAAMdXJsIAAAAAEAAADcc3RibAAAALhzdHNkAAAAAAAAAAEAAACQbXA0dgAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAIAAgASAAAAEgAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABj//wAAAFJlc2RzAAAAAANEAAEABDwgEQAAAAADDUAAAAAABS0AAAGwAQAAAgAAAA0AAAAAAAAAAAAAAgAAAA9hdmNDAWQACv/hABhnZAAKrNlCjfkhAAADAAEAAAMAAg8SJZYBAAZo6+JLIsAAAAAYc3R0cwAAAAAAAAABAAAAAQAAQAAAAAAcc3RzYwAAAAAAAAABAAAAAQAAAAEAAAABAAAAFHN0c3oAAAAAAAAC5QAAAAEAAAAUc3RjbwAAAAAAAAABAAAAMAAAAGJ1ZHRhAAAAWm1ldGEAAAAAAAAAIWhkbHIAAAAAAAAAAG1kaXJhcHBsAAAAAAAAAAAAAAAALWlsc3QAAAAlqXRvbwAAAB1kYXRhAAAAAQAAAABMYXZmNTguMTIuMTAw';
    const videoBuffer = Buffer.from(validMp4Base64, 'base64');
    fs.writeFileSync(videoPath, videoBuffer);
    attachArtifact(videoPath, 'video', 'video/mp4', 'test');
    expect(fs.existsSync(videoPath)).toBe(true);
  });

  it('generates a screenshot artifact and logs attachment marker', () => {
    const screenshotPath = join(artifactsDir, 'vitest-screenshot.bmp');

    const width = 100;
    const height = 100;
    const headerSize = 54;
    const rowPadding = (4 - ((width * 3) % 4)) % 4;
    const pixelArraySize = (width * 3 + rowPadding) * height;
    const fileSize = headerSize + pixelArraySize;

    const buffer = Buffer.alloc(fileSize);

    buffer.write('BM', 0);
    buffer.writeUInt32LE(fileSize, 2);
    buffer.writeUInt32LE(0, 6);
    buffer.writeUInt32LE(headerSize, 10);

    buffer.writeUInt32LE(40, 14);
    buffer.writeInt32LE(width, 18);
    buffer.writeInt32LE(height, 22);
    buffer.writeUInt16LE(1, 26);
    buffer.writeUInt16LE(24, 28);
    buffer.writeUInt32LE(0, 30);
    buffer.writeUInt32LE(pixelArraySize, 34);
    buffer.writeInt32LE(2835, 38);
    buffer.writeInt32LE(2835, 42);
    buffer.writeUInt32LE(0, 46);
    buffer.writeUInt32LE(0, 50);

    let offset = headerSize;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const b = 50;
        const g = Math.floor((y / height) * 255);
        const r = Math.floor((x / width) * 255);

        buffer.writeUInt8(b, offset);
        buffer.writeUInt8(g, offset + 1);
        buffer.writeUInt8(r, offset + 2);
        offset += 3;
      }

      for (let p = 0; p < rowPadding; p += 1) {
        buffer.writeUInt8(0, offset);
        offset += 1;
      }
    }

    fs.writeFileSync(screenshotPath, buffer);
    attachArtifact(screenshotPath, 'screenshot', 'image/bmp', 'test');

    expect(fs.existsSync(screenshotPath)).toBe(true);
  });

  it('generates a PNG screenshot artifact and logs attachment marker', () => {
    const pngPath = join(artifactsDir, 'vitest-screenshot.png');
    // Minimal 1x1 red PNG
    const minimalPngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    fs.writeFileSync(pngPath, Buffer.from(minimalPngBase64, 'base64'));
    attachArtifact(pngPath, 'screenshot', 'image/png', 'test');
    expect(fs.existsSync(pngPath)).toBe(true);
  });

  it('generates a JPEG screenshot artifact and logs attachment marker', () => {
    const jpegPath = join(artifactsDir, 'vitest-screenshot.jpg');
    // Minimal valid JPEG (tiny image)
    const minimalJpegBase64 =
      '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBEQACEQADAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8A0n//2Q==';
    fs.writeFileSync(jpegPath, Buffer.from(minimalJpegBase64, 'base64'));
    attachArtifact(jpegPath, 'screenshot', 'image/jpeg', 'test');
    expect(fs.existsSync(jpegPath)).toBe(true);
  });
});
