import type { ClickEvent, Result } from './messages';

let sessionEpoch: number | null = null;

function contentClockMs(): number {
  return performance.timeOrigin + performance.now() - (sessionEpoch ?? Date.now());
}

function nativeRole(element: Element): string | null {
  const explicit = element.getAttribute('role');
  if (explicit) return explicit;

  const roles: Readonly<Record<string, string>> = {
    A: 'link',
    BUTTON: 'button',
    SELECT: 'combobox',
    TEXTAREA: 'textbox',
  };
  if (element instanceof HTMLInputElement) {
    if (['button', 'submit', 'reset'].includes(element.type)) return 'button';
    if (element.type === 'checkbox') return 'checkbox';
    if (element.type === 'radio') return 'radio';
    return 'textbox';
  }
  return roles[element.tagName] ?? null;
}

function accessibleName(element: Element): string {
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel.trim();

  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy) {
    const label = labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
      .filter(Boolean)
      .join(' ');
    if (label) return label;
  }

  if (element instanceof HTMLInputElement && element.labels?.length) {
    return Array.from(element.labels)
      .map((label) => label.textContent?.trim() ?? '')
      .filter(Boolean)
      .join(' ');
  }

  return (
    element.getAttribute('alt') ??
    element.getAttribute('title') ??
    element.textContent ??
    ''
  )
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

function actionableTarget(target: EventTarget | null): Element | null {
  if (!(target instanceof Element)) return null;
  return target.closest('button,a,input,select,textarea,[role],[data-testid]') ?? target;
}

document.addEventListener(
  'click',
  (event) => {
    if (sessionEpoch === null) return;
    const target = actionableTarget(event.target);
    if (!target) return;
    const box = target.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return;

    const traceEvent: ClickEvent = {
      v: 1,
      id: `evt_${crypto.randomUUID()}`,
      t: contentClockMs(),
      type: 'interaction.click',
      route: `${location.pathname}${location.search}${location.hash}`,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        dpr: window.devicePixelRatio,
      },
      scroll: { x: window.scrollX, y: window.scrollY },
      target: {
        role: nativeRole(target),
        accessibleName: accessibleName(target),
        testId: target.getAttribute('data-testid'),
        tagName: target.tagName,
        boundingBox: {
          x: box.x,
          y: box.y,
          width: box.width,
          height: box.height,
        },
      },
    };
    void chrome.runtime.sendMessage({ type: 'trace.event', event: traceEvent });
  },
  true,
);

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!message || typeof message !== 'object' || !('type' in message)) return false;

  if (message.type === 'session.start' && 'sessionEpoch' in message) {
    if (typeof message.sessionEpoch !== 'number') {
      sendResponse({ ok: false, error: 'Invalid session epoch.' } satisfies Result);
      return false;
    }
    sessionEpoch = message.sessionEpoch;
    sendResponse({
      ok: true,
      value: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
    } satisfies Result<{ width: number; height: number; dpr: number }>);
    return false;
  }

  if (message.type === 'session.stop') {
    sessionEpoch = null;
    sendResponse({ ok: true, value: undefined } satisfies Result);
    return false;
  }

  if (message.type === 'clock.sample') {
    sendResponse({ ok: true, value: contentClockMs() } satisfies Result<number>);
    return false;
  }

  return false;
});
