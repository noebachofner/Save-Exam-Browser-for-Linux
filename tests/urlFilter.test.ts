import { describe, expect, it } from 'vitest';
import {
  RequestFilter,
  SimplifiedRule,
  RegexRule,
  type FilterRuleSettings,
} from '../src/core/browser/urlFilter';

const rule = (expression: string, overrides: Partial<FilterRuleSettings> = {}): FilterRuleSettings => ({
  expression,
  result: 'allow',
  regex: false,
  active: true,
  ...overrides,
});

describe('simplified filter rules', () => {
  it('matches a bare host and its subdomains', () => {
    const r = new SimplifiedRule(rule('example.edu'));
    expect(r.isMatch({ url: 'https://example.edu/' })).toBe(true);
    expect(r.isMatch({ url: 'https://moodle.example.edu/quiz' })).toBe(true);
    expect(r.isMatch({ url: 'https://example.com/' })).toBe(false);
  });

  it('honours a leading dot as an exact-subdomain match', () => {
    const r = new SimplifiedRule(rule('.example.edu'));
    expect(r.isMatch({ url: 'https://example.edu/' })).toBe(true);
    expect(r.isMatch({ url: 'https://moodle.example.edu/' })).toBe(false);
  });

  it('matches a scheme when given', () => {
    const r = new SimplifiedRule(rule('https://example.edu'));
    expect(r.isMatch({ url: 'https://example.edu/' })).toBe(true);
    expect(r.isMatch({ url: 'http://example.edu/' })).toBe(false);
  });

  it('supports wildcards in the host', () => {
    const r = new SimplifiedRule(rule('*.example.edu'));
    expect(r.isMatch({ url: 'https://moodle.example.edu/' })).toBe(true);
  });

  it('matches a path prefix with a wildcard', () => {
    const r = new SimplifiedRule(rule('example.edu/mod/quiz/*'));
    expect(r.isMatch({ url: 'https://example.edu/mod/quiz/attempt.php' })).toBe(true);
    expect(r.isMatch({ url: 'https://example.edu/mod/forum/view.php' })).toBe(false);
  });

  it('matches an explicit port', () => {
    const r = new SimplifiedRule(rule('example.edu:8443'));
    expect(r.isMatch({ url: 'https://example.edu:8443/' })).toBe(true);
    expect(r.isMatch({ url: 'https://example.edu/' })).toBe(false);
  });

  it('treats a default port as the scheme default', () => {
    const r = new SimplifiedRule(rule('example.edu:443'));
    expect(r.isMatch({ url: 'https://example.edu/' })).toBe(true);
  });

  it('returns false for an unparseable URL instead of throwing', () => {
    const r = new SimplifiedRule(rule('example.edu'));
    expect(r.isMatch({ url: 'not a url' })).toBe(false);
  });

  it('rejects an expression without alphanumerics', () => {
    expect(() => new SimplifiedRule(rule('///'))).toThrow();
  });
});

describe('regex filter rules', () => {
  it('matches against the whole URL', () => {
    const r = new RegexRule(rule('^https://example\\.edu/quiz/\\d+$', { regex: true }));
    expect(r.isMatch({ url: 'https://example.edu/quiz/42' })).toBe(true);
    expect(r.isMatch({ url: 'https://example.edu/quiz/abc' })).toBe(false);
  });
});

describe('request filter precedence', () => {
  it('blocks by default when nothing matches', () => {
    const filter = new RequestFilter('block');
    filter.loadAll([rule('example.edu')]);
    expect(filter.process({ url: 'https://elsewhere.com/' })).toBe('block');
  });

  it('allows a matching allow rule', () => {
    const filter = new RequestFilter('block');
    filter.loadAll([rule('example.edu')]);
    expect(filter.process({ url: 'https://example.edu/quiz' })).toBe('allow');
  });

  it('gives block rules precedence over allow rules', () => {
    const filter = new RequestFilter('block');
    filter.loadAll([rule('example.edu'), rule('example.edu/admin/*', { result: 'block' })]);
    expect(filter.process({ url: 'https://example.edu/admin/settings' })).toBe('block');
    expect(filter.process({ url: 'https://example.edu/quiz' })).toBe('allow');
  });

  it('skips inactive rules', () => {
    const filter = new RequestFilter('block');
    filter.loadAll([rule('example.edu', { active: false })]);
    expect(filter.process({ url: 'https://example.edu/' })).toBe('block');
  });

  it('ignores malformed rules instead of failing the session', () => {
    const filter = new RequestFilter('allow');
    expect(() => filter.loadAll([rule('***[', { regex: true }), rule('example.edu')])).not.toThrow();
    expect(filter.process({ url: 'https://example.edu/' })).toBe('allow');
  });
});
