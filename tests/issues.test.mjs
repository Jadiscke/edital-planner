import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const issuesDirectory = path.join(
  repositoryRoot,
  ".scratch",
  "planejador-edital-mvp",
  "issues",
);

test("all approved issues are publishable, testable vertical slices", async () => {
  const issueNames = (await readdir(issuesDirectory))
    .filter((name) => name.endsWith(".md"))
    .sort();

  assert.equal(issueNames.length, 24);

  for (const issueName of issueNames) {
    const issuePath = path.join(issuesDirectory, issueName);
    const content = await readFile(issuePath, "utf8");
    const openCriteria = content.match(/^- \[ \]/gm) ?? [];
    const completedCriteria = content.match(/^- \[x\]/gm) ?? [];
    const status = content.match(/^Status: (ready-for-agent|completed)$/m)?.[1];

    assert.ok(status, `${issueName}: estado inválido`);
    assert.match(content, /^## Parent$/m, issueName);
    assert.match(content, /^## What to build$/m, issueName);
    assert.match(content, /^## Acceptance criteria$/m, issueName);
    assert.match(content, /^## Blocked by$/m, issueName);
    assert.ok(openCriteria.length + completedCriteria.length >= 5, `${issueName}: critérios insuficientes`);
    assert.match(content, /test/i, `${issueName}: sem verificação automatizada`);

    if (status === "completed") {
      assert.equal(openCriteria.length, 0, `${issueName}: conclusão com critérios abertos`);
      assert.match(content, /^## Comments$/m, `${issueName}: conclusão sem histórico`);
    } else {
      assert.equal(completedCriteria.length, 0, `${issueName}: issue aberta com critérios concluídos`);
    }

    for (const match of content.matchAll(/\]\((\d{2}-[^)]+\.md)\)/g)) {
      await access(path.join(issuesDirectory, match[1]));
    }
  }
});
