import { rankLocators, sanitizeTarget, type BoundingBox, type RedactionSampleEvent, type TargetDescriptor, type TraceEvent,
  type TraceEventType } from '@cutscene/trace';
import type { Result } from './messages';

type PageContext = { viewport: ReturnType<typeof viewport>; scroll: ReturnType<typeof scroll>; route: string; url: string; origin: string;
  contentClockMs: number; visualRedactionSelectors: string[] };

let sessionEpoch: number | null = null;
let step = 0;
let scheduledScroll = false;
let scheduledResize = false;
let redactionFrame = 0;
let redactionSelectors: string[] = [];
let redactionIds = new WeakMap<Element, string>();
let previousRedactions = new Map<string, { selector: string; instanceId: string; box: BoundingBox }>();

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
    sensitive: element.matches('[data-sensitive], [data-private]'),
    selector: cssPath(element),
  };
  return sanitizeTarget(observation);
}

function emit(type: Exclude<TraceEventType, 'system.clockSync' | 'annotation.redaction'>, targetDescriptor?: TargetDescriptor): void {
  if (sessionEpoch === null) return;
  const event: TraceEvent = {
    v: 1, id: `evt_${crypto.randomUUID()}`, t: now(), type,
    stepId: `step_${String(++step).padStart(4, '0')}`, route: route(), viewport: viewport(), scroll: scroll(),
    ...(targetDescriptor ? { target: targetDescriptor } : {}),
  };
  void chrome.runtime.sendMessage({ type: 'trace.event', event });
}

function emitRedaction(selector: string, instanceId: string, box?: BoundingBox): void {
  if (sessionEpoch === null) return;
  const event: RedactionSampleEvent = { v: 1, id: `evt_${crypto.randomUUID()}`, t: now(), type: 'annotation.redaction',
    stepId: `step_${String(++step).padStart(4, '0')}`, route: route(), viewport: viewport(), scroll: scroll(),
    selector, instanceId, visible: box !== undefined, ...(box ? { box } : {}) };
  void chrome.runtime.sendMessage({ type: 'trace.event', event });
}

function changed(left: BoundingBox, right: BoundingBox): boolean {
  return Math.abs(left.x - right.x) >= 0.5 || Math.abs(left.y - right.y) >= 0.5 ||
    Math.abs(left.width - right.width) >= 0.5 || Math.abs(left.height - right.height) >= 0.5;
}

function sampleRedactions(): void {
  if (sessionEpoch === null) return;
  const current = new Map<string, { selector: string; instanceId: string; box: BoundingBox }>();
  for (const selector of redactionSelectors) for (const element of Array.from(document.querySelectorAll(selector))) {
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    let instanceId = redactionIds.get(element);
    if (!instanceId) { instanceId = `redaction_${crypto.randomUUID()}`; redactionIds.set(element, instanceId); }
    const key = `${selector}\0${instanceId}`;
    const sample = { selector, instanceId, box: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } };
    current.set(key, sample);
    const previous = previousRedactions.get(key);
    if (!previous || changed(previous.box, sample.box)) emitRedaction(selector, instanceId, sample.box);
  }
  for (const [key, previous] of previousRedactions) if (!current.has(key)) emitRedaction(previous.selector, previous.instanceId);
  previousRedactions = current;
  redactionFrame = requestAnimationFrame(sampleRedactions);
}

function actionable(value: EventTarget | null): Element | null {
  return value instanceof Element ? value.closest('button,a,input,select,textarea,[role],[data-testid]') ?? value : null;
}

document.addEventListener('click', (event) => { const element = actionable(event.target); if (element) { const safe = target(element); if (safe) emit('interaction.click', safe); } }, true);
document.addEventListener('input', (event) => { const element = actionable(event.target); if (element) { const safe = target(element); if (safe) emit('interaction.input', safe); } }, true);
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
    sessionEpoch = message.sessionEpoch; step = 0;
    redactionSelectors = [...selectors]; redactionIds = new WeakMap(); previousRedactions = new Map();
    cancelAnimationFrame(redactionFrame); redactionFrame = requestAnimationFrame(sampleRedactions);
    respond({ ok: true, value: { viewport: viewport(), scroll: scroll(), route: route(), url: location.href,
      origin: location.origin, contentClockMs: now(), visualRedactionSelectors: redactionSelectors } } satisfies Result<PageContext>);
  } else if (message.type === 'session.stop') { sessionEpoch = null; cancelAnimationFrame(redactionFrame); redactionSelectors = [];
    previousRedactions.clear(); respond({ ok: true, value: undefined } satisfies Result); }
  else if (message.type === 'clock.sample') respond({ ok: true, value: now() } satisfies Result<number>);
  else return false;
  return false;
});
