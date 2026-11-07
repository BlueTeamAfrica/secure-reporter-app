/**
 * The app's language for this run. Chosen once at start-up from the layout direction, which
 * the language setting forces (Arabic = RTL, English = LTR) and which only changes through a
 * reload. Import this module, not strings.ts, from screens: importing it sets the table.
 */
import { I18nManager } from "react-native";

import type { Language } from "../state/languagePlan";
import { formatWhen } from "./format";
import { fmt, setActiveLanguage, t, type Strings } from "./strings";

export const LANGUAGE: Language = I18nManager.isRTL ? "ar" : "en";
setActiveLanguage(LANGUAGE);

export const isArabic = LANGUAGE === "ar";

export { fmt, t, type Strings };

/** Date and time with Western digits, in the active language. */
export function when(value: string | number | Date): string {
  return formatWhen(value, t());
}
