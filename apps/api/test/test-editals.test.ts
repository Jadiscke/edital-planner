import { describe, expect, it } from "vitest";

import { createDevelopmentTestEditalCatalog } from "../src/test-editals.ts";

describe("development test edital catalog", () => {
  it("includes the Dataprev module-boundary fixture as a selectable PDF", async () => {
    const catalog = createDevelopmentTestEditalCatalog(new URL("../../../docs/pdfs-tests/", import.meta.url));
    const dataprev = catalog.list().find((edital) => edital.id === "dataprev-2026");

    expect(dataprev).toMatchObject({
      label: "DATAPREV 2026 — Edital Retificado",
      structure: expect.stringMatching(/Módulos I e II.*13 perfis/i),
    });
    expect((await catalog.load("dataprev-2026"))?.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });
});
