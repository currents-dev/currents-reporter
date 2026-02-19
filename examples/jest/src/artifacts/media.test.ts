
const fs = require('fs');
const path = require('path');

describe('Media Artifacts Test', () => {
  const artifactsDir = path.join(__dirname, '..', '..', 'artifacts');
  
  beforeAll(() => {
    if (!fs.existsSync(artifactsDir)) {
      fs.mkdirSync(artifactsDir, { recursive: true });
    }
  });

  it('should generate a video artifact', () => {
    const videoPath = path.join(artifactsDir, 'test-video.mp4');
    // A minimal valid MP4 file (H.264)
    const validMp4Base64 = 'AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAAAAZtZGF0AAAC6W1vb3YAAABsbXZoZAAAAAAAAAAAAAAAAAAAA+gAAAPoAAEAAAEAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIAAABZdHJhawAAAFx0a2hkAAAAAwAAAAAAAAAAAAAAAQAAAAAAAAPoAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAQAAAAAAIAAAACAAAAAAAJGVkdHMAAAAcZWxzdAAAAAAAAAABAAAD6AAAAAAAAQAAAAABTmdkaWEAAAAgbWRoZAAAAAAAAAAAAAAAAAAAQAAAAEAAVcQAAAAAAC1oZGxyAAAAAAAAAAB2aWRlAAAAAAAAAAAAAAAAVmlkZW9IYW5kbGVyAAAAAVxtaW5mAAAAFHZtaGQAAAABAAAAAAAAAAAAAAAkZGluZgAAABxkcmVmAAAAAAAAAAEAAAAMdXJsIAAAAAEAAADcc3RibAAAALhzdHNkAAAAAAAAAAEAAACQbXA0dgAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAIAAgASAAAAEgAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABj//wAAAFJlc2RzAAAAAANEAAEABDwgEQAAAAADDUAAAAAABS0AAAGwAQAAAgAAAA0AAAAAAAAAAAAAAgAAAA9hdmNDAWQACv/hABhnZAAKrNlCjfkhAAADAAEAAAMAAg8SJZYBAAZo6+JLIsAAAAAYc3R0cwAAAAAAAAABAAAAAQAAQAAAAAAcc3RzYwAAAAAAAAABAAAAAQAAAAEAAAABAAAAFHN0c3oAAAAAAAAC5QAAAAEAAAAUc3RjbwAAAAAAAAABAAAAMAAAAGJ1ZHRhAAAAWm1ldGEAAAAAAAAAIWhkbHIAAAAAAAAAAG1kaXJhcHBsAAAAAAAAAAAAAAAALWlsc3QAAAAlqXRvbwAAAB1kYXRhAAAAAQAAAABMYXZmNTguMTIuMTAw';
    const videoBuffer = Buffer.from(validMp4Base64, 'base64');
    fs.writeFileSync(videoPath, videoBuffer);
    console.log(`[[ATTACHMENT|${videoPath}]]`);
    expect(fs.existsSync(videoPath)).toBe(true);
  });

  it('should generate a screenshot artifact', () => {
    const screenshotPath = path.join(artifactsDir, 'test-screenshot.bmp');
    
    // Generate a simple 100x100 red BMP image
    const width = 100;
    const height = 100;
    const headerSize = 54;
    const rowPadding = (4 - (width * 3) % 4) % 4;
    const pixelArraySize = (width * 3 + rowPadding) * height;
    const fileSize = headerSize + pixelArraySize;

    const buffer = Buffer.alloc(fileSize);

    // BMP Header
    buffer.write('BM', 0); // Signature
    buffer.writeUInt32LE(fileSize, 2); // File size
    buffer.writeUInt32LE(0, 6); // Reserved
    buffer.writeUInt32LE(headerSize, 10); // Offset to pixel array

    // DIB Header
    buffer.writeUInt32LE(40, 14); // DIB Header size
    buffer.writeInt32LE(width, 18); // Width
    buffer.writeInt32LE(height, 22); // Height
    buffer.writeUInt16LE(1, 26); // Planes
    buffer.writeUInt16LE(24, 28); // Bits per pixel (RGB)
    buffer.writeUInt32LE(0, 30); // Compression (BI_RGB)
    buffer.writeUInt32LE(pixelArraySize, 34); // Image size
    buffer.writeInt32LE(2835, 38); // X pixels per meter
    buffer.writeInt32LE(2835, 42); // Y pixels per meter
    buffer.writeUInt32LE(0, 46); // Colors used
    buffer.writeUInt32LE(0, 50); // Important colors

    // Pixel Array (Bottom-up, BGR format)
    let offset = headerSize;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        // Generate a gradient pattern: Red varies with X, Green varies with Y, Blue is constant
        const b = 50;
        const g = Math.floor((y / height) * 255);
        const r = Math.floor((x / width) * 255);
        
        buffer.writeUInt8(b, offset++); // Blue
        buffer.writeUInt8(g, offset++); // Green
        buffer.writeUInt8(r, offset++); // Red
      }
      // Padding for 4-byte alignment
      for (let p = 0; p < rowPadding; p++) {
        buffer.writeUInt8(0, offset++);
      }
    }

    fs.writeFileSync(screenshotPath, buffer);
    console.log(`[[ATTACHMENT|${screenshotPath}]]`);
    expect(fs.existsSync(screenshotPath)).toBe(true);
  });
});
