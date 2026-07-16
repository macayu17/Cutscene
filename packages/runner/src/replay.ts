import type {
  ActionResult,
  DriftStep,
  Locator,
  ReplayAction,
  ReplayPlan,
} from '@cutscene/trace';
import type { Locator as PlaywrightLocator, Page } from '@playwright/test';

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

async function execute(page: Page, action: ReplayAction): Promise<ActionResult> {
  if (action.target === null) {
    return {
      eventId: action.eventId,
      kind: action.kind,
      status: 'orphaned',
      locatorType: null,
      locatorIndex: null,
      reason: 'no target captured',
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

    try {
      if (action.kind === 'click') {
        await match.click();
      } else {
        await match.fill(action.value);
      }
      return {
        eventId: action.eventId,
        kind: action.kind,
        status: index === 0 ? 'matched' : 'drifted',
        locatorType: locator.type,
        locatorIndex: index,
        reason: null,
      };
    } catch (cause: unknown) {
      return {
        eventId: action.eventId,
        kind: action.kind,
        status: 'orphaned',
        locatorType: locator.type,
        locatorIndex: index,
        reason: cause instanceof Error ? cause.message : String(cause),
      };
    }
  }

  return {
    eventId: action.eventId,
    kind: action.kind,
    status: 'orphaned',
    locatorType: null,
    locatorIndex: null,
    reason: 'no locator resolved',
  };
}

export type ReplayRun = {
  steps: readonly DriftStep[];
  abortedAfterStepId: string | null;
};

export async function replay(page: Page, plan: ReplayPlan): Promise<ReplayRun> {
  const steps: DriftStep[] = [];
  for (const step of plan.steps) {
    const actions: ActionResult[] = [];
    for (const action of step.actions) {
      const result = await execute(page, action);
      actions.push(result);
      if (result.status === 'orphaned') {
        steps.push({ stepId: step.stepId, label: step.label, actions });
        return { steps, abortedAfterStepId: step.stepId };
      }
    }
    steps.push({ stepId: step.stepId, label: step.label, actions });
  }
  return { steps, abortedAfterStepId: null };
}
