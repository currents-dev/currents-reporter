import { beforeAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'child_process';
import path from 'path';

const reporter = path.resolve('./src/reporter.js');

describe('Single Spec', () => {
  let stderr = '';
  let stdout = '';

  beforeAll(() => {
    const child = spawnSync('node', ['--test', '--test-reporter', reporter, path.resolve('./tests/nodeTests.spec.js')]);
    stderr = child.stderr.toString();
    stdout = child.stdout.toString();
  });

  it('generates expected XML output', async () => {
    expect(stdout).toMatch(/<testsuites name="NodeJS" tests="5" failures="2" errors="0" skipped="0" time="[\d\.]+"/);
    expect(stdout).toContain(
      `<failure message="Expected values to be strictly equal:

2 !== 3

{
  &quot;code&quot;: &quot;ERR_TEST_FAILURE&quot;,
  &quot;failureType&quot;: &quot;testCodeFailure&quot;,
  &quot;cause&quot;: {
    &quot;generatedMessage&quot;: true,
    &quot;code&quot;: &quot;ERR_ASSERTION&quot;,
    &quot;actual&quot;: 2,
    &quot;expected&quot;: 3,
    &quot;operator&quot;: &quot;strictEqual&quot;
  }
}
" type="testCodeFailure"><![CDATA[{
  "code": "ERR_TEST_FAILURE",
  "failureType": "testCodeFailure",
  "cause": {
    "generatedMessage": true,
    "code": "ERR_ASSERTION",
    "actual": 2,
    "expected": 3,
    "operator": "strictEqual"
  }
}
]]></failure>`
    );

    expect(stderr).toEqual('');
  });

  it('generates correctly formatted failures', async () => {
    const failures = stdout.match(/<failure/g);
    
    expect(failures).toHaveLength(2);
    expect(stdout).toContain(`<testsuites name="NodeJS" tests="5" failures="${failures!.length}"`)
    expect(stdout).toContain(
      `<failure message="Expected values to be strictly equal:

2 !== 3

{
  &quot;code&quot;: &quot;ERR_TEST_FAILURE&quot;,
  &quot;failureType&quot;: &quot;testCodeFailure&quot;,
  &quot;cause&quot;: {
    &quot;generatedMessage&quot;: true,
    &quot;code&quot;: &quot;ERR_ASSERTION&quot;,
    &quot;actual&quot;: 2,
    &quot;expected&quot;: 3,
    &quot;operator&quot;: &quot;strictEqual&quot;
  }
}
" type="testCodeFailure"><![CDATA[{
  "code": "ERR_TEST_FAILURE",
  "failureType": "testCodeFailure",
  "cause": {
    "generatedMessage": true,
    "code": "ERR_ASSERTION",
    "actual": 2,
    "expected": 3,
    "operator": "strictEqual"
  }
}
]]></failure>`
    );
  });

  it('formats nested describe blocks correctly', async () => {
    [
      '<testcase name="Nested Tests &gt; Nested Test 1 &gt; should pass"',
      '<testcase name="Nested Tests &gt; Nested Test 1 &gt; Nested Test 2 &gt; should pass"',
    ].forEach(testCase => {
      expect(stdout).toContain(testCase);
    })
  });

  it('formats special characters correctly', async () => {
    ['&quot;', '&gt;'].forEach(symbol => expect(stdout).toContain(symbol));
  });
});