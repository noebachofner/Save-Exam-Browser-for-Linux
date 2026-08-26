import { createHash } from 'node:crypto';
import { serializeCanonical, type SebValue } from './canonicalJson';

/**
 * Compute the Safe Exam Browser Config Key.
 *
 * The Config Key is the SHA-256 (lowercase hex) of the canonical serialization
 * of the configuration dictionary. It is deterministic and reproducible across
 * platforms, which is exactly why a Linux client can interoperate with an exam
 * server that only checks the Config Key: both sides derive the same value from
 * the same .seb file, with no per-machine or per-OS secret involved.
 *
 * Reference: SafeExamBrowser.Configuration/ConfigurationData/DataProcessor.cs
 * (CalculateConfigurationKey).
 */
export function computeConfigKey(config: { [key: string]: SebValue }): string {
  const canonical = serializeCanonical(config);
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/**
 * Compute the per-request Config Key hash sent in the
 * `X-SafeExamBrowser-ConfigKeyHash` header: SHA-256 of the request URL (without
 * fragment) concatenated with the Config Key.
 *
 * Reference: SafeExamBrowser.Configuration/Cryptography/KeyGenerator.cs
 * (CalculateConfigurationKeyHash).
 */
export function computeConfigKeyHash(configKey: string, url: string): string {
  const urlWithoutFragment = url.split('#')[0] ?? url;
  return createHash('sha256')
    .update(urlWithoutFragment + configKey, 'utf8')
    .digest('hex');
}
