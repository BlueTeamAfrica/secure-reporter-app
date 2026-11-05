/**
 * True only in development and in EAS "preview" (test) builds, which set
 * EXPO_PUBLIC_TEST_BUILD=1 in eas.json. Production builds never set it, so anything gated
 * on this flag is absent from release builds' UI.
 *
 * Must stay a literal `process.env.EXPO_PUBLIC_TEST_BUILD` read so Expo inlines it at build time.
 */
export const IS_TEST_BUILD: boolean = __DEV__ || process.env.EXPO_PUBLIC_TEST_BUILD === "1";
