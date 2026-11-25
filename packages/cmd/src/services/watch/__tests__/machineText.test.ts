import { describe, expect, it } from 'vitest';
import type { TerminalRunEvent } from '../events';
import { MachineStatsTracker } from '../machineStats';
import {
  heartbeatLines,
  machineMapLines,
  podiumLines,
  raceLines,
  speedText,
} from '../machineText';

const strip = (text: string) => text.replace(/\x1b\[[0-9;]*m/g, '');

function fleet(machines: number, { ended = false } = {}) {
  const stats = new MachineStatsTracker();
  const add = (event: TerminalRunEvent) => stats.add(event, 10_000);
  add({ type: 'runBegin', totalTests: machines * 10, startedAt: 0 });
  for (let m = 0; m < machines; m++) {
    const machineId = `machine-${String(m).padStart(4, '0')}`;
    for (let t = 0; t < 3; t++) {
      const testId = `${machineId}-${t}`;
      add({
        type: 'testBegin',
        testId,
        title: ['a test with a long title that does not fit'],
        file: `spec-${t}.spec.ts`,
        worker: `${machineId}/0`,
        retry: 0,
        startedAt: 1_000 * t,
      });
      if (t < 2)
        add({
          type: 'testEnd',
          testId,
          status: t === 1 && m % 7 === 0 ? 'failed' : 'passed',
          durationMs: 1_000 * (1 + (m % 3)),
          retry: 0,
        });
    }
  }
  if (ended) add({ type: 'runEnd', status: 'failed' });
  return stats.read(11_000);
}

const views = { heartbeatLines, raceLines, machineMapLines };

describe.each(Object.entries(views))('%s', (_, view) => {
  it.each([4, 12, 120])('fits %i machines in 80x24', (count) => {
    const lines = view(fleet(count), { columns: 80, rows: 23, now: 11_000 });
    expect(lines.length).toBeLessThanOrEqual(23);
    lines.forEach((line) => expect(strip(line).length).toBeLessThanOrEqual(80));
  });

  it('fits a narrow terminal', () => {
    const lines = view(fleet(12), { columns: 30, rows: 10, now: 11_000 });
    expect(lines.length).toBeLessThanOrEqual(10);
    lines.forEach((line) => expect(strip(line).length).toBeLessThanOrEqual(30));
  });
});

describe('heartbeatLines', () => {
  it('shows every one of 120 machines in 80x24', () => {
    const lines = heartbeatLines(fleet(120), {
      columns: 80,
      rows: 23,
      now: 11_000,
    }).map(strip);
    const cells = lines
      .filter((line) => /^[■◆ ]+$/.test(line))
      .join('')
      .replace(/\s/g, '');
    expect(cells.length).toBe(120);
    expect(lines.join('\n')).not.toContain('more machines');
  });

  it('shows machine IDs when they fit', () => {
    const lines = heartbeatLines(fleet(4), {
      columns: 80,
      rows: 23,
      now: 11_000,
    }).map(strip);
    expect(lines[2]).toContain('machine-0000');
  });

  it('pulses the cell of a machine where a test just ended', () => {
    const lines = heartbeatLines(fleet(1), {
      columns: 80,
      rows: 23,
      now: 10_500,
    }).map(strip);
    expect(lines[2]).toMatch(/^◆ machine-0000/);
  });

  it('names the machines with a recent failure when the cells drop the IDs', () => {
    const lines = heartbeatLines(fleet(120), {
      columns: 80,
      rows: 23,
      now: 11_000,
    }).map(strip);
    expect(lines[lines.length - 1]).toMatch(
      /^Failed in the last 10s: machine-0000, machine-0007, /
    );
  });

  it('stops pulsing once the run ended', () => {
    const lines = heartbeatLines(fleet(1, { ended: true }), {
      columns: 80,
      rows: 23,
      now: 10_500,
    }).map(strip);
    expect(lines[2]).toMatch(/^■ machine-0000/);
  });
});

describe('raceLines', () => {
  it('gives each lane its place by tests done', () => {
    const stats = fleet(2);
    stats.machines[1].testsDone = 5;
    const lines = raceLines(stats, { columns: 80, rows: 10 }).map(strip);
    expect(lines[1]).toMatch(/^2\. machine-0000 /);
    expect(lines[2]).toMatch(/^1\. machine-0001 /);
  });

  it('keeps the end of a long machine ID', () => {
    const stats = fleet(1);
    stats.machines[0].machineId = 'github-actions-job-shard-7';
    const lines = raceLines(stats, { columns: 80, rows: 10 }).map(strip);
    expect(lines[1]).toMatch(/^1\. …job-shard-7 /);
  });

  it('says how many more machines did not fit', () => {
    const lines = raceLines(fleet(30), { columns: 80, rows: 10 }).map(strip);
    expect(lines).toHaveLength(10);
    expect(lines[9]).toBe('… 22 more machines');
  });
});

describe('podiumLines', () => {
  it('is empty while the run goes on', () => {
    expect(podiumLines(fleet(3))).toEqual([]);
  });

  it('names the first machines and the slowest one with its longest spec file', () => {
    const lines = podiumLines(fleet(3, { ended: true }));
    expect(lines).toEqual([
      'First: machine-0000 in 2s',
      'Second: machine-0001 in 3s',
      'Slowest: machine-0002 in 4s, 2s after the first; its longest spec file: spec-0.spec.ts, 3s of test time summed over its workers',
    ]);
  });
});

describe('speedText', () => {
  it('compares the average test time with the median', () => {
    const [fast, , slow] = fleet(3).machines;
    expect(speedText(fast)).toBe('1s a test, 2.0x faster than median');
    expect(speedText(slow)).toBe('3s a test, 1.5x slower than median');
  });
});

describe('machineMapLines', () => {
  it('shows the tests, failures, speed and running test of each machine', () => {
    const lines = machineMapLines(fleet(3), {
      columns: 80,
      rows: 23,
      now: 11_000,
    }).map(strip);
    expect(lines[1]).toMatch(
      /^machine-0000 +recent failure {2}machine-0001 +running$/
    );
    expect(lines[2]).toMatch(
      /^2 tests, 1 failed, 2\.0x faster +2 tests, 0 failed, median speed$/
    );
    expect(lines[3]).toMatch(/^▸ spec-2\.spec\.ts › a test with .*9s$/);
  });
});
