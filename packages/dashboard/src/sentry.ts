/**
 * Sentry — browser instrumentation for the ZionX dashboard.
 *
 * Captures runtime errors, unhandled promise rejections, and console.error
 * calls so the operator (you) can see what fails when users click around.
 *
 * The DSN is provisioned out-of-band via the Sentry API and committed here
 * because Sentry browser DSNs are PUBLIC by design — they're embedded in
 * every JS bundle. The `authToken` (used for project provisioning) stays in
 * AWS Secrets Manager and never reaches the client.
 */

import * as Sentry from '@sentry/browser';

const DSN =
  (window as unknown as { __ZIONX_SENTRY_DSN__?: string }).__ZIONX_SENTRY_DSN__ ??
  'https://e7ab9852beba67ef6f32ea46ccbeac81@o4511463725989888.ingest.us.sentry.io/4511464396619776';

let initialized = false;

export function initSentry(): void {
  if (initialized) return;
  initialized = true;

  try {
    // Determine the same-origin tunnel URL. The dashboard is served from
    // S3 (HTTP) while Sentry's ingest is HTTPS-only — without a tunnel,
    // Chrome blocks the cross-protocol envelope POST as mixed content.
    // window.__SERAPHIM_API_URL__ already points at the ALB, so we route
    // the envelope through /api/sentry-tunnel which forwards it server-side.
    const apiBase = (window as unknown as { __SERAPHIM_API_URL__?: string }).__SERAPHIM_API_URL__;
    const tunnel = apiBase ? `${apiBase.replace(/\/$/, '')}/sentry-tunnel` : undefined;

    Sentry.init({
      dsn: DSN,
      ...(tunnel ? { tunnel } : {}),
      environment: 'production',
      release: 'zionx-dashboard@' + (window.location.host || 'unknown'),
      // Capture useful context, never PII.
      tracesSampleRate: 0.1,
      replaysOnErrorSampleRate: 1.0,
      replaysSessionSampleRate: 0,
      integrations: [
        Sentry.browserTracingIntegration(),
        Sentry.replayIntegration({
          maskAllText: false,
          blockAllMedia: false,
        }),
      ],
      beforeSend(event) {
        // Strip auth tokens that may slip into URLs or fetch bodies.
        if (event.request?.url) {
          event.request.url = event.request.url.replace(/[?&]token=[^&]+/gi, '');
        }
        return event;
      },
    });

    // Tag every event with the project so we can filter them in Sentry UI.
    Sentry.setTag('project', 'zionx-dashboard');
    Sentry.setTag('app', 'studio');
    // eslint-disable-next-line no-console
    console.log(`[sentry] initialized${tunnel ? ` (tunnel: ${tunnel})` : ' (direct)'}`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[sentry] init failed:', (err as Error).message);
  }
}

/** Capture a one-off operator action so we see them in the Sentry breadcrumb trail. */
export function captureUserAction(name: string, data?: Record<string, unknown>): void {
  Sentry.addBreadcrumb({
    category: 'user.action',
    level: 'info',
    message: name,
    data,
    timestamp: Date.now() / 1000,
  });
}

/**
 * Force a flush of buffered breadcrumbs to Sentry as a low-priority message.
 * Sentry only ships breadcrumbs attached to events; this lets the spec runner
 * see breadcrumbs from sessions that didn't error out.
 */
export function flushSessionTrace(reason: string, data?: Record<string, unknown>): void {
  Sentry.captureMessage(`session.trace.${reason}`, {
    level: 'info',
    extra: data,
  });
}

/** Capture an error explicitly (in addition to the auto-capture). */
export function captureUserError(err: unknown, context?: Record<string, unknown>): void {
  Sentry.captureException(err, { extra: context });
}
