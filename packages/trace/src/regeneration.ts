import type { Locator, Result, TargetDescriptor, TraceEvent } from './schema.ts';

export type ReplayAction =
  | { eventId: string; kind: 'click'; target: TargetDescriptor | null }
  | { eventId: string; kind: 'fill'; target: TargetDescriptor | null; value: string };

export type ReplayStep = {
  stepId: string;
  label: string;
  actions: readonly ReplayAction[];
};

export type ReplayPlan = { steps: readonly ReplayStep[] };

export type ActionResult = {
  eventId: string;
  kind: ReplayAction['kind'];
  status: 'matched' | 'drifted' | 'orphaned';
  locatorType: Locator['type'] | null;
  locatorIndex: number | null;
  reason: string | null;
};

function targetIdentity(target: TargetDescriptor | undefined): string {
  return target === undefined ? '' : JSON.stringify(target.locators);
}

function stepLabel(target: TargetDescriptor | undefined, stepId: string): string {
  return target?.accessibleName || target?.role || target?.tagName || stepId;
}

function isCheckboxLike(target: TargetDescriptor | undefined): boolean {
  return target?.role === 'checkbox' || target?.role === 'radio';
}

export function planReplay(
  events: readonly TraceEvent[],
  inputs: Readonly<Record<string, string>>,
): Result<ReplayPlan> {
  const grouped = new Map<string, TraceEvent[]>();
  for (const event of events) {
    if (event.type !== 'interaction.click'
      && event.type !== 'interaction.input'
      && event.type !== 'interaction.keypress') {
      continue;
    }
    const group = grouped.get(event.stepId) ?? [];
    group.push(event);
    grouped.set(event.stepId, group);
  }

  const steps: ReplayStep[] = [];
  for (const [stepId, group] of grouped) {
    if (group.some((event) => event.type === 'interaction.keypress')) {
      return { ok: false, error: `step ${stepId} contains an unsupported keypress event` };
    }

    const clicks = group.filter((event) => event.type === 'interaction.click');
    if (clicks.length > 1) {
      return { ok: false, error: `step ${stepId} contains multiple click events` };
    }
    const click = clicks[0];
    const clickIdentity = targetIdentity(click?.target);

    const inputsByTarget = new Map<string, TraceEvent>();
    for (const input of group) {
      if (input.type !== 'interaction.input') {
        continue;
      }
      const identity = targetIdentity(input.target);
      if (click !== undefined && isCheckboxLike(click.target) && identity === clickIdentity) {
        continue;
      }
      inputsByTarget.set(identity, input);
    }
    if (inputsByTarget.size > 1) {
      return { ok: false, error: `step ${stepId} contains multiple input targets` };
    }

    const input = [...inputsByTarget.values()][0];
    let fillValue: string | undefined;
    if (input !== undefined) {
      fillValue = inputs[stepId] ?? input.target?.value;
      if (fillValue === undefined || fillValue === '[MASKED]') {
        return { ok: false, error: `step ${stepId} requires an input override` };
      }
    }

    const actions: ReplayAction[] = [];
    for (const event of group) {
      if (event === click) {
        actions.push({ eventId: event.id, kind: 'click', target: event.target ?? null });
      } else if (event === input && fillValue !== undefined) {
        actions.push({ eventId: event.id, kind: 'fill', target: event.target ?? null, value: fillValue });
      }
    }

    if (actions.length > 0) {
      steps.push({
        stepId,
        label: stepLabel(click?.target ?? input?.target, stepId),
        actions,
      });
    }
  }

  return { ok: true, value: { steps } };
}

export type DriftStep = {
  stepId: string;
  label: string;
  actions: readonly ActionResult[];
};

export type DriftReport = {
  v: 1;
  demoId: string;
  trace: string;
  baseUrl: string;
  plannedSteps: number;
  evaluatedSteps: number;
  abortedAfterStepId: string | null;
  counts: { matched: number; drifted: number; orphaned: number };
  steps: readonly (DriftStep & { status: ActionResult['status'] })[];
};

type DriftReportInput = Omit<DriftReport, 'v' | 'evaluatedSteps' | 'counts' | 'steps'> & {
  steps: readonly DriftStep[];
};

function actionResult(action: ActionResult): ActionResult {
  return {
    eventId: action.eventId,
    kind: action.kind,
    status: action.status,
    locatorType: action.locatorType,
    locatorIndex: action.locatorIndex,
    reason: action.reason,
  };
}

function stepStatus(actions: readonly ActionResult[]): ActionResult['status'] {
  if (actions.some((action) => action.status === 'orphaned')) {
    return 'orphaned';
  }
  return actions.some((action) => action.status === 'drifted') ? 'drifted' : 'matched';
}

export function buildDriftReport(input: DriftReportInput): DriftReport {
  const steps = input.steps.map((step) => {
    const actions = step.actions.map(actionResult);
    return { stepId: step.stepId, label: step.label, actions, status: stepStatus(actions) };
  });
  const counts = { matched: 0, drifted: 0, orphaned: 0 };
  for (const step of steps) {
    counts[step.status] += 1;
  }
  return {
    v: 1,
    demoId: input.demoId,
    trace: input.trace,
    baseUrl: input.baseUrl,
    plannedSteps: input.plannedSteps,
    evaluatedSteps: steps.length,
    abortedAfterStepId: input.abortedAfterStepId,
    counts,
    steps,
  };
}

function reportRows(report: DriftReport, status: ActionResult['status']): string[] {
  return report.steps.filter((step) => step.status === status).map((step) => {
    const action = step.actions.find((value) => value.status === status) ?? step.actions[0];
    const locator = action?.locatorType === null || action?.locatorType === undefined
      ? null
      : `${action.locatorType}${action.locatorIndex === null ? '' : `[${action.locatorIndex}]`}`;
    const detail = locator ?? action?.reason;
    return `  1 step ${status.padEnd(10)} ${step.label}${detail ? `  ${detail}` : ''}`;
  });
}

export function formatDriftReport(report: DriftReport): string {
  const matchedUnit = report.counts.matched === 1 ? 'step' : 'steps';
  const lines = [
    `${report.demoId} regenerated against ${report.baseUrl}`,
    '',
    `  ${report.counts.matched} ${matchedUnit} matched`,
    ...reportRows(report, 'drifted'),
    ...reportRows(report, 'orphaned'),
  ];
  if (report.abortedAfterStepId !== null) {
    lines.push('', `  replay stopped after ${report.abortedAfterStepId}`);
  }
  return `${lines.join('\n')}\n`;
}

export function reportExitCode(report: DriftReport): 0 | 1 {
  return report.counts.drifted === 0
    && report.counts.orphaned === 0
    && report.evaluatedSteps === report.plannedSteps
    ? 0
    : 1;
}
