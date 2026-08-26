/**
 * Configuration key name constants used inside .seb configuration files.
 *
 * These are the raw JSON/plist keys as produced by the official Safe Exam
 * Browser clients. They are ported from the reference implementation
 * (SafeExamBrowser.Configuration/ConfigurationData/Keys.cs) so that the Config
 * Key computed on Linux matches the one an exam server expects.
 */
export const Keys = {
  General: {
    OriginatorVersion: 'originatorVersion',
    LogLevel: 'logLevel',
  },
  Browser: {
    StartUrl: 'startURL',
    QuitUrl: 'quitURL',
    QuitUrlConfirmation: 'quitURLConfirm',
    SendBrowserExamKey: 'sendBrowserExamKey',
    ExamKeySalt: 'examKeySalt',
    AllowSpellCheck: 'allowSpellCheck',
    EnableBrowser: 'enableSebBrowser',
    UserAgentSuffix: 'browserUserAgent',
    CustomUserAgentDesktop: 'browserUserAgentWinDesktopModeCustom',
  },
  Security: {
    QuitPasswordHash: 'hashedQuitPassword',
    AdminPasswordHash: 'hashedAdminPassword',
    AllowReconfiguration: 'examSessionReconfigureAllow',
  },
  ConfigFile: {
    ConfigurationPurpose: 'sebConfigPurpose',
    SessionMode: 'sebMode',
  },
} as const;

/** Keys that are excluded from the Config Key computation. */
export const CONFIG_KEY_EXCLUDED_KEYS = new Set<string>([Keys.General.OriginatorVersion.toLowerCase()]);
