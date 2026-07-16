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
    });
    await expect(page.getByTestId('save').getAttribute('data-clicked')).resolves.toBe('yes');
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
