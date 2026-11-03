// A node:test reporter that writes the events it receives as JSON, for
// junit.test.ts to replay. File paths are stored relative to the working
// directory. An error is stored as its JSON form and its message, because the
// message is not enumerable and the reporter reads both.
//
// Run from this directory, for example:
//   node --test --test-reporter=./record-events.mjs \
//     --test-reporter-destination=events/basic.json basic.fixture.mjs
import { relative } from 'node:path';

export default async function* recordEvents(source) {
  const events = [];
  for await (const { type, data } of source) {
    events.push({
      type,
      data: data?.file
        ? { ...data, file: relative(process.cwd(), data.file) }
        : data,
    });
  }
  yield JSON.stringify(events, toJSONValue, 2) + '\n';
}

function toJSONValue(key, value) {
  if (!(value instanceof Error)) return value;
  return {
    errorMessage: value.message,
    errorJSON: JSON.parse(JSON.stringify(value)),
  };
}
