import type { Session } from 'electron';
import { computeBrowserExamKeyHash } from '../core/crypto/browserExamKey';
import { computeConfigKeyHash } from '../core/crypto/configKey';
import { logger } from './logger';

/**
 * Injects the SEB integrity headers into outgoing requests.
 *
 * The reference client sends these for main-frame requests and for
 * subresources on the same host as the current page
 * (SafeExamBrowser.Browser/Handlers/ResourceHandler.cs → AppendCustomHeaders).
 */
export class SebHeaderInjector {
  private currentPageUrl = '';

  constructor(
    private readonly options: {
      configKey: string;
      browserExamKey: string;
      sendConfigKey: boolean;
      sendBrowserExamKey: boolean;
    },
  ) {}

  setCurrentPageUrl(url: string): void {
    this.currentPageUrl = url;
  }

  private appliesTo(url: string, resourceType: string): boolean {
    if (resourceType === 'mainFrame') {
      return true;
    }
    try {
      return new URL(url).host === new URL(this.currentPageUrl).host;
    } catch {
      return false;
    }
  }

  /**
   * Rewrite the User-Agent Client Hints so they agree with the Windows user
   * agent string. Chromium otherwise sends `Sec-CH-UA-Platform: "Linux"` and a
   * brand list that names Electron, either of which gives the client away to a
   * server that reads client hints. Only headers that are actually present are
   * touched, and the brand list keeps its Chromium entry so it still looks like
   * a Chromium-based browser — which the reference client is too.
   */
  static windowsClientHints(requestHeaders: Record<string, string>): Record<string, string> {
    const overrides: Record<string, string> = {};
    const keyOf = (name: string): string | undefined =>
      Object.keys(requestHeaders).find((k) => k.toLowerCase() === name);

    const platform = keyOf('sec-ch-ua-platform');
    if (platform) {
      overrides[platform] = '"Windows"';
    }
    const platformVersion = keyOf('sec-ch-ua-platform-version');
    if (platformVersion) {
      overrides[platformVersion] = '"10.0.0"';
    }
    const sanitizeBrands = (value: string): string =>
      value
        .split(',')
        .map((part) => part.trim())
        .filter((part) => !/electron|safeexambrowserforlinux/i.test(part))
        .join(', ');
    const brands = keyOf('sec-ch-ua');
    if (brands) {
      overrides[brands] = sanitizeBrands(requestHeaders[brands] ?? '');
    }
    const fullVersionList = keyOf('sec-ch-ua-full-version-list');
    if (fullVersionList) {
      overrides[fullVersionList] = sanitizeBrands(requestHeaders[fullVersionList] ?? '');
    }
    return overrides;
  }

  /** Compute the headers that should be added for a given request URL. */
  headersFor(url: string, resourceType: string): Record<string, string> {
    if (!this.appliesTo(url, resourceType)) {
      return {};
    }
    const headers: Record<string, string> = {};
    if (this.options.sendConfigKey && this.options.configKey) {
      headers['X-SafeExamBrowser-ConfigKeyHash'] = computeConfigKeyHash(this.options.configKey, url);
    }
    if (this.options.sendBrowserExamKey && this.options.browserExamKey) {
      headers['X-SafeExamBrowser-RequestHash'] = computeBrowserExamKeyHash(this.options.browserExamKey, url);
    }
    return headers;
  }

  /** Register the injector on an Electron session. */
  install(session: Session): void {
    session.webRequest.onBeforeSendHeaders((details, callback) => {
      const extra = this.headersFor(details.url, details.resourceType);
      const hints = SebHeaderInjector.windowsClientHints(details.requestHeaders);
      callback({ requestHeaders: { ...details.requestHeaders, ...hints, ...extra } });
    });

    logger.info(
      `Integrity headers: ConfigKey=${this.options.sendConfigKey && !!this.options.configKey}, ` +
        `BrowserExamKey=${this.options.sendBrowserExamKey && !!this.options.browserExamKey}`,
    );
  }
}
