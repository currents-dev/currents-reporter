# Alternative JUnit Reporter for Node Test Runner

This reporter generates a JUnit XML file compatible with the Currents API. It ensures the output contains sufficient information for seamless conversion into the Currents format, enabling smooth integration and reporting to the Currents API.

## Nesting Approach

The Node.js test runner operates based on test events. Each event provides the necessary data to reconstruct the test structure but does not explicitly differentiate between a test and a suite.

To determine the nesting structure, the event includes a `nesting` field, where a higher number indicates a deeper level of nesting. The following fields from the event data are used to generate the XML structure:

- **`name`**: The name of the test or suite.
- **`nesting`**: The nesting level.
- **`file`**: The file name.
- **`details`**: Additional information, such as `type: 'suite'`, which is particularly useful for skipped suites.

This approach ensures the XML structure accurately reflects the test hierarchy and provides all necessary details for integration with the Currents API.

## How It Works

The reporter:

1. Listens for test events emitted by the Node.js test runner.
2. Creates an object representing the test structure.
3. Stores summary information about the test run and each individual spec file.
4. Generates a JUnit XML file based on the collected data.

## Covered Scenarios

### Test File Without a Top-Level Element

The reporter creates a top-level `testsuite` element for each test file. The hierarchy for each test file is flattened, meaning all tests are at the same level. The hierarchy is represented by the test names.

### Skipped Test Elements

Skipped tests are identified by the `skip: true` or `todo: true` properties in the event data. The reporter generates a `skipped` element for each skipped test, ensuring the XML output accurately reflects the test statuses.

### Skipped Describe Elements

Skipped suites are identified by the `details.type: 'suite'` property combined with `skip: true` or `todo: true`. **Note:** The reporter generates a **single** `skipped` element for each skipped suite, as the runner does not provide information about the skipped tests within the suite.

### Nested Tests

The reporter handles nested tests by creating a hierarchy of `testsuite` elements. Each test file is represented as a top-level `testsuite`, and nested tests are represented as flattened `testcase` elements.

### Subtests

Node.js test runner supports [subtests](https://nodejs.org/api/test.html#subtests), where a test can contain nested subtests. In the XML output, each subtest is represented as a separate `testcase` element, along with a `testcase` element for the parent test. This approach accounts for assertions at both the parent and subtest levels, which can independently affect the test outcome.

Since the Currents API does not support subtests, the reporter flattens the hierarchy. For subtests, the reporter generates a `testcase` element for each test, combining the parent test name and subtest name into a single string. This ensures compatibility with the Currents API while preserving subtest context.

### Tests with Exceptions

The reporter handles exceptions by generating a `failure` element for each test that throws an exception. The `failure` element includes the exception message and stack trace, obtained from the event data. The `testcase` name equals the suite name, as the event data does not provide the test name.

### Timeouts

The reporter handles timeouts by generating a `failure` element for each test that times out. The `failure` element includes the timeout error message, obtained from the event data.

### Retries

The Node.js test runner does not support retrying tests. As a result, the reporter does not include any specific handling for retries in the generated XML output.

