// The parts of Cypress's run results (`after:run`, or the result of
// `cypress.run()`) that the conversion reads
export interface CypressRunResult {
  browserName: string;
  cypressVersion: string;
  runs: CypressSpecRun[];
}

export interface CypressSpecRun {
  spec: { relative: string; absolute: string };
  stats: {
    suites: number;
    tests: number;
    passes: number;
    pending: number;
    skipped: number;
    failures: number;
    startedAt: string;
    endedAt: string;
    duration: number;
  };
  tests: CypressTest[];
  screenshots: { path: string; takenAt: string }[];
  video: string | null;
  // Why a spec file has no tests, e.g. a syntax error
  error?: string | null;
}

export type CypressTestState = 'passed' | 'failed' | 'pending' | 'skipped';

export interface CypressTest {
  title: string[];
  state: CypressTestState;
  displayError: string | null;
  duration: number;
  attempts: { state: CypressTestState }[];
}
