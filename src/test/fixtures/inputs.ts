/**
 * Пользовательский ввод для форм (ОР-1 п. 1.2, ОР-2 п. 2.2–2.3; Р-1, Р-10; ВА-2).
 * Ожидаемые значения — по ТЗ v1.3.
 */
import { API_URL, ID_INSTANCE } from './constants';

/** Поле idInstance: только цифры после обрезки пробелов, длина не проверяется (ВА-2). */
export const idInstanceInputs = {
  valid: { input: ID_INSTANCE, valid: true },
  withSpaces: { input: `  ${ID_INSTANCE} `, valid: true },
  /** 10 разрядов, как в документации. */
  tenDigits: { input: '1101000000', valid: true },
  empty: { input: '', valid: false },
  onlySpaces: { input: '   ', valid: false },
  letters: { input: 'abc', valid: false },
  innerSpace: { input: '1101 000000', valid: false },
  negative: { input: '-1', valid: false },
  decimal: { input: '1.5', valid: false },
  fullWidthDigits: { input: '１１０１', valid: false },
} as const;

/**
 * Поле apiUrl (Р-1, ВА-2): пусто → значение по умолчанию; хвостовые `/` убираются;
 * должен разбираться `new URL()` с протоколом `https:`. `http://` — ошибка «Введите адрес
 * вида https://3100.api.green-api.com» (токен передаётся в URL).
 * `expected: null` — ошибка у поля, запроса нет.
 */
export const apiUrlInputs = {
  empty: { input: '', expected: 'https://api.green-api.com' },
  onlySpaces: { input: '   ', expected: 'https://api.green-api.com' },
  valid: { input: API_URL, expected: API_URL },
  trailingSlashes: { input: `  ${API_URL}///  `, expected: API_URL },
  http: { input: 'http://1101.api.green-api.com', expected: null },
  httpTrailingSlash: { input: 'http://api.green-api.com/', expected: null },
  noProtocol: { input: '1101.api.green-api.com', expected: null },
  notUrl: { input: 'not a url', expected: null },
  ftp: { input: 'ftp://1101.api.green-api.com', expected: null },
  javascript: { input: 'javascript:alert(1)', expected: null },
  /** Хост, который не резолвится (L-10, ошибка сети при входе). */
  unreachable: { input: 'https://invalid.example.test', expected: 'https://invalid.example.test' },
} as const;

/** Номер телефона (Р-10). `expected: null` — ошибка формата, checkAccount не вызывается. */
export const phoneInputs = {
  plusSevenFormatted: { input: '+7 (999) 000-00-01', expected: '79990000001' },
  eightPrefix: { input: '8 999 000 00 01', expected: '79990000001' },
  digitsOnly: { input: '79990000001', expected: '79990000001' },
  belarusFormatted: { input: '+375 (29) 000-00-01', expected: '375290000001' },
  belarusDigits: { input: '375290000001', expected: '375290000001' },
  empty: { input: '', expected: null },
  tooShort: { input: '12345', expected: null },
  usNumber: { input: '+1 202 000 0001', expected: null },
  tenDigits: { input: '7999000000', expected: null },
  twelveWithSeven: { input: '799900000012', expected: null },
  elevenWith375: { input: '37529000000', expected: null },
  twelveWithEight: { input: '8 999 000 00 012', expected: null },
  letters: { input: 'abc', expected: null },
} as const;

/** Заголовок чата по номеру (Р-15, ВА-21). */
export const chatTitleCases = {
  russia: { phone: '79990000001', title: '+7 999 000-00-01' },
  belarus: { phone: '375290000001', title: '+375 29 000-00-01' },
} as const;

/** Тексты для ленты и поля ввода (ОР-3 п. 3.5, Р-16, ВА-14). */
export const messageTexts = {
  plain: 'Тестовое сообщение',
  multiline: 'Строка 1\nСтрока 2\n\nСтрока 4',
  onlySpaces: '   ',
  onlyNewlines: '\n\n',
  /** Р-16: показывается как текст, без HTML и без alert. */
  html: '<b>x</b><img src=x onerror=alert(1)>',
  /** Р-16: символы форматирования MAX — как есть. */
  maxFormatting: '*жирный* _курсив_',
  /** Р-16: ссылка не кликабельна. */
  link: 'https://example.test/page',
  /** Ровно 4000 единиц UTF-16 — можно отправить. */
  max4000: 'а'.repeat(4000),
  /** 4001 — кнопка неактивна. */
  over4000: 'а'.repeat(4001),
  /** ВА-14: emoji = 2 единицы UTF-16; 2000 emoji = 4000 — можно. */
  emoji4000: '😀'.repeat(2000),
  /** 2000 emoji + 1 символ = 4001 — нельзя. */
  emoji4001: `${'😀'.repeat(2000)}а`,
  /** Пробелы по краям не обрезаются при отправке (ВА-14). */
  surroundingSpaces: '  текст  ',
} as const;
