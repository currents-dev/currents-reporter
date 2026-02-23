import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { join } from 'node:path';

describe('Vitest JUnit artifacts', () => {
  const artifactsDir = join(process.cwd(), 'artifacts');

  beforeAll(() => {
    if (!fs.existsSync(artifactsDir)) {
      fs.mkdirSync(artifactsDir, { recursive: true });
    }
  });

  it('generates a video artifact and logs attachment marker', () => {
    const videoPath = join(artifactsDir, 'vitest-video.mp4');
    const validMp4Base64 =
      'AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAAAAZtZGF0AAAC6W1vb3YAAABsbXZoZAAAAAAAAAAAAAAAAAAAA+gAAAPoAAEAAAEAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIAAABZdHJhawAAAFx0a2hkAAAAAwAAAAAAAAAAAAAAAQAAAAAAAAPoAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAQAAAAAAIAAAACAAAAAAAJGVkdHMAAAAcZWxzdAAAAAAAAAABAAAD6AAAAAAAAQAAAAABTmdkaWEAAAAgbWRoZAAAAAAAAAAAAAAAAAAAQAAAAEAAVcQAAAAAAC1oZGxyAAAAAAAAAAB2aWRlAAAAAAAAAAAAAAAAVmlkZW9IYW5kbGVyAAAAAVxtaW5mAAAAFHZtaGQAAAABAAAAAAAAAAAAAAAkZGluZgAAABxkcmVmAAAAAAAAAAEAAAAMdXJsIAAAAAEAAADcc3RibAAAALhzdHNkAAAAAAAAAAEAAACQbXA0dgAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAIAAgASAAAAEgAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABj//wAAAFJlc2RzAAAAAANEAAEABDwgEQAAAAADDUAAAAAABS0AAAGwAQAAAgAAAA0AAAAAAAAAAAAAAgAAAA9hdmNDAWQACv/hABhnZAAKrNlCjfkhAAADAAEAAAMAAg8SJZYBAAZo6+JLIsAAAAAYc3R0cwAAAAAAAAABAAAAAQAAQAAAAAAcc3RzYwAAAAAAAAABAAAAAQAAAAEAAAABAAAAFHN0c3oAAAAAAAAC5QAAAAEAAAAUc3RjbwAAAAAAAAABAAAAMAAAAGJ1ZHRhAAAAWm1ldGEAAAAAAAAAIWhkbHIAAAAAAAAAAG1kaXJhcHBsAAAAAAAAAAAAAAAALWlsc3QAAAAlqXRvbwAAAB1kYXRhAAAAAQAAAABMYXZmNTguMTIuMTAw';
    const videoBuffer = Buffer.from(validMp4Base64, 'base64');
    fs.writeFileSync(videoPath, videoBuffer);
    console.log(`[[ATTACHMENT|${videoPath}]]`);
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
    console.log(`[[ATTACHMENT|${screenshotPath}]]`);

    expect(fs.existsSync(screenshotPath)).toBe(true);
  });

  it('generates a PNG screenshot artifact and logs attachment marker', () => {
    const pngPath = join(artifactsDir, 'vitest-screenshot.png');
    // Minimal 1x1 red PNG
    const minimalPngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    fs.writeFileSync(pngPath, Buffer.from(minimalPngBase64, 'base64'));
    console.log(`[[ATTACHMENT|${pngPath}]]`);
    expect(fs.existsSync(pngPath)).toBe(true);
  });

  it('generates a JPEG screenshot artifact and logs attachment marker', () => {
    const jpegPath = join(artifactsDir, 'vitest-screenshot.jpg');
    // Minimal valid JPEG (tiny image)
    const minimalJpegBase64 =
      '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBEQACEQADAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8A0n//2Q==';
    fs.writeFileSync(jpegPath, Buffer.from(minimalJpegBase64, 'base64'));
    console.log(`[[ATTACHMENT|${jpegPath}]]`);
    expect(fs.existsSync(jpegPath)).toBe(true);
  });
});

