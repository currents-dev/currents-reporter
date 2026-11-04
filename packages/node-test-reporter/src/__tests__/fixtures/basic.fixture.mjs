import { describe, it, test } from 'node:test';

test('passes', () => {});
test('skipped with reason', { skip: 'not ready' }, () => {});
test('skipped', { skip: true }, () => {});
test('todo with reason', { todo: 'later' }, () => {});
test('todo', { todo: true }, () => {});
test('with diagnostics', (t) => {
  t.diagnostic('first diagnostic');
  t.diagnostic('second & <diagnostic>');
});

describe('outer suite', () => {
  it('outer test', () => {});
  describe('inner suite', () => {
    it('inner test', () => {});
    it.skip('inner skipped', () => {});
    it.todo('inner todo');
  });
});

describe.skip('skipped suite', () => {
  it('never runs', () => {});
});

describe.todo('todo suite', () => {
  it('runs inside todo suite', () => {});
});

test('parent with subtests', async (t) => {
  await t.test('subtest one', () => {});
  await t.test('subtest two', async (t) => {
    await t.test('sub-subtest', () => {});
  });
});
