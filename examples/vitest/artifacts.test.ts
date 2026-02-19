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
});

