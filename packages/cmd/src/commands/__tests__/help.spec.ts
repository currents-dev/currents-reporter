import { describe, expect, it, vi } from 'vitest';
import { formatExamples } from '../help';

vi.mock('@logger', () => ({ dim: (text: string) => text }));

describe('formatExamples', () => {
  it('prints each example as a comment line and its command', () => {
    expect(
      formatExamples([
        { comment: 'Show the help', commands: ['currents --help'] },
        { comment: 'Show the version', commands: ['currents -V'] },
      ])
    ).toBe(
      '\nExamples:\n  # Show the help\n  currents --help\n\n  # Show the version\n  currents -V\n'
    );
  });

  it('wraps long commands at 80 columns without separating an option from its value', () => {
    const text = formatExamples([
      {
        comment: 'Upload',
        commands: [
          'currents upload --key <record-key> --project-id <id> --ci-build-id <build-id> --tag tagA',
        ],
      },
    ]);

    expect(text).toContain(
      '  currents upload --key <record-key> --project-id <id> \\\n      --ci-build-id <build-id> --tag tagA\n'
    );
    for (const line of text.split('\n')) {
      expect(line.length).toBeLessThanOrEqual(80);
    }
  });

  it('keeps quoted text on one line', () => {
    const text = formatExamples([
      {
        comment: 'Start',
        commands: [
          'currents session start --api-key <api-key> --project-id <id> --title "Checkout fails on empty cart"',
        ],
      },
    ]);

    expect(text).toContain('      --title "Checkout fails on empty cart"');
  });

  it('prints a command with line breaks as is', () => {
    expect(
      formatExamples([
        { comment: 'Step', commands: ['- if: ${{ cancelled() }}\n  run: x'] },
      ])
    ).toContain('  - if: ${{ cancelled() }}\n    run: x\n');
  });
});
