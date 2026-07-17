import { rankLocators, sanitizeTarget, type BoundingBox, type ControlKey, type PointerPosition, type RedactionSampleEvent,
  type TargetDescriptor, type TraceEvent, type TraceEventType } from '@cutscene/trace';
import type { Result } from './messages';
import { shouldSamplePointer } from './pointer';
import { createTraceDeliveryQueue } from './trace-delivery';
import { hasSensitiveContext, nextStep } from './capture-state';

type PageContext = { viewport: ReturnType<typeof viewport>; scroll: ReturnType<typeof scroll>; route: string; url: string; origin: string;
  contentClockMs: number; visualRedactionSelectors: string[] };

let sessionEpoch: number | null = null;
let step = 0;
let scheduledScroll = false;
let scheduledResize = false;
let redactionFrame = 0;
let captureReady = false;
let lastPointerAt = -Infinity;
const deliverTrace = (event: TraceEvent) => chrome.runtime.sendMessage({ type: 'trace.event', event });
let traceDelivery = createTraceDeliveryQueue(deliverTrace);
let redactionSelectors: string[] = [];
let redactionIds = new WeakMap<Element, string>();
type RedactionState = { selector: string; instanceId: string; box: BoundingBox; viewport: ReturnType<typeof viewport> };
let previousRedactions = new Map<string, RedactionState>();

function now(): number { return performance.timeOrigin + performance.now() - (sessionEpoch ?? Date.now()); }
function route(): string { return `${location.pathname}${location.search}${location.hash}`; }
function viewport() { return { width: innerWidth, height: innerHeight, dpr: devicePixelRatio }; }
function scroll() { return { x: scrollX, y: scrollY }; }

function role(element: Element): string | null {
  const explicit = element.getAttribute('role');
  if (explicit) return explicit;
  if (element instanceof HTMLInputElement) {
    if (['button', 'submit', 'reset'].includes(element.type)) return 'button';
    if (element.type === 'checkbox') return 'checkbox';
    if (element.type === 'radio') return 'radio';
    return 'textbox';
  }
  return ({ A: 'link', BUTTON: 'button', SELECT: 'combobox', TEXTAREA: 'textbox' } as Record<string, string>)[element.tagName] ?? null;
}

function name(element: Element): string {
  const labelledBy = element.getAttribute('aria-labelledby');
  const labelled = labelledBy?.split(/\s+/).map((id) => document.getElementById(id)?.textContent?.trim() ?? '').filter(Boolean).join(' ');
  if (labelled) return labelled;
  if (element instanceof HTMLInputElement && element.labels?.length) return Array.from(element.labels).map((label) => label.textContent?.trim() ?? '').filter(Boolean).join(' ');
  return (element.getAttribute('aria-label') ?? element.getAttribute('alt') ?? element.getAttribute('title') ?? element.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
}

function cssPath(element: Element): string {
  const parts: string[] = [];
  for (let current: Element | null = element; current && parts.length < 4; current = current.parentElement) {
    const siblings = current.parentElement ? Array.from(current.parentElement.children).filter((child) => child.tagName === current?.tagName) : [];
    parts.unshift(`${current.tagName.toLowerCase()}${siblings.length > 1 ? `:nth-of-type(${siblings.indexOf(current) + 1})` : ''}`);
  }
  return parts.join(' > ');
}

function target(element: Element): TargetDescriptor | null {
  const box = element.getBoundingClientRect();
  if (!box.width || !box.height) return null;
  const accessibleName = name(element);
  const label = element instanceof HTMLInputElement && element.labels?.length ? name(element) : undefined;
  const testId = element.getAttribute('data-testid');
  const elementRole = role(element);
  const elementValue = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement ? element.value : undefined;
  const inputType = element instanceof HTMLInputElement ? element.type : undefined;
  const observation = {
    role: role(element), accessibleName, text: (element.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 200),
    tagName: element.tagName, boundingBox: { x: box.x, y: box.y, width: box.width, height: box.height },
    locators: rankLocators({ ...(testId ? { testId } : {}), ...(elementRole ? { role: elementRole } : {}),
      accessibleName, ...(label ? { label } : {}), ...(accessibleName ? { text: accessibleName } : {}), css: cssPath(element) }),
    ...(elementValue !== undefined ? { value: elementValue } : {}),
    ...(inputType !== undefined ? { inputType } : {}),
    sensitive: hasSensitiveContext(element),
    selector: cssPath(element),
  };
  return sanitizeTarget(observation);
}

function emit(type: Exclude<TraceEventType,
  'system.clockSync' | 'annotation.redaction' | 'annotation.callout' | 'annotation.comment'>,
  targetDescriptor?: TargetDescriptor,
  pointer?: PointerPosition,
  key?: ControlKey): void {
  if (sessionEpoch === null || !captureReady) return;
  const eventStep = nextStep(step, type);
  step = eventStep.current;
  const envelope = {
    v: 1 as const, id: `evt_${crypto.randomUUID()}`, t: now(), type,
    stepId: eventStep.id, route: route(), viewport: viewport(), scroll: scroll(),
  };
  let event: TraceEvent;
  if (type === 'interaction.hover') {
    if (!pointer) return;
    event = { ...envelope, type, pointer };
  } else if (type === 'interaction.click') {
    event = { ...envelope, type, ...(targetDescriptor ? { target: targetDescriptor } : {}), ...(pointer ? { pointer } : {}) };
  } else if (type === 'interaction.keypress') {
    if (!key) return;
    event = { ...envelope, type, key, ...(targetDescriptor ? { target: targetDescriptor } : {}) };
  } else {
    event = { ...envelope, type, ...(targetDescriptor ? { target: targetDescriptor } : {}) };
  }
  traceDelivery.send(event);
}

function emitRedaction(selector: string, instanceId: string, box?: BoundingBox, time = now()): void {
  if (sessionEpoch === null || !captureReady) return;
  const event: RedactionSampleEvent = { v: 1, id: `evt_${crypto.randomUUID()}`, t: time, type: 'annotation.redaction',
    stepId: nextStep(step, 'annotation.redaction').id, route: route(), viewport: viewport(), scroll: scroll(),
    selector, instanceId, visible: box !== undefined, ...(box ? { box } : {}) };
  traceDelivery.send(event);
}

function changed(left: BoundingBox, right: BoundingBox): boolean {
  return Math.abs(left.x - right.x) >= 0.5 || Math.abs(left.y - right.y) >= 0.5 ||
    Math.abs(left.width - right.width) >= 0.5 || Math.abs(left.height - right.height) >= 0.5;
}

function contextChanged(left: RedactionState, right: RedactionState): boolean {
  return changed(left.box, right.box) || left.viewport.width !== right.viewport.width ||
    left.viewport.height !== right.viewport.height || left.viewport.dpr !== right.viewport.dpr;
}

function sampleRedactions(anchorAtStart = false): void {
  if (sessionEpoch === null || !captureReady) return;
  const current = new Map<string, RedactionState>();
  const currentViewport = viewport();
  for (const selector of redactionSelectors) for (const element of Array.from(document.querySelectorAll(selector))) {
    const rect = element.getBoundingClientRect();
    if (!element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) || rect.width <= 0 || rect.height <= 0 ||
        rect.right <= 0 || rect.bottom <= 0 || rect.left >= currentViewport.width || rect.top >= currentViewport.height) continue;
    let instanceId = redactionIds.get(element);
    if (!instanceId) { instanceId = `redaction_${crypto.randomUUID()}`; redactionIds.set(element, instanceId); }
    const key = `${selector}\0${instanceId}`;
    const sample = { selector, instanceId, box: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      viewport: currentViewport };
    current.set(key, sample);
    const previous = previousRedactions.get(key);
    if (!previous || contextChanged(previous, sample)) emitRedaction(selector, instanceId, sample.box,
      anchorAtStart ? 0 : now());
  }
  for (const [key, previous] of previousRedactions) if (!current.has(key)) emitRedaction(previous.selector, previous.instanceId);
  previousRedactions = current;
  redactionFrame = requestAnimationFrame(() => sampleRedactions());
}

function actionable(value: EventTarget | null): Element | null {
  return value instanceof Element ? value.closest('button,a,input,select,textarea,[role],[data-testid]') ?? value : null;
}

function disableCapture(): void {
  captureReady = false; lastPointerAt = -Infinity; cancelAnimationFrame(redactionFrame); redactionSelectors = [];
  previousRedactions.clear();
}

document.addEventListener('click', (event) => { const element = actionable(event.target); if (element) { const safe = target(element);
  if (safe) emit('interaction.click', safe, { x: event.clientX, y: event.clientY }); } }, true);
document.addEventListener('input', (event) => { const element = actionable(event.target); if (element) { const safe = target(element); if (safe) emit('interaction.input', safe); } }, true);
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;
  const element = actionable(event.target);
  if (element) {
    const safe = target(element);
    if (safe) emit('interaction.keypress', safe, undefined, 'Enter');
  }
}, true);
addEventListener('pointermove', (event) => {
  if (event.pointerType !== 'mouse' || sessionEpoch === null || !captureReady) return;
  const sampledAt = now();
  if (!shouldSamplePointer(lastPointerAt, sampledAt)) return;
  lastPointerAt = sampledAt;
  emit('interaction.hover', undefined, { x: event.clientX, y: event.clientY });
}, true);
addEventListener('scroll', () => { if (sessionEpoch === null || scheduledScroll) return; scheduledScroll = true; requestAnimationFrame(() => { scheduledScroll = false; emit('interaction.scroll'); }); }, true);
addEventListener('resize', () => { if (sessionEpoch === null || scheduledResize) return; scheduledResize = true; requestAnimationFrame(() => { scheduledResize = false; emit('viewport.resize'); }); });
addEventListener('popstate', () => emit('navigation'));
addEventListener('hashchange', () => emit('navigation'));
const pushState = history.pushState;
history.pushState = function(data: unknown, unused: string, url?: string | URL | null): void {
  pushState.call(history, data, unused, url); emit('navigation');
};
const replaceState = history.replaceState;
history.replaceState = function(data: unknown, unused: string, url?: string | URL | null): void {
  replaceState.call(history, data, unused, url); emit('navigation');
};

chrome.runtime.onMessage.addListener((message: unknown, _sender, respond) => {
  if (!message || typeof message !== 'object' || !('type' in message)) return false;
  if (message.type === 'session.start' && 'sessionEpoch' in message && typeof message.sessionEpoch === 'number') {
    const selectors = [...new Set('redactSelectors' in message && Array.isArray(message.redactSelectors) &&
      message.redactSelectors.every((value) => typeof value === 'string') ? message.redactSelectors : [])];
    try { selectors.forEach((selector) => document.querySelectorAll(selector)); }
    catch (error: unknown) { respond({ ok: false, error: error instanceof Error ? error.message : String(error) } satisfies Result); return false; }
    sessionEpoch = message.sessionEpoch; step = 0; captureReady = false; lastPointerAt = -Infinity;
    traceDelivery = createTraceDeliveryQueue(deliverTrace);
    redactionSelectors = [...selectors]; redactionIds = new WeakMap(); previousRedactions = new Map();
    cancelAnimationFrame(redactionFrame);
    respond({ ok: true, value: { viewport: viewport(), scroll: scroll(), route: route(), url: location.href,
      origin: location.origin, contentClockMs: now(), visualRedactionSelectors: redactionSelectors } } satisfies Result<PageContext>);
  } else if (message.type === 'session.captureReady') {
    if (sessionEpoch === null) respond({ ok: false, error: 'Recording session is unavailable.' } satisfies Result);
    else { captureReady = true; previousRedactions.clear();
      const navigation = 'navigation' in message && message.navigation === true;
      if (navigation) emit('navigation');
      // The recorder is already running; anchor initial geometry at zero so its first frame cannot leak.
      sampleRedactions(!navigation);
      respond({ ok: true, value: undefined } satisfies Result); }
  } else if (message.type === 'session.quiesce') {
    disableCapture();
    void traceDelivery.drain().then(respond);
    return true;
  } else if (message.type === 'session.stop') { sessionEpoch = null; disableCapture();
    respond({ ok: true, value: undefined } satisfies Result); }
  else if (message.type === 'clock.sample') respond(sessionEpoch === null
    ? { ok: false, error: 'Recording session is unavailable.' } satisfies Result
    : { ok: true, value: now() } satisfies Result<number>);
  else return false;
  return false;
});

void chrome.runtime.sendMessage({ type: 'session.contentReady' }).catch(() => undefined);
