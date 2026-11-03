import { test } from 'node:test';

const long = 'x'.repeat(20000);
test(`markup & < > " ' chars`, () => {
  throw new Error(`message & < > " ' chars`);
});
test('already an entity &amp; &lt; &#38; &quot; &foo; &#x26;', () => {
  throw new Error('entity &amp; &lt; &#38; &quot; &foo; &#x26;');
});
test('unicode: Привет, 日本語, ﬁ, é', () => {
  throw new Error('unicode: Привет, 日本語');
});
test('emoji 😀 🎉 👩‍👩‍👧', () => {
  throw new Error('emoji 😀 🎉');
});
test('whitespace tab\there newline\nhere cr\rhere', () => {
  throw new Error('whitespace tab\there cr\rhere');
});
test('control chars \u0001 \u0008 \u000b \u001f \u007f \u0085', () => {
  throw new Error('control chars \u0001 \u0008 \u000b \u001f \u007f \u0085');
});
test('nul char a\u0000b', () => {
  throw new Error('nul char a\u0000b');
});
test('non-characters ￾ ￿', () => {
  throw new Error('non-characters ￾ ￿');
});
test('lone surrogates \uD800 and \uDC00', () => {
  throw new Error('lone surrogates \uD800 and \uDC00');
});
test('cdata end in name ]]> passes', () => {});
test('very long output', () => {
  const err = new Error(long);
  err.output = 'output line\n'.repeat(1000);
  throw err;
});
test('passing with markup & < > " \' and nul \u0000', () => {});
