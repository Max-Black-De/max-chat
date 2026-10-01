import { useId, useState, type FormEvent } from 'react';
import {
  SESSION_TEXTS,
  apiUrlHostWarning,
  validateLoginForm,
  type LoginFormErrors,
  type LoginFormInput,
} from '../../store';
import { UI_TEXTS } from '../texts';
import { useSession } from '../session/sessionContext';

/**
 * Экран входа (§4.0 п. 1, §4.1 п. 1.1–1.6). Поля предзаполняются из состояния сессии
 * (`prefill`): после ошибки восстановления — из sessionStorage, после 401/выхода — без токена.
 */
export function LoginScreen({ defaultApiUrl }: { defaultApiUrl: string }) {
  const { state, controller } = useSession();
  const busy = state.status === 'checking' || state.status === 'restoring';
  const [values, setValues] = useState<LoginFormInput>(() => ({
    idInstance: state.prefill.idInstance,
    apiTokenInstance: state.prefill.apiTokenInstance,
    apiUrl: state.prefill.apiUrl || defaultApiUrl,
  }));
  const [errors, setErrors] = useState<LoginFormErrors>({});
  const [showToken, setShowToken] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(
    () => (state.prefill.apiUrl || defaultApiUrl) !== defaultApiUrl,
  );
  const ids = { id: useId(), token: useId(), url: useId() };
  const hostWarning = apiUrlHostWarning(values.apiUrl);

  const update = (field: keyof LoginFormInput) => (e: { target: { value: string } }) => {
    setValues((v) => ({ ...v, [field]: e.target.value }));
    setErrors((er) =>
      er[field] ? Object.fromEntries(Object.entries(er).filter(([k]) => k !== field)) : er,
    );
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const result = validateLoginForm(values);
    if (!result.ok) {
      setErrors(result.errors);
      if (result.errors.apiUrl) setAdvancedOpen(true);
      return;
    }
    setErrors({});
    void controller.login(result.credentials);
  };

  const fieldError = (field: keyof LoginFormInput, id: string) =>
    errors[field] ? (
      <p className="field__error" id={id} data-testid={`login-${field}-error`} role="alert">
        {errors[field]}
      </p>
    ) : null;

  return (
    <main className="login">
      <form className="login__card" onSubmit={onSubmit} noValidate data-testid="login-form">
        <h1 className="login__title">{UI_TEXTS.loginTitle}</h1>
        <p className="login__subtitle">{UI_TEXTS.loginSubtitle}</p>

        {state.loginError ? (
          <p className="login__error" role="alert" data-testid="login-error">
            {state.loginError}
          </p>
        ) : null}

        <div className="field">
          <label htmlFor={ids.id}>{UI_TEXTS.idInstanceLabel}</label>
          <input
            id={ids.id}
            name="idInstance"
            inputMode="numeric"
            autoComplete="username"
            value={values.idInstance}
            onChange={update('idInstance')}
            aria-invalid={errors.idInstance ? true : undefined}
            aria-describedby={errors.idInstance ? `${ids.id}-e` : undefined}
            disabled={busy}
            data-testid="login-idInstance"
          />
          {fieldError('idInstance', `${ids.id}-e`)}
        </div>

        <div className="field">
          <label htmlFor={ids.token}>{UI_TEXTS.tokenLabel}</label>
          <div className="field__row">
            <input
              id={ids.token}
              name="apiTokenInstance"
              type={showToken ? 'text' : 'password'}
              autoComplete="current-password"
              spellCheck={false}
              value={values.apiTokenInstance}
              onChange={update('apiTokenInstance')}
              aria-invalid={errors.apiTokenInstance ? true : undefined}
              aria-describedby={errors.apiTokenInstance ? `${ids.token}-e` : undefined}
              disabled={busy}
              data-testid="login-apiTokenInstance"
            />
            <button
              type="button"
              className="button button--ghost"
              onClick={() => {
                setShowToken((s) => !s);
              }}
              aria-controls={ids.token}
              aria-label={showToken ? UI_TEXTS.hideTokenLabel : UI_TEXTS.showTokenLabel}
              data-testid="login-token-toggle"
            >
              {showToken ? UI_TEXTS.hideToken : UI_TEXTS.showToken}
            </button>
          </div>
          {fieldError('apiTokenInstance', `${ids.token}-e`)}
        </div>

        <details
          className="login__advanced"
          open={advancedOpen}
          onToggle={(e) => {
            setAdvancedOpen(e.currentTarget.open);
          }}
          data-testid="login-advanced"
        >
          <summary data-testid="login-advanced-toggle">{UI_TEXTS.advanced}</summary>
          <div className="field">
            <label htmlFor={ids.url}>{UI_TEXTS.apiUrlLabel}</label>
            <input
              id={ids.url}
              name="apiUrl"
              type="url"
              inputMode="url"
              spellCheck={false}
              value={values.apiUrl}
              onChange={update('apiUrl')}
              aria-invalid={errors.apiUrl ? true : undefined}
              aria-describedby={`${ids.url}-hint`}
              disabled={busy}
              data-testid="login-apiUrl"
            />
            <p className="field__hint" id={`${ids.url}-hint`}>
              {SESSION_TEXTS.apiUrlHint}
            </p>
            {fieldError('apiUrl', `${ids.url}-e`)}
            {!errors.apiUrl && hostWarning ? (
              <p className="field__warning" data-testid="login-apiUrl-warning">
                {hostWarning}
              </p>
            ) : null}
          </div>
        </details>

        <button
          type="submit"
          className="button button--primary login__submit"
          disabled={busy}
          aria-busy={busy}
          data-testid="login-submit"
        >
          {busy ? (
            <>
              <span className="spinner" aria-hidden="true" data-testid="login-spinner" />
              {state.status === 'restoring' ? UI_TEXTS.restoring : UI_TEXTS.submitting}
            </>
          ) : (
            UI_TEXTS.submit
          )}
        </button>

        <a
          className="login__link"
          href={UI_TEXTS.cabinetUrl}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="login-cabinet-link"
        >
          {UI_TEXTS.cabinetLink}
        </a>
      </form>
    </main>
  );
}
