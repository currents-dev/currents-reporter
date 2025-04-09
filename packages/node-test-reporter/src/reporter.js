import { hostname } from 'os';
import { create } from 'xmlbuilder2';

const HOSTNAME = hostname();

/**
 * Collects all parent suite names for a given test.
 *
 * This function walks up the test tree, skipping the root suite.
 * @param {object} test - The test object. It must have a `parent` property (another test object)
 *   that forms a chain up to a root suite (which has a name of 'root').
 * @returns {string[]}
 *   An array of suite names, ordered from the highest level to the immediate parent.
 */
function collectParentNames(test) {
  const names = [];

  // Start with the direct parent of the test.
  let { parent } = test;

  // Loop until we reach the root suite.
  while (parent && parent.name !== 'root') {
    // Prepend the parent's name to maintain proper hierarchy order.
    names.unshift(parent.name);
    parent = parent.parent;
  }
  return names;
}

/**
 * Creates a new XML `<testsuite>` element for the given test node.
 *
 * Maps key test metrics to XML attributes on the created element.
 * @param {string} suiteName
 *   The unique name for the suite, used as the element's `name` attribute.
 * @param {object} node - The test object containing metrics.
 * @param {string} node.timestamp - ISO timestamp.
 * @param {number} node.errors - Number of errors.
 * @param {number} node.tests - Number of tests.
 * @param {number} node.failures - Number of failed tests.
 * @param {number} node.skipped - Number of skipped tests.
 * @param {number} node.time - Duration in seconds.
 * @param {object} parentElement - The parent XML element under which the suite element is created.
 * @param {Map<string, object>} suiteMap
 *   A map to cache created suite elements, keyed by suiteName.
 * @returns {object} The newly created XML `<testsuite>` element.
 */
function createSuiteElement(suiteName, node, parentElement, suiteMap) {
  const suiteElement = parentElement.ele('testsuite', {
    name: suiteName,
    timestamp: node.timestamp,
    hostname: node.hostname,
    errors: node.errors,
    tests: node.tests,
    failures: node.failures,
    skipped: node.skipped,
    time: node.time,
  });

  // Store the created element for future reference.
  suiteMap.set(suiteName, suiteElement);
  return suiteElement;
}

/**
 * Formats an error object as a pretty-printed JSON string.
 *
 * If an error is not provided (null or undefined), it returns an empty string.
 * @param {object|null|undefined} error
 *   The error object to format. May contain properties like message and stack.
 * @returns {string} A formatted string representing the error information,
 *   or an empty string if no error is provided.
 */
function formatError(error) {
  if (!error) return '';
  return `${JSON.stringify(error, null, 2)}\n`;
}

/**
 * Constructs the full display name for a test.
 *
 * Uses parent suite names (if any) concatenated with the test name,
 * ensuring that double quotes in the test name are escaped properly.
 * @param {object} test - The test object
 * @param {string} test.name - The name of the test.
 * @param {object} [test.parent] - A reference to its parent test object.
 * @returns {string}
 *   The fully qualified name of the test, with parent suite names separated by " > ".
 */
function getFullTestName(test) {
  const describeNames = collectParentNames(test);
  const testName = test.name.replace(/"/g, '&quot;');

  // If there are parent names, join them with ' > ', otherwise use the test name alone.
  return describeNames.length
    ? `${describeNames.join(' > ')} > ${testName}`
    : testName;
}

/**
 * Determines if a node has a child element with a specified tag.
 * @param {object} node - The node to check.
 *   Expected to have a `children` array or properties corresponding to tags.
 * @param {string} tag - The tag name to search for (e.g., `failure` or `skipped`).
 * @returns {boolean}
 *   `true` if a child element or property with the specified tag exists; otherwise, `false`.
 */
function hasChildWithTag(node, tag) {
  return node?.children?.some((child) => child.tag === tag) || node?.[tag];
}

/**
 * Traverses the children of a test node and adds them to the XML document.
 *
 * For suite nodes, the function recurses into child nodes. For test cases,
 * it creates an XML `<testcase>` element and adds any additional child elements
 * such as skipped or failure details.
 * @param {object|string} childNode - The child node to process. It can be:
 *   - an object representing a test/suite with a `children` property,
 *   - or a string representing a comment.
 * @param {object} suiteElement - The XML element representing the parent testsuite.
 * @returns {void}
 */
function traverseChildren(childNode, suiteElement) {
  // If the node represents a suite, iterate recursively over its children.
  if (childNode.isSuite) {
    // Generate a unique full name for the suite.
    childNode.children.forEach((grandChild) =>
      traverseChildren(grandChild, suiteElement)
    );
  } else {
    // Generate a unique full name for the test case.
    const fullTestName = getFullTestName(childNode);
    const testCaseElement = suiteElement.ele('testcase', {
      name: fullTestName,
      time: childNode.time,
    });

    // Process each child of the test case for skipped, todo, or failure information.
    childNode.children.forEach((grandChild) => {
      // Add a skipped element if the test was skipped or marked as todo.
      if (['skipped', 'todo'].includes(grandChild.type)) {
        testCaseElement.ele('skipped', {
          message: grandChild.message,
          type: grandChild.type === 'todo' ? 'todo' : undefined,
        });
      } else if (grandChild.type) {
        // Add a failure element if the test encountered an error.
        const failureElement = testCaseElement.ele('failure', {
          message: `${grandChild.message}\n${formatError(grandChild.stack)}`,
          type: grandChild.type,
        });

        // Depending on whether the stack is an object, use different methods to add text data.
        typeof grandChild.stack === 'object'
          ? failureElement.dat(formatError(grandChild.stack))
          : failureElement.txt(grandChild.stack);
      }
    });
  }
}

/**
 * Updates the test metrics based on the provided event details and appends additional children.
 *
 * This includes recording skipped tests, todo items, and failure details.
 * @param {object} event - The event object containing test data.
 * @param {object} event.data
 *   The test data object with properties like `skip`, `todo`, and `details`.
 * @param {string} event.type - The type of event (e.g., 'test:fail').
 * @param {object} currentTest
 *   The current test object to be updated. Should have a `children` array.
 * @param {object} state - The global state object holding aggregate test metrics like
 *   `totalTests`, `totalSkipped`, and `totalFailures`.
 * @returns {void}
 */
function updateTestMetrics(event, currentTest, state) {
  state.totalTests += 1;
  currentTest.isSuite = false;

  // Record skipped tests.
  if (event.data.skip) {
    state.totalSkipped += 1;
    currentTest.children.push({
      nesting: event.data.nesting + 1,
      type: 'skipped',
      message: event.data.skip,
    });
  }

  // Record tests marked as todo.
  if (event.data.todo) {
    currentTest.children.push({
      nesting: event.data.nesting + 1,
      type: 'todo',
      message: event.data.todo,
    });
  }

  // If the test fails, update failure metrics and add error details.
  if (event.type === 'test:fail') {
    state.totalFailures += 1;
    const error = event.data.details?.error;

    // Add the failure details to the test node.
    currentTest.children.push({
      nesting: event.data.nesting + 1,
      type: error?.failureType || error?.code,
      message: error?.message || '',
      stack: error,
    });

    // Attach failure summary to the current test.
    Object.assign(currentTest, {
      failures: 1,
      failure: error?.message || '',
    });
  }
}

/**
 * Converts a test node and its children into corresponding XML elements.
 *
 * This function uses a `suiteMap` to avoid duplicate creation of suite elements and recursively
 * processes child nodes.
 * @param {object|string} node - The test node to convert. It can be:
 *   - an object representing a test or suite with a `children` array,
 *   - or a string representing an XML comment.
 * @param {object} parentElement
 *   The parent XML element (using xmlbuilder2) to which the conversion is appended.
 * @param {Map<string, object>} suiteMap - A map caching created suite elements by suite name.
 * @returns {void}
 */
function convertToXML(node, parentElement, suiteMap) {
  // If node is a comment (string), add it as an XML comment.
  if (typeof node === 'string') {
    parentElement.com(node.trim());
    return;
  }

  /* For suite nodes, generate a unique suite name, create or reuse the suite element,
  and then process its children recursively. */
  if (node.isSuite) {
    // Generate a unique suite name based on the file path.
    const suiteName = node.file
      .replace(process.cwd(), '')
      .replace(/"/g, '&quot;');
    // Create or reuse the suite element based on the suite name.
    const suiteElement =
      suiteMap.get(suiteName) ||
      createSuiteElement(suiteName, node, parentElement, suiteMap);

    // Process each child of the suite for skipped, todo, or failure information.
    node.children.forEach((child) => traverseChildren(child, suiteElement));
  }
}

/**
 * Starts a new test or suite node based on event data.
 *
 * It creates a new test node and updates the state to track the current test context.
 * @param {object} event - The event object with test initiation data.
 * @param {string} event.name - The name of the test,
 * @param {number} event.nesting - The nesting level of the test,
 * @param {string} event.file - The file path where the test is defined.
 * @param {object} state - The state object tracking the test tree. Expected properties include:
 * @param {object|null} state.currentSuite - The current test suite,
 * @param {Array} state.roots - The array of top-level test nodes.
 * @returns {void}
 */
function startTest(event, state) {
  // Construct a new test node with associated metadata.
  const newSuite = {
    name: event.data.name,
    nesting: event.data.nesting,
    parent: state.currentSuite,
    children: [],
    file: event.data.file,
    timestamp: new Date().toISOString(),
  };

  // Register the new test node under its parent's children array.
  state.currentSuite?.children.push(newSuite);
  // Update the current suite to the new test node.
  state.currentSuite = newSuite;

  // If this is the top-level suite, add it to the roots collection.
  if (!newSuite.parent) state.roots.push(newSuite);
}

/**
 * Finalizes the XML document by setting aggregate test metrics as attributes on the root element
 * and converting all test nodes into XML segments.
 * @param {object} root - The root XML element (using xmlbuilder2) that will contain test metrics.
 * @param {object} state - The state object that holds overall metrics
 *   (e.g., totalTests, totalFailures, totalTime) and an array of test node roots.
 * @param {Map<string, object>} suiteMap
 *   A map of suite elements keyed by suite names to prevent duplication.
 * @returns {void}
 */
function finalizeXML(root, state, suiteMap) {
  // Attach aggregated metrics to the root element.
  root.att('tests', state.totalTests);
  root.att('failures', state.totalFailures);
  root.att('errors', state.totalErrors);
  root.att('skipped', state.totalSkipped);
  root.att('time', state.totalTime.toFixed(6));

  // Convert all recorded test roots to XML segments.
  state.roots.forEach((suite) => {
    // Skip comment strings.
    if (typeof suite !== 'string') convertToXML(suite, root, suiteMap);
  });
}

/**
 * Processes an individual test event and updates the test node and state accordingly.
 *
 * Depending on the event's details, this function may create a new test node if the current
 * suite does not match the event details. It also calculates the test duration and updates
 * aggregate metrics.
 * @param {object} event - The test event object.
 * @param {string} event.type - The type of test event (e.g., 'test:pass', 'test:fail'),
 * @param {object} event.data
 *   With properties such as `name`, `nesting`, and `details` (including duration in ms).
 * @param {object} state
 *   The state object that tracks the current test context and aggregate metrics.
 * @returns {void}
 */
function handleTestResult(event, state) {
  // Ensure there is an active suite; if not, create a root-level suite.
  if (!state.currentSuite)
    startTest({ data: { name: 'root', nesting: 0 } }, state);

  // If the current suite does not match the event's test details, start a new test.
  if (
    state.currentSuite.name !== event.data.name ||
    state.currentSuite.nesting !== event.data.nesting
  ) {
    startTest(event, state);
  }

  const currentTest = state.currentSuite;
  /* If the event indicates completion of the current test (nesting match),
  move back to the parent suite. */
  if (currentTest.nesting === event.data.nesting) {
    state.currentSuite = state.currentSuite.parent;
  }

  // Calculate the test duration in seconds and update aggregate time.
  currentTest.time = (event.data.details.duration_ms / 1000).toFixed(6);
  state.totalTime += Number(currentTest.time);

  // Determine if any child nodes indicate failure or skipped status.
  const isFailure = (node) => hasChildWithTag(node, 'failure');
  const isSkipped = (node) => hasChildWithTag(node, 'skipped');
  const nonCommentChildren = currentTest.children.filter(
    (child) => typeof child !== 'string'
  );

  // If there are non-comment children, treat the test as a suite and recalculate metrics.
  if (nonCommentChildren.length) {
    Object.assign(currentTest, {
      isSuite: true,
      errors: 0,
      tests: nonCommentChildren.length,
      failures: currentTest.children.filter(isFailure).length,
      skipped: currentTest.children.filter(isSkipped).length,
      hostname: HOSTNAME,
    });
  } else {
    // Otherwise, update metrics for a regular test.
    updateTestMetrics(event, currentTest, state);
  }
}

/**
 * The main generator function that processes test events into a JUnit XML report.
 *
 * This async generator accepts an async iterable source that yields test event objects.
 * Each event object is expected to have a `type` property
 * (e.g., 'test:start', 'test:pass', 'test:fail', or 'test:diagnostic')
 * as well as a `data` property with detailed test information.
 * @param {AsyncIterable<object>} source - An async iterable that produces test event objects.
 * @returns {AsyncGenerator<string, void, unknown>}
 *   An async generator that yields the final XML report as a pretty-printed string.
 */
export default async function* junitReporter(source) {
  const state = {
    currentSuite: null,
    totalFailures: 0,
    totalSkipped: 0,
    totalTests: 0,
    totalTime: 0,
    totalErrors: 0,
    roots: [],
  };
  const suiteMap = new Map();
  const root = create({ version: '1.0', encoding: 'UTF-8' }).ele('testsuites', {
    name: 'NodeJS',
  });

  // eslint-disable-next-line no-restricted-syntax
  for await (const event of source) {
    switch (event.type) {
      case 'test:start':
        startTest(event, state);
        break;
      case 'test:pass':
      case 'test:fail':
        handleTestResult(event, state, suiteMap);
        break;
      case 'test:diagnostic':
        state.roots.push(`# ${event.data.message}`);
        break;
      default:
        break;
    }
  }

  finalizeXML(root, state, suiteMap);
  yield root.end({ prettyPrint: true });
}
