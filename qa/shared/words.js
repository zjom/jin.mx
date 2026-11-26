// @ts-check

// Everything the site itself says, in each language it can speak. The text of
// a questionnaire is in its own file; this is the rest: hints, built-in
// labels, and what is wrong with an answer

/** The languages a questionnaire may declare. `zh` is Simplified Chinese */
export const LANGS = ["en", "zh"];

/** What each language is called in the switch, and in the page's lang attribute */
export const LANG_NAMES = /** @type {Record<string, string>} */ ({ en: "EN", zh: "中文" });
export const LANG_TAGS = /** @type {Record<string, string>} */ ({ en: "en", zh: "zh-Hans" });

/** @type {Record<string, Record<string, string>>} */
export const WORDS = {
  en: {
    // answers
    required: "This one is required.",
    consentRequired: "We need your agreement to continue.",
    again: "Please answer this one again.",
    tooLong: "Please keep this under {n} characters.",
    tooShort: "A little more, please — at least {n} characters.",
    email: "That doesn’t look like an email address.",
    url: "That doesn’t look like a web address.",
    tel: "That doesn’t look like a phone number.",
    number: "Please enter a number.",
    integer: "A whole number, please.",
    tooSmall: "This can’t be less than {n}.",
    tooBig: "This can’t be more than {n}.",
    shorter: "Please keep this shorter.",
    atLeast: "Please choose at least {n}.",
    atMost: "Please choose no more than {n}.",
    date: "Please choose a date.",
    later: "Please choose a later date.",
    earlier: "Please choose an earlier date.",
    time: "Please choose a time.",
    rankAll: "Please rank every option.",
    everyRow: "Please answer every row.",
    tooMany: "No more than {n}, please.",
    // files
    fileKind: "That kind of file can’t be added here.",
    fileSize: "That file is over {n} MB.",
    fileEmpty: "That file is empty.",
    fileAgain: "Please add this file again.",
    fileRefused: "That file can’t be added here.",
    oneFile: "Only one file here; remove it to choose another.",
    uploading: "Still uploading. One moment.",
    uploadsBusy: "Too many uploads just now. Please try again in a minute.",
    uploadFailed: "That didn’t upload. Please try again.",
    chooseFile: "Choose a file",
    chooseFiles: "Choose files",
    addAnother: "Add another",
    remove: "Remove {name}",
    upTo: "Up to {n} MB",
    upToEach: "Up to {n} MB each · {max} at most",
    // controls
    optional: "Optional",
    other: "Other",
    tellMore: "Tell us more",
    yes: "Yes",
    no: "No",
    agree: "I agree",
    choose: "Choose",
    // the deck
    hintKeys: "Press Enter ↵ or drag left to continue",
    hintSwipe: "Swipe left to continue",
    offline: "Offline — your answers will be saved when you’re back.",
    send: "Send",
    sending: "Sending",
    sendFailed: "That didn’t send. Please check your connection and try again.",
    submitTitle: "That’s everything.",
    submitBody: "Swipe back to review your answers, or send them now.",
    outroTitle: "Thank you.",
    outroBody: "Your answers have been received.",
    // the page
    nothing: "Nothing here.",
    useLink: "Please use the link you were sent.",
    expired: "This link may have expired. Please check it, or ask for a new one.",
    loadFailed: "That didn’t load.",
    refresh: "Please check your connection and refresh the page.",
    progress: "Progress",
    darkMode: "Dark mode",
    language: "Language",
  },
  zh: {
    required: "此项为必填。",
    consentRequired: "需要您同意后才能继续。",
    again: "请重新回答这一题。",
    tooLong: "请控制在 {n} 个字符以内。",
    tooShort: "请再多写一点，至少 {n} 个字符。",
    email: "这似乎不是有效的邮箱地址。",
    url: "这似乎不是有效的网址。",
    tel: "这似乎不是有效的电话号码。",
    number: "请输入数字。",
    integer: "请输入整数。",
    tooSmall: "不能小于 {n}。",
    tooBig: "不能大于 {n}。",
    shorter: "请写得简短一些。",
    atLeast: "请至少选择 {n} 项。",
    atMost: "最多只能选择 {n} 项。",
    date: "请选择日期。",
    later: "请选择更晚的日期。",
    earlier: "请选择更早的日期。",
    time: "请选择时间。",
    rankAll: "请为每个选项排序。",
    everyRow: "请回答每一行。",
    tooMany: "最多 {n} 个。",
    fileKind: "此处不支持这种类型的文件。",
    fileSize: "文件超过了 {n} MB。",
    fileEmpty: "这个文件是空的。",
    fileAgain: "请重新添加此文件。",
    fileRefused: "此处无法添加这个文件。",
    oneFile: "此处只能添加一个文件，移除后可重新选择。",
    uploading: "仍在上传，请稍候。",
    uploadsBusy: "上传过于频繁，请一分钟后再试。",
    uploadFailed: "上传失败，请重试。",
    chooseFile: "选择文件",
    chooseFiles: "选择文件",
    addAnother: "继续添加",
    remove: "移除 {name}",
    upTo: "最大 {n} MB",
    upToEach: "每个最大 {n} MB · 最多 {max} 个",
    optional: "选填",
    other: "其他",
    tellMore: "请说明",
    yes: "是",
    no: "否",
    agree: "我同意",
    choose: "请选择",
    hintKeys: "按回车键 ↵ 或向左拖动以继续",
    hintSwipe: "向左滑动以继续",
    offline: "当前离线，恢复联网后会自动保存您的回答。",
    send: "提交",
    sending: "正在提交",
    sendFailed: "提交失败，请检查网络后重试。",
    submitTitle: "全部完成了。",
    submitBody: "可以向右滑动检查回答，或现在提交。",
    outroTitle: "谢谢。",
    outroBody: "我们已收到您的回答。",
    nothing: "这里什么也没有。",
    useLink: "请使用发送给您的链接。",
    expired: "此链接可能已失效。请检查链接，或向我们索取新的链接。",
    loadFailed: "加载失败。",
    refresh: "请检查网络并刷新页面。",
    progress: "进度",
    darkMode: "深色模式",
    language: "语言",
  },
};

/**
 * @typedef {(key: string, vars?: Record<string, string | number>) => string} Words
 */

/**
 * @param {string} lang
 * @returns {Words} looks a phrase up in that language, filling its {names}
 */
export const words = (lang) => {
  const own = WORDS[lang] ?? WORDS.en;
  return (key, vars = {}) =>
    (own[key] ?? WORDS.en[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ""));
};
