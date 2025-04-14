This folder contains a suite of tests designed to validate the functionality of the Node Test Reporter and ensure its compatibility with the Currents API.

## Usage

1. Install the dependencies:
   ```bash
   npm install
   ```
2. Run the tests:
   ```bash
   npm run test
   ```
3. Convert the report to Currents format:
   ```bash
   npm run convert
   ```
4. Report the results to the Currents API:
   ```bash
   CURRENTS_PROJECT_ID=xxx CURRENTS_RECORD_KEY=xxx npm run report
   ```
