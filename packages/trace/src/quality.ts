import { targetLabel } from './docs.ts';
import type { TraceEvent } from './schema.ts';

// Quality findings read the structure the capture already recorded. Nothing
// here re-inspects the page: if the trace knows an element's role, accessible
// name, and ranked locators, it already knows whether that element was
// reachable and whether the step that touched it will survive a refactor.

export type QualityFinding = {
  kind: 'missing-accessible-name' | 'missing-role' | 'fragile-locator' | 'no-locator';
  stepId: string;
  eventId: string;
  t: number;
  label: string;
  detail: string;
};

const INTERACTIVE = new Set<TraceEvent['type']>(['interaction.click', 'interaction.input']);

// A step is fragile when its strongest locator is one that ordinary edits
// break: `text` moves with copy changes, `css` moves with markup changes.
// ponytail: one threshold, not a per-type policy table. Split it only if a
// locator type lands between 0.6 and 0.8 and needs its own verdict.
const FRAGILE_BELOW = 0.8;

export function analyzeQuality(events: readonly TraceEvent[]): QualityFinding[] {
  const findings: QualityFinding[] = [];
  // One step usually touches an element more than once (a click and the input
  // it produces). That is one defect, not two, so report each kind once per
  // step and element.
  const seen = new Set<string>();
  const push = (finding: QualityFinding) => {
    const key = `${finding.kind} | ${finding.stepId} | ${finding.label}`;
    if (seen.has(key)) return;
    seen.add(key);
    findings.push(finding);
  };
  for (const event of events) {
    const target = event.target;
    if (!INTERACTIVE.has(event.type) || !target) continue;
    const base = { stepId: event.stepId, eventId: event.id, t: event.t, label: targetLabel(target) };

    // An empty accessible name means assistive technology announces nothing
    // for an element the flow depends on.
    if (!target.accessibleName.trim()) {
      push({ ...base, kind: 'missing-accessible-name',
        detail: `<${target.tagName.toLowerCase()}> exposes no accessible name` });
    }
    if (target.role === null) {
      push({ ...base, kind: 'missing-role',
        detail: `<${target.tagName.toLowerCase()}> exposes no implicit or explicit role` });
    }

    const best = target.locators[0];
    if (!best) {
      push({ ...base, kind: 'no-locator', detail: 'no locator was captured for this element' });
    } else if (best.confidence < FRAGILE_BELOW) {
      push({ ...base, kind: 'fragile-locator',
        detail: `strongest locator is \`${best.type}\` at ${Math.round(best.confidence * 100)}% confidence` });
    }
  }
  return findings;
}

const HEADINGS: Record<QualityFinding['kind'], string> = {
  'missing-accessible-name': 'Interactions on elements with no accessible name',
  'missing-role': 'Interactions on elements with no role',
  'fragile-locator': 'Steps that will drift when the markup or copy changes',
  'no-locator': 'Steps with no captured locator',
};

export function renderQualityReport(findings: readonly QualityFinding[]): string {
  const lines = ['# Recording quality report', '',
    'Derived from the recorded trace. No page was re-inspected to produce this.', ''];
  if (findings.length === 0) {
    lines.push('No accessibility or locator-fragility findings on the recorded path.', '');
    return lines.join('\n');
  }
  for (const kind of Object.keys(HEADINGS) as Array<QualityFinding['kind']>) {
    const group = findings.filter((finding) => finding.kind === kind);
    if (group.length === 0) continue;
    lines.push(`## ${HEADINGS[kind]} (${group.length})`, '');
    for (const finding of group) {
      lines.push(`- \`${finding.stepId}\` at ${(finding.t / 1_000).toFixed(1)}s - **${finding.label}**: ${finding.detail}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}
