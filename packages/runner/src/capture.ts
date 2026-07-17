import type {
  BoundingBox,
  ReplayAction,
  ScrollPosition,
  TraceEvent,
  Viewport,
} from '@cutscene/trace';

export type LiveTarget = {
  tagName: string;
  accessibleName: string;
  text: string;
  boundingBox: BoundingBox;
};

export function freshActionEvent(input: {
  action: ReplayAction;
  stepId: string;
  locatorIndex: number;
  t: number;
  route: string;
  viewport: Viewport;
  scroll: ScrollPosition;
  live: LiveTarget;
}): TraceEvent {
  const source = input.action.target;
  if (source === null) {
    throw new Error('a resolved replay action must have a target');
  }
  const masked = input.action.kind !== 'click' || source.value !== undefined;
  const maskLiveIdentity = input.action.kind === 'press' ||
    (input.action.kind === 'click' && source.value !== undefined);
  const target = {
    role: source.role,
    accessibleName: maskLiveIdentity ? source.accessibleName : input.live.accessibleName,
    text: maskLiveIdentity ? source.text : input.live.text,
    tagName: input.live.tagName,
    boundingBox: input.live.boundingBox,
    locators: source.locators.slice(input.locatorIndex),
    ...(masked ? { value: '[MASKED]' } : {}),
  };
  const envelope = {
    v: 1 as const,
    id: `fresh:${input.action.eventId}`,
    t: input.t,
    stepId: input.stepId,
    route: input.route,
    viewport: input.viewport,
    scroll: input.scroll,
    target,
  };
  if (input.action.kind === 'press') {
    return { ...envelope, type: 'interaction.keypress', key: input.action.key };
  }
  return {
    ...envelope,
    type: input.action.kind === 'fill' ? 'interaction.input' : 'interaction.click',
  };
}
