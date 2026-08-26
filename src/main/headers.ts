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
      callback({ requestHeaders: { ...details.requestHeaders, ...extra } });
    });

    logger.info(
      `Integrity headers: ConfigKey=${this.options.sendConfigKey && !!this.options.configKey}, ` +
        `BrowserExamKey=${this.options.sendBrowserExamKey && !!this.options.browserExamKey}`,
    );
  }
}
