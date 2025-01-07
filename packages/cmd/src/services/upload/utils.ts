export const sizeof = (value: unknown): number => {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
};

export const splitArrayIntoChunks = <T>(
  array: T[],
  maxSizeInBytes: number = 10 * 1024 * 1024
): T[][] => {
  const chunks: T[][] = [];
  let currentChunk: T[] = [];
  let currentChunkSize = 0;

  for (const item of array) {
    const itemSize = sizeof(item);

    // If adding the item exceeds the max size, push the current chunk and start a new one
    if (currentChunkSize + itemSize > maxSizeInBytes) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentChunkSize = 0;
    }

    currentChunk.push(item);
    currentChunkSize += itemSize;
  }

  // Push the last chunk if it has items
  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
};
