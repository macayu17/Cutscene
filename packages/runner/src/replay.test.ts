import { afterAll, beforeAll, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from '@playwright/test';
import type { Locator, ReplayAction, ReplayPlan, TargetDescriptor } from '@cutscene/trace';
import { replay } from './replay.ts';

const box = { x: 1, y: 2, width: 30, height: 20 };
let browser: Browser | null = null;

beforeAll(async () => {
  browser = await chromium.launch({ headless: true });
});

afterAll(async () => {
  await browser?.close();
});

function target(name: string, locators: Locator[]): TargetDescriptor {
  return {
    role: 'button',
    accessibleName: name,
    text: name,
    tagName: 'BUTTON',
    boundingBox: box,
    locators,
  };
}

function plan(actions: ReplayAction[], laterActions: ReplayAction[] = []): ReplayPlan {
  return {
    steps: [
      { stepId: 'step_1', label: 'Primary', actions },
      ...(laterActions.length === 0
        ? []
        : [{ stepId: 'step_2', label: 'Later', actions: laterActions }]),
    ],
  };
}

async function withPage(html: string, check: (page: Page) => Promise<void>): Promise<void> {
  if (browser === null) {
    throw new Error('browser did not start');
  }
  const page = await browser.newPage();
  try {
    await page.setContent(html);
    await check(page);
  } finally {
    await page.close();
  }
}

it('uses the first ranked locator and classifies it as matched', async () => {
  await withPage('<button data-testid="save" onclick="this.dataset.clicked=\'yes\'">Save</button>', async (page) => {
    const run = await replay(page, plan([{
      eventId: 'click',
      kind: 'click',
      target: target('Save', [{ type: 'testId', value: 'save', confidence: 1 }]),
    }]));

    expect(run).toEqual({
      steps: [{
        stepId: 'step_1',
        label: 'Primary',
        actions: [{ eventId: 'click', kind: 'click', status: 'matched', locatorType: 'testId',
          locatorIndex: 0, reason: null }],
      }],
      abortedAfterStepId: null,
      events: [],
    });
    await expect(page.getByTestId('save').getAttribute('data-clicked')).resolves.toBe('yes');
  });
});

it('captures live geometry, fallback locators, navigation, and masked values', async () => {
  if (browser === null) throw new Error('browser did not start');
  const page = await browser.newPage({ viewport: { width: 500, height: 300 } });
  try {
    await page.setContent(`<style>body{margin:0;height:1200px}input{position:absolute;top:400px;left:25px;width:200px;height:30px}</style>
      <label for="email">Current email</label>
      <input id="email" onkeydown="if(event.key==='Enter') location.hash='done'">`);
    const stale = target('Old email', [
      { type: 'testId', value: 'missing', confidence: 1 },
      { type: 'label', value: 'Current email', confidence: 0.9 },
    ]);
    stale.role = 'textbox';
    stale.tagName = 'INPUT';
    stale.value = '[MASKED]';
    const replayPlan = plan([
      { eventId: 'input', kind: 'fill', target: stale, value: 'do-not-serialize' },
      { eventId: 'key', kind: 'press', target: stale, key: 'Enter' },
    ]);
    const envelope = {
      v: 1 as const,
      t: 100,
      stepId: 'step_1',
      route: '/',
      viewport: { width: 500, height: 300, dpr: 1 },
      scroll: { x: 0, y: 350 },
      target: stale,
    };
    const run = await replay(page, replayPlan, {
      reference: [
        { ...envelope, id: 'input', type: 'interaction.input' },
        { ...envelope, id: 'key', t: 120, type: 'interaction.keypress', key: 'Enter' },
      ],
      startedAt: performance.now(),
    });

    expect(run.events.filter((event) => event.type === 'interaction.input' ||
      event.type === 'interaction.keypress')).toHaveLength(2);
    expect(run.events.find((event) => event.type === 'interaction.input')).toMatchObject({
      type: 'interaction.input',
      scroll: { x: 0, y: 350 },
      target: {
        accessibleName: 'Current email',
        locators: [{ type: 'label', value: 'Current email' }],
        value: '[MASKED]',
      },
    });
    expect(run.events.some((event) => event.type === 'interaction.scroll' && event.scroll.y === 350)).toBe(true);
    expect(run.events.some((event) => event.type === 'navigation' && event.route.endsWith('#done'))).toBe(true);
    expect(JSON.stringify(run.events)).not.toContain('do-not-serialize');
    expect(run.steps[0]?.actions.every((result) => result.status === 'drifted')).toBe(true);
  } finally {
    await page.close();
  }
});

it('samples configured redactions without capturing their content', async () => {
  await withPage(`<div class="secret">never-capture-this</div>
    <button data-testid="remove" onclick="document.querySelector('.secret').remove()">Remove</button>
    <button data-testid="next">Next</button>`, async (page) => {
    const remove = target('Remove', [{ type: 'testId', value: 'remove', confidence: 1 }]);
    const next = target('Next', [{ type: 'testId', value: 'next', confidence: 1 }]);
    const context = {
      v: 1 as const,
      route: '/',
      viewport: { width: 1280, height: 720, dpr: 1 },
      scroll: { x: 0, y: 0 },
    };
    const run = await replay(page, plan(
      [{ eventId: 'remove', kind: 'click', target: remove }],
      [{ eventId: 'next', kind: 'click', target: next }],
    ), {
      reference: [
        { ...context, id: 'mask', t: 0, stepId: 'step_1', type: 'annotation.redaction',
          selector: '.secret', instanceId: 'old', visible: true,
          box: { x: 0, y: 0, width: 10, height: 10 } },
        { ...context, id: 'remove', t: 10, stepId: 'step_1', type: 'interaction.click', target: remove },
        { ...context, id: 'next', t: 20, stepId: 'step_2', type: 'interaction.click', target: next },
      ],
      startedAt: performance.now(),
    });

    const samples = run.events.filter((event) => event.type === 'annotation.redaction');
    expect(samples).toMatchObject([
      { selector: '.secret', instanceId: '.secret:0', visible: true },
      { selector: '.secret', instanceId: '.secret:0', visible: false },
    ]);
    expect(JSON.stringify(samples)).not.toContain('never-capture-this');
    expect(samples.every((sample) => !('target' in sample))).toBe(true);
  });
});

it('uses a lower-ranked role locator and classifies it as drifted', async () => {
  await withPage('<button onclick="this.dataset.clicked=\'yes\'">Save</button>', async (page) => {
    const run = await replay(page, plan([{
      eventId: 'click',
      kind: 'click',
      target: target('Save', [
        { type: 'testId', value: 'missing', confidence: 1 },
        { type: 'role', role: 'button', name: 'Save', confidence: 0.9 },
      ]),
    }]));

    expect(run.steps[0]?.actions[0]).toMatchObject({
      status: 'drifted',
      locatorType: 'role',
      locatorIndex: 1,
    });
    await expect(page.getByRole('button', { name: 'Save' }).getAttribute('data-clicked')).resolves.toBe('yes');
  });
});

it('does not resolve a locator with two visible matches', async () => {
  await withPage('<button>Duplicate</button><button>Duplicate</button>', async (page) => {
    const run = await replay(page, plan([{
      eventId: 'click',
      kind: 'click',
      target: target('Duplicate', [{ type: 'text', value: 'Duplicate', confidence: 1 }]),
    }]));

    expect(run.steps[0]?.actions[0]).toMatchObject({
      status: 'orphaned',
      locatorType: null,
      locatorIndex: null,
      reason: 'no locator resolved',
    });
  });
});

it('stops before later steps after an orphaned action', async () => {
  await withPage('<button data-testid="later" onclick="this.dataset.clicked=\'yes\'">Later</button>', async (page) => {
    const run = await replay(page, plan(
      [{ eventId: 'missing', kind: 'click', target: target('Missing', [
        { type: 'testId', value: 'missing', confidence: 1 },
      ]) }],
      [{ eventId: 'later', kind: 'click', target: target('Later', [
        { type: 'testId', value: 'later', confidence: 1 },
      ]) }],
    ));

    expect(run.abortedAfterStepId).toBe('step_1');
    expect(run.steps).toHaveLength(1);
    await expect(page.getByTestId('later').getAttribute('data-clicked')).resolves.toBeNull();
  });
});

it('fills with the in-memory value but omits it from the result', async () => {
  await withPage('<label>Email <input></label>', async (page) => {
    const run = await replay(page, plan([{
      eventId: 'input',
      kind: 'fill',
      target: target('Email', [{ type: 'label', value: 'Email', confidence: 1 }]),
      value: 'do-not-print-this',
    }]));

    await expect(page.getByLabel('Email').inputValue()).resolves.toBe('do-not-print-this');
    expect(run.steps[0]?.actions[0]).toMatchObject({ status: 'matched', locatorType: 'label', locatorIndex: 0 });
    expect(JSON.stringify(run)).not.toContain('do-not-print-this');
  });
});

it('presses Enter through the same ranked locator after filling', async () => {
  await withPage(`<label>New todo <input onkeydown="
    if (event.key === 'Enter') this.dataset.submitted = this.value
  "></label>`, async (page) => {
    const textbox = target('New todo', [{ type: 'label', value: 'New todo', confidence: 1 }]);
    const run = await replay(page, plan([
      { eventId: 'input', kind: 'fill', target: textbox, value: 'Recorded title' },
      { eventId: 'key', kind: 'press', target: textbox, key: 'Enter' },
    ]));

    await expect(page.getByLabel('New todo').getAttribute('data-submitted')).resolves.toBe('Recorded title');
    expect(run.steps[0]?.actions).toMatchObject([
      { eventId: 'input', kind: 'fill', status: 'matched', locatorType: 'label', locatorIndex: 0 },
      { eventId: 'key', kind: 'press', status: 'matched', locatorType: 'label', locatorIndex: 0 },
    ]);
  });
});
