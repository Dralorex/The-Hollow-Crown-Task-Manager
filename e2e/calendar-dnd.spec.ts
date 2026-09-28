import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";

type Fixture = {
  cookieName: string;
  cookieValue: string;
  eventId: string;
  recordId: string;
  fromDay: string;
  toDay: string;
};

function runTsx(script: string, args: string[] = []): string {
  return execFileSync(
    "npx",
    ["tsx", script, ...args],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
      },
    },
  ).trim();
}

function seedFixture(): Fixture {
  return JSON.parse(runTsx("e2e/fixtures/seed-calendar.ts")) as Fixture;
}

function readSavedDay(recordId: string): string | null {
  const raw = runTsx("e2e/fixtures/read-event-date.ts", [recordId]);
  return (JSON.parse(raw) as { day: string | null }).day;
}

test.describe("calendar HTML5 day drag", () => {
  test("moves a personal event onto another day via DataTransfer", async ({
    page,
    context,
  }) => {
    const fixture = seedFixture();
    await context.addCookies([
      {
        name: fixture.cookieName,
        value: fixture.cookieValue,
        domain: "127.0.0.1",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);

    await page.goto("/app/calendar?view=month");
    await expect(page.getByText("E2E drag me")).toBeVisible();

    await expect(
      page.locator(
        `[data-day="${fixture.fromDay}"] [data-event-id="${fixture.eventId}"]`,
      ),
    ).toBeVisible();

    await page.evaluate(
      ({ eventId, toDay }) => {
        const src = document.querySelector(`[data-event-id="${eventId}"]`);
        const dst = document.querySelector(`[data-day="${toDay}"]`);
        if (!src || !dst) {
          throw new Error(`Missing drag nodes: src=${!!src} dst=${!!dst}`);
        }
        const dt = new DataTransfer();
        dt.setData("text/calendar-event", eventId);
        src.dispatchEvent(
          new DragEvent("dragstart", {
            bubbles: true,
            cancelable: true,
            dataTransfer: dt,
          }),
        );
        dst.dispatchEvent(
          new DragEvent("dragenter", {
            bubbles: true,
            cancelable: true,
            dataTransfer: dt,
          }),
        );
        dst.dispatchEvent(
          new DragEvent("dragover", {
            bubbles: true,
            cancelable: true,
            dataTransfer: dt,
          }),
        );
        dst.dispatchEvent(
          new DragEvent("drop", {
            bubbles: true,
            cancelable: true,
            dataTransfer: dt,
          }),
        );
        src.dispatchEvent(
          new DragEvent("dragend", {
            bubbles: true,
            cancelable: true,
            dataTransfer: dt,
          }),
        );
      },
      { eventId: fixture.eventId, toDay: fixture.toDay },
    );

    await expect(
      page.locator(
        `[data-day="${fixture.toDay}"] [data-event-id="${fixture.eventId}"]`,
      ),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Saving…")).toHaveCount(0);

    expect(readSavedDay(fixture.recordId)).toBe(fixture.toDay);
  });
});
