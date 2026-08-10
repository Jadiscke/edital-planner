import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { InMemoryMaterialRepository, MaterialIndexService, MaterialVersionInvalidError } from "../src/materials.ts";

const owner = { issuer: "https://id.test", subjectId: "candidate", tenantId: "tenant-a", correlationId: "00000000-0000-4000-8000-000000000001" };
const other = { ...owner, tenantId: "tenant-b" };

describe("material index review", () => {
  it("registers an edition and approves a corrected, versioned manual index", async () => {
    const service = new MaterialIndexService(new InMemoryMaterialRepository());
    const material = await service.create(owner, { projectId: "10000000-0000-4000-8000-000000000001", title: "Direito Administrativo Descomplicado", edition: "33ª edição" }, "material-request-01");
    const suggestion = await service.importIndex(owner, material.id, {
      sourceKind: "manual", pageOffset: 12,
      items: [{ id: "chapter-1", parentId: null, title: "Atos administrativos", startPage: 41, endPage: 39, sourcePage: 2 }],
    });
    assert.equal(suggestion.status, "invalid");
    await assert.rejects(service.approve(owner, material.id, suggestion.id), MaterialVersionInvalidError);

    const corrected = await service.revise(owner, material.id, suggestion.id, {
      pageOffset: 12,
      items: [{ id: "chapter-1", parentId: null, title: "Atos administrativos", startPage: 41, endPage: 58, sourcePage: 2 }],
    });
    const approved = await service.approve(owner, material.id, corrected.id);

    assert.equal(approved.status, "approved");
    assert.equal(approved.versionNumber, 2);
    assert.deepEqual(approved.items[0], { id: "chapter-1", parentId: null, title: "Atos administrativos", startPage: 41, endPage: 58, sourcePage: 2 });
    assert.equal(await service.get(other, material.id), undefined);
  });
});
