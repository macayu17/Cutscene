import type {
  ActionResult,
  DriftStep,
  Locator,
  RedactionSampleEvent,
  ReplayAction,
  ReplayPlan,
  ScrollPosition,
  TraceEvent,
  Viewport,
} from '@cutscene/trace';
import type { Locator as PlaywrightLocator, Page } from '@playwright/test';
import { freshActionEvent, type LiveTarget } from './capture.ts';

function candidate(page: Page, locator: Locator): PlaywrightLocator {
  switch (locator.type) {
    case 'testId':
      return page.getByTestId(locator.value);
    case 'role':
      return page.getByRole(locator.role as Parameters<Page['getByRole']>[0], {
        name: locator.name,
        exact: true,
      });
    case 'label':
      return page.getByLabel(locator.value, { exact: true });
    case 'text':
      return page.getByText(locator.value, { exact: true });
    case 'css':
      return page.locator(locator.value);
  }
}

type ResolvedAction = {
  result: ActionResult;
  match: PlaywrightLocator | null;
  locatorIndex: number | null;
};

async function resolveAction(page: Page, action: ReplayAction): Promise<ResolvedAction> {
  if (action.target === null) {
    return {
      result: {
        eventId: action.eventId,
        kind: action.kind,
        status: 'orphaned',
        locatorType: null,
        locatorIndex: null,
        reason: 'no target captured',
      },
      match: null,
      locatorIndex: null,
    };
  }

  for (const [index, locator] of action.target.locators.entries()) {
    let match: PlaywrightLocator;
    try {
      match = candidate(page, locator).filter({ visible: true });
      if (await match.count() !== 1) {
        continue;
      }
    } catch {
      continue;
    }

    return {
      result: {
        eventId: action.eventId,
        kind: action.kind,
        status: index === 0 ? 'matched' : 'drifted',
        locatorType: locator.type,
        locatorIndex: index,
        reason: null,
      },
      match,
      locatorIndex: index,
    };
  }

  return {
    result: {
      eventId: action.eventId,
      kind: action.kind,
      status: 'orphaned',
      locatorType: null,
      locatorIndex: null,
      reason: 'no locator resolved',
    },
    match: null,
    locatorIndex: null,
  };
}

async function execute(match: PlaywrightLocator, action: ReplayAction,
  resolved: ActionResult): Promise<ActionResult> {
  try {
    if (action.kind === 'click') {
      await match.click();
    } else if (action.kind === 'fill') {
      await match.fill(action.value);
    } else {
      await match.press(action.key);
    }
    return resolved;
  } catch (cause: unknown) {
    return {
      ...resolved,
      status: 'orphaned',
      reason: cause instanceof Error ? cause.message : String(cause),
    };
  }
}

function route(page: Page): string {
  const url = new URL(page.url());
  return url.protocol === 'http:' || url.protocol === 'https:'
    ? `${url.pathname}${url.search}${url.hash}`
    : `${url.pathname}${url.search}${url.hash}` || page.url();
}

async function observe(match: PlaywrightLocator): Promise<LiveTarget | null> {
  const boundingBox = await match.boundingBox();
  if (boundingBox === null || boundingBox.width <= 0 || boundingBox.height <= 0) return null;
  const identity = await match.evaluate((node) => {
    const element = node as unknown as {
      tagName: string;
      textContent: string | null;
      getAttribute(name: string): string | null;
      labels?: ArrayLike<{ textContent: string | null }>;
    };
    const label = element.labels?.[0]?.textContent?.trim() ?? '';
    const text = element.textContent?.trim() ?? '';
    return {
      tagName: element.tagName,
      accessibleName: element.getAttribute('aria-label')?.trim() || label || text,
      text,
    };
  });
  return { ...identity, boundingBox };
}

function sourceContext(event: TraceEvent): { viewport: Viewport; scroll: ScrollPosition } {
  return { viewport: event.viewport, scroll: event.scroll };
}

async function pageContext(page: Page, fallbackDpr: number): Promise<{
  viewport: Viewport;
  scroll: ScrollPosition;
}> {
  const size = page.viewportSize();
  const sample = await page.evaluate(() => {
    const browser = globalThis as unknown as { devicePixelRatio: number; scrollX: number; scrollY: number };
    return { dpr: browser.devicePixelRatio, x: browser.scrollX, y: browser.scrollY };
  });
  return {
    viewport: { width: size?.width ?? 1, height: size?.height ?? 1, dpr: sample.dpr || fallbackDpr },
    scroll: { x: sample.x, y: sample.y },
  };
}

async function applyContext(page: Page, viewport: Viewport, scroll: ScrollPosition): Promise<{
  viewport: Viewport;
  scroll: ScrollPosition;
  resized: boolean;
  scrolled: boolean;
}> {
  const before = await pageContext(page, viewport.dpr);
  if (before.viewport.width !== viewport.width || before.viewport.height !== viewport.height) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
  }
  await page.evaluate(({ x, y }) => {
    (globalThis as unknown as { scrollTo(left: number, top: number): void }).scrollTo(x, y);
  }, scroll);
  const current = await pageContext(page, viewport.dpr);
  return {
    ...current,
    resized: before.viewport.width !== current.viewport.width || before.viewport.height !== current.viewport.height,
    scrolled: before.scroll.x !== current.scroll.x || before.scroll.y !== current.scroll.y,
  };
}

type RedactionState = {
  selectors: readonly string[];
  maximumCounts: Map<string, number>;
  sequence: number;
};

async function sampleRedactions(page: Page, state: RedactionState, envelope: {
  t: number;
  stepId: string;
  route: string;
  viewport: Viewport;
  scroll: ScrollPosition;
}): Promise<RedactionSampleEvent[]> {
  const samples: RedactionSampleEvent[] = [];
  for (const selector of state.selectors) {
    let count = 0;
    try {
      count = await page.locator(selector).count();
    } catch {
      continue;
    }
    const sampleCount = Math.max(count, state.maximumCounts.get(selector) ?? 0);
    state.maximumCounts.set(selector, sampleCount);
    for (let index = 0; index < sampleCount; index += 1) {
      const match = page.locator(selector).nth(index);
      const visible = index < count && await match.isVisible().catch(() => false);
      const box = visible ? await match.boundingBox() : null;
      state.sequence += 1;
      samples.push({
        v: 1,
        id: `fresh:redaction:${state.sequence}`,
        t: envelope.t,
        type: 'annotation.redaction',
        stepId: envelope.stepId,
        route: envelope.route,
        viewport: envelope.viewport,
        scroll: envelope.scroll,
        selector,
        instanceId: `${selector}:${index}`,
        visible: box !== null,
        ...(box === null ? {} : { box }),
      });
    }
  }
  return samples;
}

export type ReplayRun = {
  steps: readonly DriftStep[];
  abortedAfterStepId: string | null;
  events: readonly TraceEvent[];
};

export type ReplayRecording = {
  reference: readonly TraceEvent[];
  startedAt: number;
};

export async function replay(page: Page, plan: ReplayPlan,
  recording?: ReplayRecording): Promise<ReplayRun> {
  const steps: DriftStep[] = [];
  const events: TraceEvent[] = [];
  const sourceById = new Map(recording?.reference.map((event) => [event.id, event]));
  const actionTimes = plan.steps.flatMap((step) => step.actions)
    .map((action) => sourceById.get(action.eventId)?.t)
    .filter((t): t is number => t !== undefined);
  const firstActionTime = actionTimes.length === 0 ? 0 : Math.min(...actionTimes);
  const redactions: RedactionState = {
    selectors: [...new Set(recording?.reference
      .filter((event): event is RedactionSampleEvent => event.type === 'annotation.redaction')
      .map((event) => event.selector) ?? [])],
    maximumCounts: new Map(),
    sequence: 0,
  };
  for (const step of plan.steps) {
    const actions: ActionResult[] = [];
    for (const action of step.actions) {
      const source = sourceById.get(action.eventId);
      let liveContext = source === undefined ? null : sourceContext(source);
      let contextChanges = { resized: false, scrolled: false };
      if (recording !== undefined && source !== undefined) {
        const targetTime = source.t - firstActionTime;
        const remaining = targetTime - (performance.now() - recording.startedAt);
        if (remaining > 0) await page.waitForTimeout(remaining);
        const applied = await applyContext(page, source.viewport, source.scroll);
        liveContext = { viewport: applied.viewport, scroll: applied.scroll };
        contextChanges = applied;
      }
      const resolved = await resolveAction(page, action);
      if (recording !== undefined && source !== undefined && resolved.match !== null &&
          resolved.locatorIndex !== null) {
        const live = await observe(resolved.match);
        if (live !== null && liveContext !== null) {
          const t = performance.now() - recording.startedAt;
          const currentRoute = route(page);
          if (contextChanges.resized) {
            events.push({ v: 1, id: `fresh:resize:${action.eventId}`, t, type: 'viewport.resize',
              stepId: step.stepId, route: currentRoute, ...liveContext });
          }
          if (contextChanges.scrolled) {
            events.push({ v: 1, id: `fresh:scroll:${action.eventId}`, t, type: 'interaction.scroll',
              stepId: step.stepId, route: currentRoute, ...liveContext });
          }
          events.push(...await sampleRedactions(page, redactions, {
            t,
            stepId: step.stepId,
            route: currentRoute,
            ...liveContext,
          }));
          events.push(freshActionEvent({
            action,
            stepId: step.stepId,
            locatorIndex: resolved.locatorIndex,
            t,
            route: currentRoute,
            ...liveContext,
            live,
          }));
        }
      }
      const beforeRoute = route(page);
      const result = resolved.match === null
        ? resolved.result
        : await execute(resolved.match, action, resolved.result);
      actions.push(result);
      const afterRoute = route(page);
      if (recording !== undefined && source !== undefined && liveContext !== null && afterRoute !== beforeRoute) {
        events.push({
          v: 1,
          id: `fresh:navigation:${action.eventId}`,
          t: performance.now() - recording.startedAt,
          type: 'navigation',
          stepId: step.stepId,
          route: afterRoute,
          ...liveContext,
        });
      }
      if (result.status === 'orphaned') {
        steps.push({ stepId: step.stepId, label: step.label, actions });
        return { steps, abortedAfterStepId: step.stepId, events };
      }
    }
    steps.push({ stepId: step.stepId, label: step.label, actions });
  }
  return { steps, abortedAfterStepId: null, events };
}
