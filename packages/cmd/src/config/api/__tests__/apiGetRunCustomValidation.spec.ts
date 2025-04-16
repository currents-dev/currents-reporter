import { ValidationError } from '@lib';
import { error } from '@logger';
import { describe, expect, it, vi } from 'vitest';
import {
  APICommandConfig,
  APIGetRunCommandConfig,
  apiGetRunCustomValidation,
} from '../config';

vi.mock('@logger', () => ({
  error: vi.fn(),
}));

const baseConfig: APICommandConfig & APIGetRunCommandConfig = {
  apiKey: 'api-key',
  projectId: 'project-id',
};

describe('apiGetRunCustomValidation', () => {
  it('should pass: only ciBuildId', () => {
    expect(() =>
      apiGetRunCustomValidation({
        ...baseConfig,
        ciBuildId: 'ci-123',
      })
    ).not.toThrow();
  });

  it('should pass: only tag', () => {
    expect(() =>
      apiGetRunCustomValidation({
        ...baseConfig,
        tag: ['smoke'],
      })
    ).not.toThrow();
  });

  it('should pass: only branch', () => {
    expect(() =>
      apiGetRunCustomValidation({
        ...baseConfig,
        branch: 'main',
      })
    ).not.toThrow();
  });

  it('should pass: tag and branch without ciBuildId', () => {
    expect(() =>
      apiGetRunCustomValidation({
        ...baseConfig,
        tag: ['beta'],
        branch: 'develop',
      })
    ).not.toThrow();
  });

  it('should fail: missing all ciBuildId, tag, branch', () => {
    expect(() =>
      apiGetRunCustomValidation({
        ...baseConfig,
      })
    ).toThrow(ValidationError);
    expect(error).toHaveBeenCalledWith(
      '"ciBuildId", "tag", "branch" or a combination of "tag" and "branch" are expected to be provided'
    );
  });

  it('should fail: ciBuildId and tag together', () => {
    expect(() =>
      apiGetRunCustomValidation({
        ...baseConfig,
        ciBuildId: 'ci-1',
        tag: ['v2'],
      })
    ).toThrow(ValidationError);
  });

  it('should fail: all three provided', () => {
    expect(() =>
      apiGetRunCustomValidation({
        ...baseConfig,
        ciBuildId: 'ci-1',
        tag: ['v1'],
        branch: 'main',
      })
    ).toThrow(ValidationError);
  });

  it('should fail: tag and branch but also ciBuildId', () => {
    expect(() =>
      apiGetRunCustomValidation({
        ...baseConfig,
        tag: ['v1'],
        branch: 'dev',
        ciBuildId: 'ci-2',
      })
    ).toThrow(ValidationError);
  });
});
