export interface TestNode {
  name: string;
  status: 'pending' | 'passed' | 'failed' | 'skipped' | 'todo';
  children: TestNode[];
  time?: number;
  isSuite?: boolean;
  testNumber?: number;
  failure?: {
    name?: string;
    message?: string;
    stack?: unknown;
  };
  message?: string;
}

export interface TestFile {
  name: string;
  timestamp: string;
  children: TestNode[];
  hostname: string;
  stats: {
    failures: number;
    skipped: number;
    time: number;
  };
}

export interface Summary {
  success: boolean;
  counts: Record<string, number>;
  duration_ms?: number;
}

export interface TestState {
  summary: Summary | null;
  fileSummaries: Record<string, Summary>;
  testFiles: Record<string, TestFile>;
}

export interface TestEvent {
  type: string;
  data?: {
    name?: string;
    nesting?: number;
    file?: string;
    details?: any;
    skip?: string;
    todo?: string;
    testNumber?: number;
  };
}
