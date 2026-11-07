/**
 * Every visible string, in English and Arabic. Pure (no React Native imports) so it is
 * unit-tested; src/i18n/index.ts picks the table once at start-up (a language change reloads).
 *
 * Rules (enforced by strings.test.ts):
 * - Both tables have exactly the same keys and the same {placeholders}.
 * - No "encrypted", "secure" or "report" (or their Arabic equivalents) anywhere.
 * - Western digits 0-9 only; Arabic text never uses Arabic-Indic digits.
 * - Nothing may reveal to a casual observer what the app is for.
 *
 * Arabic wording is a draft for review: see docs/arabic-review.md.
 */
import type { Language } from "../state/languagePlan";

const en = {
  common: {
    appName: "My Notes",
    back: "← Back",
    cancel: "Cancel",
    save: "Save",
    saving: "Saving…",
    next: "Next",
    notesButton: "Notes",
    loading: "Loading…",
    genericError: "Something went wrong. Try again.",
  },
  language: {
    choose: "Choose your language",
    arabic: "العربية",
    english: "English",
  },
  pin: {
    setupCreateTitle: "Create a code",
    setupCreateBody: "You will use this code every time you open the app. 4 to 6 digits.",
    setupConfirmTitle: "Confirm code",
    setupConfirmBody: "Enter the same code again to confirm.",
    setupSecondTitle: "Create a second code",
    setupSecondBody:
      "This code opens a simple notes app. Use it if you are ever made to open the app. It must be different from your first code.",
    setupSecondConfirmTitle: "Confirm second code",
    setupMismatch: "Codes do not match. Try again.",
    setupSameAsFirst: "The second code must be different from the first.",
    setupAckTitle: "Before you continue",
    setupAckBody:
      "If you forget your code, your drafts can't be recovered. There is no reset and no recovery.",
    setupAckButton: "I understand",
    setupWorking: "Setting up…",
    unlockTitle: "Continue",
    unlockBody: "Enter your code to continue.",
    unlockButton: "Continue",
    unlockWorking: "Checking…",
    unlockTryAgain: "Try again.",
    unlockWait: "Please wait a moment.",
    unlockWaitSeconds: "Please wait {seconds} s",
    errInvalidPin: "Use 4 to 6 digits.",
    errUnsupported: "This version can't open the data on this phone. Install the latest version.",
    errDeviceKeyMissing: "The data on this phone can't be opened on this device.",
    errUnavailable: "This version of the app is missing a required component. Install the latest version.",
    errNotSetUp: "The app needs to be set up again.",
    errGeneric: "Something went wrong. Try again.",
  },
  home: {
    title: "Home",
    sendNow: "Send now",
    settings: "Settings",
    newEntry: "New entry",
    continueWriting: "Continue writing",
    untitled: "Untitled",
    files: "Files: {count}",
    myDrafts: "My drafts",
    empty: "No drafts yet. Tap “New entry” to start.",
    waitingHeading: "Waiting to send",
    waitingLine:
      "Waiting: {count}. They are sent when you are online with the app open on this screen.",
    lastSent: "Last sent: {time}",
    sending: "Sending…",
    resultSent: "Sent.",
    resultNothing: "Nothing is waiting to send.",
    resultOffline:
      "No connection. Your items are waiting and will be sent when you are online with the app open on this screen.",
    resultFailed: "Not sent: {count}. It is still waiting. Try again later.",
    resultPartial: "Sent: {sent}. Not sent: {failed}, still waiting. Try again later.",
    statusDraft: "Draft",
    statusReady: "Ready",
    statusWaiting: "Waiting",
    statusSending: "Sending…",
    statusNotSent: "Not sent",
    send: "Send",
    backToDrafts: "Move back to drafts",
  },
  sendError: {
    missingFileNamed: "A file is no longer on this phone: {fileName}. Remove it or add it again, then send.",
    missingFile: "A file is no longer on this phone. Remove it or add it again, then send.",
    unreadableFileNamed: "A file could not be read: {fileName}. Remove it or add it again, then send.",
    unreadableFile: "A file could not be read. Remove it or add it again, then send.",
    generic: "Could not send. It will be tried again.",
  },
  editor: {
    titleNew: "New entry",
    titleEdit: "Edit entry",
    titlePlaceholder: "Title",
    bodyPlaceholder: "Write here…",
    files: "Files",
    addFile: "Add file",
    opening: "Opening…",
    noFiles: "No files added.",
    remove: "Remove",
    fileBadge: "FILE",
    addFileFailed: "Could not add the selected file(s).",
    saveDraft: "Save draft",
    saveFailed: "Could not save. Try again.",
    send: "Send",
    sendPreparing: "Preparing…",
    sendFailed: "Could not prepare to send. Try again.",
    needsText: "Write some text or add a file before sending. A title alone is not sent.",
    nameNeededTitle: "Add your name first",
    nameNeededBody: "Your name is sent with each entry.",
    addName: "Add name",
  },
  settings: {
    title: "Settings",
    language: "Language",
    languageCurrent: "English",
    languageSwitchTitle: "Change language?",
    languageSwitchBody:
      "The app will restart and ask for your code. Your draft is saved first.",
    languageSwitchConfirm: "Change",
    languageSwitchFailed: "Could not change the language. Try again.",
    changeCode: "Change code",
    changeCodeHint: "The code that opens your drafts.",
    changeSecondCode: "Change second code",
    changeSecondCodeHint: "The code that opens the notes app.",
    name: "Name",
    nameHint: "Sent with each entry.",
    keypad: "Shuffle keypad",
    keypadHint: "Shuffle key positions on the code screen.",
    erase: "Erase everything",
    eraseHint: "Remove all data from this phone.",
    diagnostics: "Diagnostics",
    diagnosticsHint: "Storage counts and speed test. Test builds only.",
    version: "Version {version}",
  },
  changeCode: {
    currentTitle: "Enter your current code",
    currentSecondTitle: "Enter the current second code",
    newTitle: "Enter a new code",
    newSecondTitle: "Enter a new second code",
    confirmTitle: "Enter the new code again",
    digits: "4 to 6 digits.",
    noRecovery: "There is no way to recover a forgotten code.",
    wrong: "That code is not right. Try again.",
    mustDiffer: "The two codes must be different.",
    working: "Saving…",
    done: "Code changed.",
  },
  erase: {
    title: "Erase everything",
    warning:
      "This removes everything on this phone: your drafts, items waiting to send, files, your name and both codes. It cannot be undone. Items that were already sent are not affected.",
    prompt: "Enter your code to erase everything.",
    button: "Erase everything",
    working: "Erasing…",
    wrong: "That code is not right. Nothing was erased.",
  },
  profile: {
    title: "Your name",
    body: "Your name is sent with each entry.",
    label: "Name",
    placeholder: "Your name",
    required: "Enter a name.",
  },
  guide: {
    codesTitle: "Two codes",
    codesBody:
      "Your first code opens your drafts. Your second code opens a simple notes app. If you are ever made to open this app, enter the second code.",
    notesTitle: "The Notes button",
    notesBody:
      "The Notes button at the top of every screen switches to the notes app at once. Your draft is saved first.",
    backTitle: "Getting back",
    backBody: "From the notes app, leave the app, open it again and enter your first code.",
    sendTitle: "Sending",
    sendBody:
      "What you send goes when you are online with the app open on the home screen. When you have a connection, open the app once.",
    start: "Start",
  },
  cover: {
    title: "My Notes",
    newNote: "New note",
    empty: "No notes.",
    untitled: "Untitled",
    back: "← Notes",
    titlePlaceholder: "Title",
    bodyPlaceholder: "Note",
    delete: "Delete",
    deleteTitle: "Delete this note?",
    samples: [
      { title: "Shopping", body: "Bread\nTomatoes\nRice\nTea\nSoap" },
      {
        title: "This week",
        body: "Top up the electricity\nCall the plumber about the kitchen tap\nReturn the borrowed chairs",
      },
      {
        title: "Lentil soup",
        body: "1 cup red lentils, 1 onion, 2 cloves of garlic, cumin, salt. Cook 25 minutes, then blend.",
      },
      { title: "Plants", body: "Water the mint every two days. Keep the basil out of the midday sun." },
    ],
  },
  legacy: {
    preview: "Preview",
    status: "Status: {status}",
    makeReady: "Make ready",
    addToWaiting: "Add to waiting",
    edit: "Edit",
    saved: "Saved",
    savedBody: "Your entry was saved.",
    backHome: "Back to Home",
    saveFailed: "Could not save.",
  },
  date: {
    today: "Today",
    yesterday: "Yesterday",
    months: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    separator: ", ",
  },
};

export type Strings = typeof en;

const ar: Strings = {
  common: {
    appName: "My Notes",
    back: "→ رجوع",
    cancel: "إلغاء",
    save: "حفظ",
    saving: "جارٍ الحفظ…",
    next: "التالي",
    notesButton: "ملاحظات",
    loading: "جارٍ التحميل…",
    genericError: "حدث خطأ. حاول مرة أخرى.",
  },
  language: {
    choose: "اختر لغتك",
    arabic: "العربية",
    english: "English",
  },
  pin: {
    setupCreateTitle: "أنشئ رمزاً",
    setupCreateBody: "ستستخدم هذا الرمز في كل مرة تفتح فيها التطبيق. من 4 إلى 6 أرقام.",
    setupConfirmTitle: "تأكيد الرمز",
    setupConfirmBody: "أدخل الرمز نفسه مرة أخرى للتأكيد.",
    setupSecondTitle: "أنشئ رمزاً ثانياً",
    setupSecondBody:
      "هذا الرمز يفتح تطبيق ملاحظات بسيطاً. استخدمه إذا أُجبرت يوماً على فتح التطبيق. يجب أن يختلف عن رمزك الأول.",
    setupSecondConfirmTitle: "تأكيد الرمز الثاني",
    setupMismatch: "الرمزان غير متطابقين. حاول مرة أخرى.",
    setupSameAsFirst: "يجب أن يختلف الرمز الثاني عن الأول.",
    setupAckTitle: "قبل المتابعة",
    setupAckBody: "إذا نسيت رمزك فلا يمكن استرجاع مسوداتك. لا توجد إعادة تعيين ولا استرجاع.",
    setupAckButton: "فهمت",
    setupWorking: "جارٍ الإعداد…",
    unlockTitle: "متابعة",
    unlockBody: "أدخل رمزك للمتابعة.",
    unlockButton: "متابعة",
    unlockWorking: "جارٍ التحقق…",
    unlockTryAgain: "حاول مرة أخرى.",
    unlockWait: "يُرجى الانتظار قليلاً.",
    unlockWaitSeconds: "يُرجى الانتظار {seconds} ثانية",
    errInvalidPin: "استخدم من 4 إلى 6 أرقام.",
    errUnsupported: "لا يستطيع هذا الإصدار فتح البيانات على هذا الهاتف. ثبّت أحدث إصدار.",
    errDeviceKeyMissing: "لا يمكن فتح البيانات على هذا الجهاز.",
    errUnavailable: "ينقص هذا الإصدار من التطبيق مكوّن ضروري. ثبّت أحدث إصدار.",
    errNotSetUp: "يجب إعداد التطبيق من جديد.",
    errGeneric: "حدث خطأ. حاول مرة أخرى.",
  },
  home: {
    title: "الرئيسية",
    sendNow: "أرسل الآن",
    settings: "الإعدادات",
    newEntry: "مادة جديدة",
    continueWriting: "متابعة الكتابة",
    untitled: "بدون عنوان",
    files: "الملفات: {count}",
    myDrafts: "مسوداتي",
    empty: "لا توجد مسودات بعد. اضغط «مادة جديدة» للبدء.",
    waitingHeading: "بانتظار الإرسال",
    waitingLine: "بانتظار الإرسال: {count}. تُرسل عندما تكون متصلاً بالإنترنت والتطبيق مفتوح على هذه الشاشة.",
    lastSent: "آخر إرسال: {time}",
    sending: "جارٍ الإرسال…",
    resultSent: "تم الإرسال.",
    resultNothing: "لا يوجد شيء بانتظار الإرسال.",
    resultOffline:
      "لا يوجد اتصال. موادك بانتظار الإرسال وستُرسل عندما تتصل بالإنترنت والتطبيق مفتوح على هذه الشاشة.",
    resultFailed: "لم يُرسل: {count}. ما زال بانتظار الإرسال. حاول لاحقاً.",
    resultPartial: "أُرسل: {sent}. لم يُرسل: {failed}، وما زال بانتظار الإرسال. حاول لاحقاً.",
    statusDraft: "مسودة",
    statusReady: "جاهزة",
    statusWaiting: "بانتظار الإرسال",
    statusSending: "جارٍ الإرسال…",
    statusNotSent: "لم تُرسل",
    send: "إرسال",
    backToDrafts: "إعادة إلى المسودات",
  },
  sendError: {
    missingFileNamed: "لم يعد هذا الملف موجوداً على الهاتف: {fileName}. أزله أو أضفه من جديد ثم أرسل.",
    missingFile: "لم يعد أحد الملفات موجوداً على الهاتف. أزله أو أضفه من جديد ثم أرسل.",
    unreadableFileNamed: "تعذّرت قراءة الملف: {fileName}. أزله أو أضفه من جديد ثم أرسل.",
    unreadableFile: "تعذّرت قراءة أحد الملفات. أزله أو أضفه من جديد ثم أرسل.",
    generic: "تعذّر الإرسال. ستُعاد المحاولة.",
  },
  editor: {
    titleNew: "مادة جديدة",
    titleEdit: "تعديل المادة",
    titlePlaceholder: "العنوان",
    bodyPlaceholder: "اكتب هنا…",
    files: "الملفات",
    addFile: "إضافة ملف",
    opening: "جارٍ الفتح…",
    noFiles: "لم تُضف ملفات.",
    remove: "إزالة",
    fileBadge: "ملف",
    addFileFailed: "تعذّرت إضافة الملفات المختارة.",
    saveDraft: "حفظ كمسودة",
    saveFailed: "تعذّر الحفظ. حاول مرة أخرى.",
    send: "إرسال",
    sendPreparing: "جارٍ التحضير…",
    sendFailed: "تعذّر التحضير للإرسال. حاول مرة أخرى.",
    needsText: "اكتب نصاً أو أضف ملفاً قبل الإرسال. العنوان وحده لا يُرسل.",
    nameNeededTitle: "أضف اسمك أولاً",
    nameNeededBody: "يُرسل اسمك مع كل مادة.",
    addName: "إضافة الاسم",
  },
  settings: {
    title: "الإعدادات",
    language: "اللغة",
    languageCurrent: "العربية",
    languageSwitchTitle: "تغيير اللغة؟",
    languageSwitchBody: "سيُعاد تشغيل التطبيق ويطلب رمزك. تُحفظ مسودتك أولاً.",
    languageSwitchConfirm: "تغيير",
    languageSwitchFailed: "تعذّر تغيير اللغة. حاول مرة أخرى.",
    changeCode: "تغيير الرمز",
    changeCodeHint: "الرمز الذي يفتح مسوداتك.",
    changeSecondCode: "تغيير الرمز الثاني",
    changeSecondCodeHint: "الرمز الذي يفتح تطبيق الملاحظات.",
    name: "الاسم",
    nameHint: "يُرسل مع كل مادة.",
    keypad: "خلط لوحة الأرقام",
    keypadHint: "تغيير أماكن الأرقام في شاشة الرمز.",
    erase: "مسح كل شيء",
    eraseHint: "حذف كل البيانات من هذا الهاتف.",
    diagnostics: "التشخيص",
    diagnosticsHint: "عدد العناصر المخزنة واختبار السرعة. لنسخ الاختبار فقط.",
    version: "الإصدار {version}",
  },
  changeCode: {
    currentTitle: "أدخل رمزك الحالي",
    currentSecondTitle: "أدخل الرمز الثاني الحالي",
    newTitle: "أدخل رمزاً جديداً",
    newSecondTitle: "أدخل رمزاً ثانياً جديداً",
    confirmTitle: "أدخل الرمز الجديد مرة أخرى",
    digits: "من 4 إلى 6 أرقام.",
    noRecovery: "لا توجد طريقة لاسترجاع رمز منسي.",
    wrong: "الرمز غير صحيح. حاول مرة أخرى.",
    mustDiffer: "يجب أن يختلف الرمزان.",
    working: "جارٍ الحفظ…",
    done: "تم تغيير الرمز.",
  },
  erase: {
    title: "مسح كل شيء",
    warning:
      "يحذف هذا كل شيء على هذا الهاتف: مسوداتك، وما ينتظر الإرسال، والملفات، واسمك، والرمزين. لا يمكن التراجع عنه. ما أُرسل من قبل لا يتأثر.",
    prompt: "أدخل رمزك لمسح كل شيء.",
    button: "مسح كل شيء",
    working: "جارٍ المسح…",
    wrong: "الرمز غير صحيح. لم يُمسح شيء.",
  },
  profile: {
    title: "اسمك",
    body: "يُرسل اسمك مع كل مادة.",
    label: "الاسم",
    placeholder: "اسمك",
    required: "أدخل اسماً.",
  },
  guide: {
    codesTitle: "رمزان",
    codesBody:
      "رمزك الأول يفتح مسوداتك. ورمزك الثاني يفتح تطبيق ملاحظات بسيطاً. إذا أُجبرت يوماً على فتح هذا التطبيق، فأدخل الرمز الثاني.",
    notesTitle: "زر «ملاحظات»",
    notesBody: "زر «ملاحظات» أعلى كل شاشة ينقلك فوراً إلى تطبيق الملاحظات. تُحفظ مسودتك أولاً.",
    backTitle: "العودة",
    backBody: "من تطبيق الملاحظات: اخرج من التطبيق، ثم افتحه من جديد وأدخل رمزك الأول.",
    sendTitle: "الإرسال",
    sendBody:
      "ما ترسله يُرسل عندما تكون متصلاً بالإنترنت والتطبيق مفتوح على الشاشة الرئيسية. عندما يتوفر لديك اتصال، افتح التطبيق مرة واحدة.",
    start: "ابدأ",
  },
  cover: {
    title: "ملاحظاتي",
    newNote: "ملاحظة جديدة",
    empty: "لا توجد ملاحظات.",
    untitled: "بدون عنوان",
    back: "→ الملاحظات",
    titlePlaceholder: "العنوان",
    bodyPlaceholder: "ملاحظة",
    delete: "حذف",
    deleteTitle: "حذف هذه الملاحظة؟",
    samples: [
      { title: "مشتريات", body: "عيش\nطماطم\nرز\nشاي\nصابون" },
      {
        title: "هذا الأسبوع",
        body: "شحن الكهرباء\nالاتصال بالسبّاك بخصوص حنفية المطبخ\nإرجاع الكراسي المستعارة",
      },
      {
        title: "شوربة العدس",
        body: "كوب عدس أحمر، بصلة، فصّا ثوم، كمّون، ملح. تُطبخ 25 دقيقة ثم تُخلط.",
      },
      { title: "النباتات", body: "سقي النعناع كل يومين. إبعاد الريحان عن شمس الظهيرة." },
    ],
  },
  legacy: {
    preview: "معاينة",
    status: "الحالة: {status}",
    makeReady: "تجهيز",
    addToWaiting: "إضافة إلى الانتظار",
    edit: "تعديل",
    saved: "تم الحفظ",
    savedBody: "حُفظت مادتك.",
    backHome: "العودة إلى الرئيسية",
    saveFailed: "تعذّر الحفظ.",
  },
  date: {
    today: "اليوم",
    yesterday: "أمس",
    months: ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"],
    separator: "، ",
  },
};

export const TABLES: Record<Language, Strings> = { en, ar };

let active: Language = "en";

/** Called once at start-up by src/i18n/index.ts. Tests leave it on English. */
export function setActiveLanguage(language: Language) {
  active = language;
}

export function activeLanguage(): Language {
  return active;
}

/** The active table. */
export function t(): Strings {
  return TABLES[active];
}

/** Fills {name} placeholders. Unknown placeholders are left as they are. */
export function fmt(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : whole,
  );
}
