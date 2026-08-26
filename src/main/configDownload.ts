import { BrowserWindow, session as electronSession, type Session } from 'electron';
import { AuthenticationRequiredError, looksLikeHtml, SebUrlError } from '../core/net/sebUrl';
import { logger } from './logger';

/**
 * Downloading a .seb configuration through Electron's network stack.
 *
 * Node's `fetch` has no cookie store, so any configuration endpoint that sits
 * behind a login is unreachable with it: the server answers with its sign-in
 * page and there is no way to ever get past that. Electron's `net` module uses
 * Chromium's stack instead, sharing the session's cookie jar with the windows we
 * open — which is what makes an interactive sign-in possible at all.
 */

/** Download through the given session, honouring its cookies. */
export async function downloadThroughSession(
  url: string,
  userAgent: string,
  session: Session = electronSession.defaultSession,
): Promise<Buffer> {
  // `session.fetch` is the session-scoped form of `net.fetch`: same Chromium
  // stack, but explicitly bound to this session's cookie jar.
  const response = await session.fetch(url, {
    headers: { 'User-Agent': userAgent },
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new SebUrlError(
      `Failed to download configuration from ${url}: HTTP ${response.status} ${response.statusText}.`,
    );
  }

  const data = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.toLowerCase().includes('text/html') || looksLikeHtml(data)) {
    throw new AuthenticationRequiredError(response.url || url);
  }

  return data;
}

/**
 * Download a configuration, prompting for an interactive sign-in if the server
 * answers with a web page instead.
 *
 * The sign-in window shares the session cookie jar with the download, so once
 * the user is authenticated the very same request succeeds. Rather than trying
 * to recognise "the login worked" from the page itself — which differs across
 * institutions and identity providers — every navigation simply retries the
 * download and lets the result decide.
 */
export async function downloadWithSignIn(
  url: string,
  userAgent: string,
  session: Session = electronSession.defaultSession,
): Promise<Buffer> {
  try {
    return await downloadThroughSession(url, userAgent, session);
  } catch (error) {
    if (!(error instanceof AuthenticationRequiredError)) {
      throw error;
    }
    logger.info('The configuration requires a sign-in; opening the login page.');
    return signInThenDownload(url, userAgent, error.finalUrl, session);
  }
}

function signInThenDownload(
  configUrl: string,
  userAgent: string,
  loginUrl: string,
  session: Session,
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const window = new BrowserWindow({
      width: 960,
      height: 800,
      title: 'Sign in to load the exam configuration',
      autoHideMenuBar: true,
      webPreferences: {
        session,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    let settled = false;
    let retrying = false;

    /**
     * Once signed in, the server serves the .seb file itself, which Chromium
     * turns into a download with a save dialog. The user should never see that:
     * we fetch the configuration ourselves. Cancel the download and treat it as
     * the signal that the configuration has become reachable.
     */
    const onWillDownload = (event: { preventDefault: () => void }): void => {
      event.preventDefault();
      logger.debug('Suppressed a configuration download in the sign-in window.');
      void attempt();
    };
    session.on('will-download', onWillDownload);

    const finish = (action: () => void): void => {
      if (settled) {
        return;
      }
      settled = true;
      session.off('will-download', onWillDownload);
      window.removeAllListeners('closed');
      if (!window.isDestroyed()) {
        window.destroy();
      }
      action();
    };

    const attempt = async (): Promise<void> => {
      // Navigations arrive in bursts (redirects, frames); one attempt at a time.
      if (settled || retrying) {
        return;
      }
      retrying = true;
      try {
        const data = await downloadThroughSession(configUrl, userAgent, session);
        logger.info('Signed in successfully; configuration downloaded.');
        finish(() => resolve(data));
      } catch (error) {
        if (!(error instanceof AuthenticationRequiredError)) {
          finish(() => reject(error));
        }
        // Still not signed in: leave the window open and wait for the next move.
      } finally {
        retrying = false;
      }
    };

    window.webContents.on('did-navigate', () => void attempt());
    window.webContents.on('did-navigate-in-page', () => void attempt());

    window.on('closed', () => {
      finish(() =>
        reject(
          new SebUrlError(
            'The sign-in window was closed before the configuration could be downloaded. ' +
              'You can also download the .seb file in your browser and start the client with it.',
          ),
        ),
      );
    });

    window.loadURL(loginUrl).catch((error) => {
      finish(() => reject(error));
    });
  });
}
