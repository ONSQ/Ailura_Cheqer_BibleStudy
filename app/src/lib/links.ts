/**
 * Outbound links. SUPPORT_URL appears on the About screen only, alongside
 * the data attributions. Never gate any content or feature behind support,
 * especially anything touching the CC BY-NC Dead Sea Scrolls data.
 */
export const SUPPORT_URL: string | null = 'https://buymeacoffee.com/ONSQ';

export const AILURA_URL = 'https://ailura.net';

/**
 * Who answers for the app and where privacy questions and data requests
 * go; shown on the privacy policy and the delete-account screen, and the
 * same details belong in the store listings.
 */
/**
 * Direct test-install links for the "Get the app" page. Null hides the
 * button and leaves only the email request form. The Play link is the store
 * listing: during the closed test Google shows it only to accounts already on
 * the tester list, so the page keeps the email form under it for everyone else.
 */
export const TESTFLIGHT_PUBLIC_URL: string | null = 'https://testflight.apple.com/join/AnQq5Zr5';
export const PLAY_TEST_URL: string | null =
  'https://play.google.com/store/apps/details?id=net.onsq.cheqer';

/**
 * Android self-serve signup. The Play closed track lists a Google Group as
 * its testers, and the group lets anyone join, so a visitor joins the group,
 * opts in, and installs with nobody adding their address by hand. Set
 * PLAY_TESTER_GROUP_URL to the group's page (https://groups.google.com/g/<name>)
 * once the group exists and is on the track's tester list; while it is null
 * the page keeps the store button and email form above.
 */
export const PLAY_TESTER_GROUP_URL: string | null = 'https://groups.google.com/g/cheqer-testers';
export const PLAY_OPT_IN_URL = 'https://play.google.com/apps/testing/net.onsq.cheqer';

export const RESPONSIBLE_PARTY = 'ONSQ Enterprises';
export const CONTACT_EMAIL = 'onsq@onsq.net';
