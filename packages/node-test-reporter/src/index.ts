// First, so that it runs before the other imports load code that needs a newer
// Node.js
import './checkNodeVersion';

import customReporter from './reporter';

export default customReporter;
