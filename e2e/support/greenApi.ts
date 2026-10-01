/**
 * Моки GREEN-API и сетевая страховка для e2e (Д-2, Р-25, НФТ-11).
 *
 * Фикстура `greenApi` включается автоматически в каждом тесте и перехватывает **все** запросы
 * контекста браузера:
 * - `localhost` / `127.0.0.1` (Vite dev-сервер) — пропускаются;
 * - `*.green-api.com` / `*.greenapi.com` с замоканным методом — ответ из фикстур `src/test/fixtures`;
 * - всё остальное (внешний хост, незамоканный метод GREEN-API, WebSocket наружу) — запрос
 *   обрывается и **тест падает** после завершения (`expect(violations).toEqual([])` в teardown).
 *
 * Реальный GREEN-API из e2e не вызывается никогда; токен — только условный `your-api-token`.
 *
 * CORS: `route.fulfill` в Chromium проверку CORS не проходит — страница прочитала бы и ответ
 * без `Access-Control-Allow-Origin`. Поэтому мок эмулирует браузер: ответ без ACAO на
 * кросс-доменный запрос превращается в сетевую ошибку (`TypeError` в `fetch`), как у реального
 * сервера (Р-27). Ответы фикстур несут ACAO `*`; без него — только `withoutCors(...)`.
 * Preflight (`OPTIONS` у POST с JSON и у DELETE) `page.route` не видит — Playwright отвечает на
 * него сам.
 */
import {
  test as base,
  expect,
  type BrowserContext,
  type Request,
  type Route,
} from '@playwright/test';
import { hasCors, isNetworkFailure, type MockReply } from '../../src/test/fixtures';

/** Методы GREEN-API, которые вызывает приложение (§5.2 ТЗ). */
export const GREEN_API_METHODS = [
  'getStateInstance',
  'getSettings',
  'checkAccount',
  'sendMessage',
  'receiveNotification',
  'deleteNotification',
] as const;

export type GreenApiMethod = (typeof GREEN_API_METHODS)[number];

/** Ответ с задержкой: long polling receive, медленный getSettings, гонки. */
export interface DelayedReply {
  reply: MockReply;
  delayMs: number;
}

export type MockStep = MockReply | DelayedReply;

export function delayed(reply: MockReply, delayMs: number): DelayedReply {
  return { reply, delayMs };
}

/** Перехваченный вызов GREEN-API. */
export interface GreenApiCall {
  method: string;
  httpMethod: string;
  idInstance: string;
  /** Последний сегмент пути после токена (`receiptId` у deleteNotification). */
  extra: string | undefined;
  url: URL;
  /** Тело запроса, разобранное как JSON (или строка, если не JSON). */
  body: unknown;
}

export type ViolationKind =
  'external-host' | 'unmocked-method' | 'not-green-api-path' | 'websocket';

export interface NetworkViolation {
  kind: ViolationKind;
  method: string;
  /** URL без сегмента токена (НФТ-3: токен не попадает в отчёты). */
  url: string;
}

const GREEN_API_HOST = /(^|\.)(green-api|greenapi)\.com$/i;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
/** `/waInstance{id}/{method}/{token}[/{extra}]`, допускается префикс `/v3` (EC-T8). */
const GREEN_API_PATH = /^(?:\/v3)?\/waInstance(\d+)\/([A-Za-z]+)\/([^/]+)(?:\/([^/]+))?\/?$/;

function isLocal(url: URL): boolean {
  return LOCAL_HOSTS.has(url.hostname);
}

function isCrossOrigin(request: Request, url: URL): boolean {
  const origin = request.headers().origin;
  return origin === undefined || origin !== url.origin;
}

function maskToken(url: URL): string {
  const masked = new URL(url.href);
  masked.pathname = masked.pathname.replace(/(\/waInstance\d+\/[A-Za-z]+\/)[^/]+/, '$1***');
  masked.search = '';
  return masked.href;
}

function parseBody(request: Request): unknown {
  const raw = request.postData();
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Реестр моков одного теста. Ответы задаются по методу: один ответ (повторяется),
 * последовательность (N-й ответ на N-й вызов, дальше повторяется последний) или функция.
 */
export class GreenApiMock {
  readonly calls: GreenApiCall[] = [];
  private readonly handlers = new Map<string, (call: GreenApiCall) => MockStep>();
  private readonly violations: NetworkViolation[] = [];

  /** Задать ответ(ы) метода. Последний вызов `on` для метода заменяет предыдущий. */
  on(
    method: GreenApiMethod,
    replies: MockStep | readonly MockStep[] | ((call: GreenApiCall) => MockStep),
  ): this {
    if (typeof replies === 'function') {
      this.handlers.set(method, replies);
      return this;
    }
    const steps: readonly MockStep[] = Array.isArray(replies) ? replies : [replies as MockStep];
    if (steps.length === 0) throw new Error(`greenApi.on(${method}): пустая последовательность`);
    let index = 0;
    this.handlers.set(method, () => {
      const step = steps[Math.min(index, steps.length - 1)];
      index += 1;
      if (step === undefined) throw new Error('unreachable');
      return step;
    });
    return this;
  }

  /** Вызовы конкретного метода (в порядке поступления). */
  callsTo(method: GreenApiMethod): GreenApiCall[] {
    return this.calls.filter((call) => call.method === method);
  }

  /**
   * Забрать зафиксированные нарушения. Нужен только тестам самой страховки:
   * незабранные нарушения валят тест в teardown.
   */
  takeViolations(): NetworkViolation[] {
    return this.violations.splice(0, this.violations.length);
  }

  /** @internal */
  pendingViolations(): readonly NetworkViolation[] {
    return this.violations;
  }

  /** @internal Обработчик всех HTTP-запросов контекста. */
  async handle(route: Route): Promise<void> {
    const request = route.request();
    const url = new URL(request.url());

    if (isLocal(url)) {
      await route.continue();
      return;
    }
    if (!GREEN_API_HOST.test(url.hostname)) {
      await this.reject(route, 'external-host', url);
      return;
    }
    const match = GREEN_API_PATH.exec(url.pathname);
    if (!match) {
      await this.reject(route, 'not-green-api-path', url);
      return;
    }
    const [, idInstance = '', method = '', , extra] = match;
    const call: GreenApiCall = {
      method,
      httpMethod: request.method(),
      idInstance,
      extra,
      url,
      body: parseBody(request),
    };
    const handler = this.handlers.get(method);
    if (!handler) {
      await this.reject(route, 'unmocked-method', url);
      return;
    }
    this.calls.push(call);
    let step = handler(call);
    if ('delayMs' in step) {
      await sleep(step.delayMs);
      step = step.reply;
    }
    if (isNetworkFailure(step)) {
      await route.abort(step.abort);
      return;
    }
    if (!hasCors(step) && isCrossOrigin(request, url)) {
      // Эмуляция CORS-блокировки браузера (см. шапку файла).
      await route.abort('failed');
      return;
    }
    await route.fulfill({ status: step.status, headers: step.headers, body: step.body });
  }

  /** @internal */
  recordWebSocket(url: URL): void {
    this.violations.push({ kind: 'websocket', method: 'WS', url: maskToken(url) });
  }

  private async reject(route: Route, kind: ViolationKind, url: URL): Promise<void> {
    this.violations.push({ kind, method: route.request().method(), url: maskToken(url) });
    await route.abort('blockedbyclient');
  }
}

async function installGuard(context: BrowserContext, mock: GreenApiMock): Promise<void> {
  await context.route('**/*', (route) => mock.handle(route));
  await context.routeWebSocket(
    (url) => !isLocal(url),
    (ws) => {
      mock.recordWebSocket(new URL(ws.url()));
      void ws.close({ code: 1008, reason: 'blocked by e2e network guard' });
    },
  );
}

export const test = base.extend<{ greenApi: GreenApiMock }>({
  greenApi: [
    async ({ context }, use) => {
      const mock = new GreenApiMock();
      await installGuard(context, mock);
      await use(mock);
      expect(
        mock.pendingViolations(),
        'Сетевая страховка e2e: запросы вне localhost и замоканных методов GREEN-API запрещены',
      ).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
