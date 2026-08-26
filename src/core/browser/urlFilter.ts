/**
 * URL filtering, ported from the reference client
 * (SafeExamBrowser.Browser/Filters/*). A .seb configuration can restrict which
 * URLs the exam browser may load; rules are either "simplified" SEB expressions
 * or raw regular expressions.
 */

export type FilterResult = 'allow' | 'block';

export interface FilterRuleSettings {
  expression: string;
  result: FilterResult;
  regex: boolean;
  active: boolean;
}

export interface FilterRequest {
  url: string;
}

interface Rule {
  result: FilterResult;
  isMatch(request: FilterRequest): boolean;
}

/** Equivalent of .NET's Regex.Escape. */
function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\#\s]/g, '\\$&');
}

function replaceWildcard(expression: string): string {
  return expression.split('\\*').join('.*');
}

function build(expression: string): RegExp {
  return new RegExp(`^${expression}$`, 'i');
}

const URL_DELIMITER_PATTERN =
  /(?:([^:]*):\/\/)?(?:([^:@]*)(?::([^@]*))?@)?(?:([^/:?#]*))?(?::([0-9*]*))?([^?#]*)?(?:\?([^#]*))?(?:#(.*))?/;

const DEFAULT_PORTS: Record<string, number> = {
  'http:': 80,
  'https:': 443,
  'ftp:': 21,
  'ws:': 80,
  'wss:': 443,
};

function portOf(url: URL): number {
  if (url.port !== '') {
    return Number.parseInt(url.port, 10);
  }
  return DEFAULT_PORTS[url.protocol] ?? -1;
}

function userInfoOf(url: URL): string {
  if (url.username === '') {
    return '';
  }
  return url.password === '' ? url.username : `${url.username}:${url.password}`;
}

/** A SEB "simplified" filter expression, e.g. `*.example.edu/exam/*`. */
export class SimplifiedRule implements Rule {
  readonly result: FilterResult;

  private scheme?: RegExp;
  private userInfo?: RegExp;
  private host!: RegExp;
  private port?: number;
  private path?: RegExp;
  private query?: RegExp;
  private fragment?: RegExp;

  constructor(settings: FilterRuleSettings) {
    if (settings.expression === undefined || settings.expression === null) {
      throw new Error('Filter expression must not be empty.');
    }
    if (!/[a-zA-Z0-9*]+/.test(settings.expression)) {
      throw new Error('Expression must consist of at least one alphanumeric character or asterisk.');
    }
    this.result = settings.result;
    this.parseExpression(settings.expression);
  }

  private parseExpression(expression: string): void {
    const match = URL_DELIMITER_PATTERN.exec(expression);
    const groups = match ?? [];

    this.parseScheme(groups[1] ?? '');
    this.parseUserInfo(groups[2] ?? '', groups[3] ?? '');
    this.parseHost(groups[4] ?? '');
    this.parsePort(groups[5] ?? '');
    this.parsePath(groups[6] ?? '');
    this.parseQuery(groups[7] ?? '');
    this.parseFragment(groups[8] ?? '');
  }

  private parseScheme(expression: string): void {
    if (expression.length > 0) {
      this.scheme = build(replaceWildcard(escapeRegex(expression)));
    }
  }

  private parseUserInfo(username: string, password: string): void {
    if (username.length > 0) {
      const user = escapeRegex(username);
      const pass = escapeRegex(password);
      const expression = pass.length === 0 ? `${user}(:.*)?` : `${user}:${pass}`;
      this.userInfo = build(replaceWildcard(expression));
    }
  }

  private parseHost(expression: string): void {
    const isAlphanumeric = /^[a-zA-Z0-9]+$/.test(expression);
    const matchExactSubdomain = expression.startsWith('.');
    let value = matchExactSubdomain ? expression.slice(1) : expression;

    value = replaceWildcard(escapeRegex(value));

    if (!isAlphanumeric && !matchExactSubdomain) {
      value = `(.+?\\.)*${value}`;
    }
    this.host = build(value);
  }

  private parsePort(expression: string): void {
    const port = Number.parseInt(expression, 10);
    if (!Number.isNaN(port)) {
      this.port = port;
    }
  }

  private parsePath(expression: string): void {
    if (expression.trim().length > 0 && expression !== '/') {
      let value = replaceWildcard(escapeRegex(expression));
      value = value.endsWith('/') ? `${value}?` : `${value}/?`;
      this.path = build(value);
    }
  }

  private parseQuery(expression: string): void {
    if (expression.trim().length > 0) {
      const value = expression === '.' ? '\\??' : `\\??${replaceWildcard(escapeRegex(expression))}`;
      this.query = build(value);
    }
  }

  private parseFragment(expression: string): void {
    if (expression.trim().length > 0) {
      this.fragment = build(`#?${replaceWildcard(escapeRegex(expression))}`);
    }
  }

  isMatch(request: FilterRequest): boolean {
    let url: URL;
    try {
      url = new URL(request.url);
    } catch {
      return false;
    }

    let isMatch = true;
    isMatch &&= this.scheme === undefined || this.scheme.test(url.protocol.replace(/:$/, ''));
    isMatch &&= this.userInfo === undefined || this.userInfo.test(userInfoOf(url));
    isMatch &&= this.host.test(url.hostname);
    isMatch &&= this.port === undefined || this.port === portOf(url);
    isMatch &&= this.path === undefined || this.path.test(url.pathname);
    isMatch &&= this.query === undefined || this.query.test(url.search);
    isMatch &&= this.fragment === undefined || this.fragment.test(url.hash);

    return isMatch;
  }
}

/** A raw regular-expression filter rule. */
export class RegexRule implements Rule {
  readonly result: FilterResult;
  private readonly pattern: RegExp;

  constructor(settings: FilterRuleSettings) {
    this.result = settings.result;
    this.pattern = new RegExp(settings.expression, 'i');
  }

  isMatch(request: FilterRequest): boolean {
    return this.pattern.test(request.url);
  }
}

export function createRule(settings: FilterRuleSettings): Rule {
  return settings.regex ? new RegexRule(settings) : new SimplifiedRule(settings);
}

/**
 * Evaluates requests against the configured rules. Block rules are checked
 * first, then allow rules, then the configured default — matching the reference
 * implementation's precedence.
 */
export class RequestFilter {
  private readonly allowRules: Rule[] = [];
  private readonly blockRules: Rule[] = [];

  constructor(public defaultResult: FilterResult = 'block') {}

  load(rule: Rule): void {
    if (rule.result === 'allow') {
      this.allowRules.push(rule);
    } else {
      this.blockRules.push(rule);
    }
  }

  loadAll(rules: FilterRuleSettings[]): void {
    for (const settings of rules) {
      if (!settings.active) {
        continue;
      }
      try {
        this.load(createRule(settings));
      } catch {
        // A malformed rule must not prevent the session from starting.
      }
    }
  }

  process(request: FilterRequest): FilterResult {
    for (const rule of this.blockRules) {
      if (rule.isMatch(request)) {
        return 'block';
      }
    }
    for (const rule of this.allowRules) {
      if (rule.isMatch(request)) {
        return 'allow';
      }
    }
    return this.defaultResult;
  }
}
