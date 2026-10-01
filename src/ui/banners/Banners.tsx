import { BANNER_TEXTS, INSTANCE_TEXTS, QUOTA_TEXTS, SETTINGS_TEXTS } from '../../api';
import {
  SESSION_TEXTS,
  selectShowOfflineBanner,
  selectShowSuspendedBanner,
  selectVisibleWarnings,
  type SettingsWarning,
} from '../../store';
import { UI_TEXTS } from '../texts';
import { useSession } from '../session/sessionContext';

const WARNING_TEXT: Record<SettingsWarning, string> = {
  P2: SETTINGS_TEXTS.incomingWebhookOff,
  P3: SETTINGS_TEXTS.outgoingApiMessageWebhookOff,
  P4: SETTINGS_TEXTS.outgoingMessageWebhookOff,
};

type Tone = 'error' | 'warning' | 'info';

function Banner({
  testId,
  tone,
  text,
  onClose,
  children,
}: {
  testId: string;
  tone: Tone;
  text: string;
  onClose?: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={`banner banner--${tone}`}
      role={tone === 'error' ? 'alert' : 'status'}
      data-testid={testId}
    >
      <p className="banner__text">{text}</p>
      {children}
      {onClose ? (
        <button
          type="button"
          className="banner__close"
          aria-label={UI_TEXTS.closeBanner}
          title={UI_TEXTS.closeBanner}
          onClick={onClose}
          data-testid={`${testId}-close`}
        >
          ×
        </button>
      ) : null}
    </div>
  );
}

/**
 * Баннеры основного экрана (§4.0 п. 4) стопкой над лентой. Порядок — от блокирующих к
 * информационным:
 * 1. ошибки: П-1 (webhookUrl), «Нет соединения», «Инстанс не авторизован…»;
 * 2. предупреждения: квота (§5.5), suspended, П-2…П-4 (закрываемые), сбой хранилища (Р-2),
 *    нет Web Locks (Р-12);
 * 3. информация: «Чат открыт в другой вкладке» (Р-12).
 * П-5 появляется только с Д-4 (статусы доставки), в MVP его нет.
 */
export function Banners() {
  const { state, controller } = useSession();
  const { settings } = state;
  const warnings = selectVisibleWarnings(state);

  return (
    <div className="banners" data-testid="banners">
      {settings.webhookUrlSet ? (
        <Banner testId="banner-p1" tone="error" text={SETTINGS_TEXTS.webhookUrlSet}>
          <button
            type="button"
            className="button button--small"
            disabled={settings.recheckBusy}
            onClick={() => {
              void controller.recheckSettings();
            }}
            data-testid="banner-p1-recheck"
          >
            {UI_TEXTS.recheck}
          </button>
        </Banner>
      ) : null}
      {selectShowOfflineBanner(state) ? (
        <Banner testId="banner-offline" tone="error" text={BANNER_TEXTS.offline} />
      ) : null}
      {state.instanceNotReady ? (
        <Banner testId="banner-not-ready" tone="error" text={BANNER_TEXTS.instanceNotReady} />
      ) : null}
      {state.quota.visible ? (
        <Banner
          testId="banner-quota"
          tone="warning"
          text={QUOTA_TEXTS.banner}
          onClose={() => {
            controller.dismissQuotaBanner();
          }}
        />
      ) : null}
      {selectShowSuspendedBanner(state) ? (
        <Banner testId="banner-suspended" tone="warning" text={INSTANCE_TEXTS.suspended} />
      ) : null}
      {warnings.map((w) => (
        <Banner
          key={w}
          testId={`banner-${w.toLowerCase()}`}
          tone="warning"
          text={WARNING_TEXT[w]}
          onClose={() => {
            controller.dismissWarning(w);
          }}
        />
      ))}
      {state.storageFailed ? (
        <Banner testId="banner-storage" tone="warning" text={SESSION_TEXTS.storageFailed} />
      ) : null}
      {state.locksUnsupported ? (
        <Banner
          testId="banner-locks-unsupported"
          tone="warning"
          text={SESSION_TEXTS.locksUnsupported}
        />
      ) : null}
      {state.readOnly ? (
        <Banner testId="banner-other-tab" tone="info" text={BANNER_TEXTS.otherTab} />
      ) : null}
    </div>
  );
}
