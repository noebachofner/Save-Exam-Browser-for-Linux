import { readFile } from 'node:fs/promises';
import { AppSettings, defaultSettings, mapSettings } from '../core/config/appSettings';
import { parseSebConfig, PasswordRequiredError, type SebConfig } from '../core/config/sebConfig';
import { isSebLink, resolveSebUrl, resolveSebUrlInsecureFallback, SebUrlError } from '../core/net/sebUrl';
import { downloadWithSignIn } from './configDownload';
import { logger } from './logger';

export interface LoadedConfiguration {
  settings: AppSettings;
  configKey: string;
  /** Where the configuration came from, for logging and the about screen. */
  origin: string;
}

/** Bootstrap user agent used only for downloading the configuration itself. */
const BOOTSTRAP_USER_AGENT = 'SEB/3.9.0 seb-linux';

async function fetchConfig(link: string): Promise<Buffer> {
  const primary = resolveSebUrl(link);
  try {
    logger.info(`Downloading configuration from ${primary}`);
    return await downloadWithSignIn(primary, BOOTSTRAP_USER_AGENT);
  } catch (error) {
    // Only retry over plain HTTP when HTTPS was not reachable at all. If the
    // server answered — an HTTP error status, or a login page — retrying over
    // HTTP just replaces the real cause with a connection error.
    if (error instanceof SebUrlError) {
      throw error;
    }
    const fallback = resolveSebUrlInsecureFallback(link);
    if (fallback === undefined) {
      throw error;
    }
    logger.warn(`HTTPS download failed, retrying over plain HTTP: ${fallback}`);
    return downloadWithSignIn(fallback, BOOTSTRAP_USER_AGENT);
  }
}

/**
 * Resolve the configuration for this session.
 *
 * Accepts a .seb file path, a seb://…/sebs://… link, a plain http(s) URL (which
 * is used directly as the start URL with default settings), or nothing at all.
 */
export async function loadConfiguration(
  source: string | undefined,
  password: string | undefined,
): Promise<LoadedConfiguration> {
  if (source === undefined) {
    logger.warn('No configuration given; starting with built-in defaults.');
    return { settings: defaultSettings(), configKey: '', origin: 'defaults' };
  }

  // A plain web URL with no .seb configuration: run it with defaults.
  if (/^https?:\/\//i.test(source) && !source.toLowerCase().endsWith('.seb')) {
    const settings = defaultSettings();
    settings.startUrl = source;
    return { settings, configKey: '', origin: source };
  }

  const raw =
    isSebLink(source) || /^https?:\/\//i.test(source) ? await fetchConfig(source) : await readFile(source);

  let parsed: SebConfig;
  try {
    parsed = parseSebConfig(raw, password);
  } catch (error) {
    if (error instanceof PasswordRequiredError && password === undefined) {
      throw new Error('This configuration is password-protected. Re-run with --password=<password>.');
    }
    throw error;
  }

  const settings = mapSettings(parsed.settings);
  logger.info(`Configuration loaded from ${source}`);
  logger.info(`Config Key: ${parsed.configKey}`);

  return { settings, configKey: parsed.configKey, origin: source };
}
