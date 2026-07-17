import type { BoundingBox, Locator, TargetDescriptor, TraceEvent } from './schema.ts';

type ActionType = 'interaction.click' | 'interaction.input' | 'interaction.keypress';
export type TraceDiffStatus = 'unchanged' | 'changed' | 'added' | 'removed';
export type TraceDiffActionKind = 'click' | 'input' | 'keypress';
export type TraceDiffChange = 'route' | 'label' | 'locator' | 'geometry';

export type TraceDiffAction = {
  status: TraceDiffStatus;
  stepId: string;
  kind: TraceDiffActionKind;
  occurrence: number;
  label: string;
  changes: readonly TraceDiffChange[];
};

export type TraceDiff = {
  v: 1;
  counts: { unchanged: number; changed: number; added: number; removed: number };
  actions: readonly TraceDiffAction[];
};

type ActionEvent = TraceEvent & { type: ActionType };
type IndexedAction = { event: ActionEvent; occurrence: number; matched: boolean };

function isAction(event: TraceEvent): event is ActionEvent {
  return event.type === 'interaction.click' || event.type === 'interaction.input' ||
    event.type === 'interaction.keypress';
}

function kindOf(event: ActionEvent): TraceDiffActionKind {
  if (event.type === 'interaction.click') return 'click';
  if (event.type === 'interaction.input') return 'input';
  return 'keypress';
}

function keyOf(event: ActionEvent): string {
  return JSON.stringify([event.stepId, event.type]);
}

function safeLabel(target: TargetDescriptor | undefined): string {
  const name = target?.accessibleName.trim();
  if (name && name !== '[MASKED]') return name;
  const text = target?.text.trim();
  if (text && text !== '[MASKED]') return text;
  return target?.role ?? target?.tagName.toLowerCase() ?? 'target';
}

function sameLocator(left: Locator | undefined, right: Locator | undefined): boolean {
  if (left === undefined || right === undefined) return left === right;
  if (left.type !== right.type || left.confidence !== right.confidence) return false;
  if (left.type === 'role') {
    return right.type === 'role' && left.role === right.role && left.name === right.name;
  }
  return right.type !== 'role' && left.value === right.value;
}

function sameBox(left: BoundingBox | undefined, right: BoundingBox | undefined): boolean {
  if (left === undefined || right === undefined) return left === right;
  return Math.abs(left.x - right.x) <= 0.5 && Math.abs(left.y - right.y) <= 0.5 &&
    Math.abs(left.width - right.width) <= 0.5 && Math.abs(left.height - right.height) <= 0.5;
}

function changesBetween(reference: ActionEvent, fresh: ActionEvent): TraceDiffChange[] {
  const changes: TraceDiffChange[] = [];
  if (reference.route !== fresh.route) changes.push('route');
  if (safeLabel(reference.target) !== safeLabel(fresh.target)) changes.push('label');
  if (!sameLocator(reference.target?.locators[0], fresh.target?.locators[0])) changes.push('locator');
  if (!sameBox(reference.target?.boundingBox, fresh.target?.boundingBox)) changes.push('geometry');
  return changes;
}

function indexActions(events: readonly TraceEvent[]): IndexedAction[] {
  const occurrences = new Map<string, number>();
  return events.filter(isAction).map((event) => {
    const key = keyOf(event);
    const occurrence = (occurrences.get(key) ?? 0) + 1;
    occurrences.set(key, occurrence);
    return { event, occurrence, matched: false };
  });
}

export function diffTraces(reference: readonly TraceEvent[], fresh: readonly TraceEvent[]): TraceDiff {
  const oldActions = indexActions(reference);
  const newActions = indexActions(fresh);
  const freshByKey = new Map<string, IndexedAction[]>();
  for (const action of newActions) {
    const key = keyOf(action.event);
    const group = freshByKey.get(key) ?? [];
    group.push(action);
    freshByKey.set(key, group);
  }

  const counts = { unchanged: 0, changed: 0, added: 0, removed: 0 };
  const actions: TraceDiffAction[] = [];
  for (const referenceAction of oldActions) {
    const freshAction = freshByKey.get(keyOf(referenceAction.event))?.shift();
    if (freshAction === undefined) {
      counts.removed += 1;
      actions.push({
        status: 'removed', stepId: referenceAction.event.stepId, kind: kindOf(referenceAction.event),
        occurrence: referenceAction.occurrence, label: safeLabel(referenceAction.event.target), changes: [],
      });
      continue;
    }
    freshAction.matched = true;
    const changes = changesBetween(referenceAction.event, freshAction.event);
    const status = changes.length === 0 ? 'unchanged' : 'changed';
    counts[status] += 1;
    actions.push({
      status, stepId: freshAction.event.stepId, kind: kindOf(freshAction.event),
      occurrence: freshAction.occurrence, label: safeLabel(freshAction.event.target), changes,
    });
  }

  for (const freshAction of newActions) {
    if (freshAction.matched) continue;
    counts.added += 1;
    actions.push({
      status: 'added', stepId: freshAction.event.stepId, kind: kindOf(freshAction.event),
      occurrence: freshAction.occurrence, label: safeLabel(freshAction.event.target), changes: [],
    });
  }

  return { v: 1, counts, actions };
}

export function formatTraceDiff(diff: TraceDiff): string {
  const lines = [
    'Trace diff',
    '',
    `  ${diff.counts.unchanged} unchanged`,
    `  ${diff.counts.changed} changed`,
    `  ${diff.counts.added} added`,
    `  ${diff.counts.removed} removed`,
  ];
  const noteworthy = diff.actions.filter((action) => action.status !== 'unchanged');
  if (noteworthy.length > 0) lines.push('');
  for (const action of noteworthy) {
    const changes = action.changes.length > 0 ? `  ${action.changes.join(', ')}` : '';
    lines.push(
      `  ${action.status} ${action.stepId} ${action.kind}[${action.occurrence}] ${JSON.stringify(action.label)}${changes}`,
    );
  }
  return `${lines.join('\n')}\n`;
}
