import { test, expect } from "@playwright/test";
import assert from "node:assert";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

// Resolve repo dir from the test server's /api/status endpoint
async function getRepoDir(request: import("@playwright/test").APIRequestContext) {
  const res = await request.get("/api/status", {
    headers: { host: "127.0.0.1:14568" },
  });
  const data = await res.json();
  return data.cwd as string;
}

test("opening the page shows the branch name in the toolbar", async ({ page }) => {
  await page.goto("/");
  const toolbar = page.getByTestId("toolbar");
  await expect(toolbar).toBeVisible();
  // Branch name is displayed
  await expect(toolbar).toContainText("feature/test");
});

test("opening the page fetches /api/diff/auto and shows changed files", async ({ page }) => {
  // Intercept /api/diff/auto to verify it's called
  let diffRequested = false;
  await page.route("**/api/diff/auto", async (route) => {
    diffRequested = true;
    await route.continue();
  });
  await page.goto("/");
  const diffView = page.getByTestId("diff-view");
  await expect(diffView).toBeVisible();
  // Three changed files are listed in the file tree (hello.ts, large-file.ts, new-file.ts)
  const treeItems = diffView.getByTestId("file-tree-item");
  await expect(treeItems).toHaveCount(3);
  await expect(treeItems.nth(0)).toContainText("hello.ts");
  await expect(treeItems.nth(1)).toContainText("large-file.ts");
  await expect(treeItems.nth(2)).toContainText("new-file.ts");
  // Only the selected file is rendered; the first file is selected by default
  const diffFile = diffView.getByTestId("diff-file");
  await expect(diffFile).toHaveCount(1);
  await expect(diffFile).toContainText("hello.ts");
  // Added line content is visible
  await expect(diffFile).toContainText("hello world");
  // Selecting the new file shows it with the New badge and records it in the URL
  await treeItems.nth(2).click();
  await expect(diffFile).toContainText("new-file.ts");
  await expect(diffFile).toContainText("New");
  expect(page.url()).toContain("file=new-file.ts");
  // Verify the diff API was called
  expect(diffRequested).toBe(true);
});

test("the selected file survives a reload and back/forward navigation", async ({ page }) => {
  await page.goto("/");
  const diffView = page.getByTestId("diff-view");
  const treeItems = diffView.getByTestId("file-tree-item");
  const diffFile = diffView.getByTestId("diff-file");
  await treeItems.filter({ hasText: "large-file.ts" }).click();
  await expect(diffFile).toContainText("large-file.ts");
  await page.reload();
  await expect(diffFile).toContainText("large-file.ts");
  await treeItems.filter({ hasText: "new-file.ts" }).click();
  await expect(diffFile).toContainText("new-file.ts");
  await page.goBack();
  await expect(diffFile).toContainText("large-file.ts");
  await page.goForward();
  await expect(diffFile).toContainText("new-file.ts");
});

test("the split view toggle renders side-by-side rows and persists", async ({ page }) => {
  await page.goto("/");
  const diffFile = page.getByTestId("diff-file");
  await expect(diffFile).toContainText("hello world");
  await diffFile.getByRole("button", { name: "split" }).click();
  await expect(diffFile.getByRole("button", { name: "split" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  // The modified line shows the old text on the left and the new text on the right
  const changedRow = diffFile.getByRole("row").filter({ hasText: "hello world" });
  await expect(changedRow).toContainText('"hello"');
  await page.reload();
  await expect(diffFile.getByRole("button", { name: "split" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("modifying a file updates the diff view automatically", async ({ page, request }) => {
  const repoDir = await getRepoDir(request);
  await page.goto("/");
  const diffView = page.getByTestId("diff-view");
  await expect(diffView).toBeVisible();
  // Verify initial file count
  await expect(diffView.getByTestId("file-tree-item")).toHaveCount(3);
  // Add a new file to the repo
  writeFileSync(join(repoDir, "added.ts"), "export const added = true;\n");
  execSync("git add added.ts", { cwd: repoDir, stdio: "pipe" });
  // Wait for the file tree to update (watcher debounce + fetch)
  await expect(diffView.getByTestId("file-tree-item")).toHaveCount(4);
  // The added file is listed
  await expect(diffView.getByTestId("file-sidebar")).toContainText("added.ts");
});

test("ファイル変更時にスクロール位置がリセットされない", async ({ page, request }) => {
  const repoDir = await getRepoDir(request);
  await page.goto("/");
  const diffView = page.getByTestId("diff-view");
  await expect(diffView).toBeVisible();
  // large-file.ts を選択する
  await diffView.getByTestId("file-tree-item").filter({ hasText: "large-file.ts" }).click();
  const pane = diffView.getByTestId("diff-pane");
  await expect(pane).toContainText("line50 = 50");
  // diff ペインをスクロール
  await pane.evaluate((el) => el.scrollTo({ top: 800 }));
  const scrollBefore = await pane.evaluate((el) => el.scrollTop);
  expect(scrollBefore).toBeGreaterThan(0);
  // ファイルを変更してwatcherを発火させる
  writeFileSync(
    join(repoDir, "large-file.ts"),
    Array.from({ length: 100 }, (_, i) => `export const line${i} = ${i + 1};`).join("\n") + "\n",
  );
  execSync("git add large-file.ts", { cwd: repoDir, stdio: "pipe" });
  // diff更新を待つ（変更後のコンテンツが表示されるまで）
  await expect(diffView).toContainText("line99 = 100");
  // スクロール位置が維持されていることを確認（TOPにリセットされていない）
  const scrollAfter = await pane.evaluate((el) => el.scrollTop);
  expect(Math.abs(scrollAfter - scrollBefore)).toBeLessThan(200);
});

test("clicking a diff line opens the comment form, and submitting sends the comment", async ({
  page,
}) => {
  // Intercept /api/comment to verify the request payload
  let commentPayload: Record<string, unknown> | null = null;
  await page.route("**/api/comment", async (route) => {
    const request = route.request();
    commentPayload = request.postDataJSON();
    await route.continue();
  });
  await page.goto("/");
  const diffView = page.getByTestId("diff-view");
  await expect(diffView).toBeVisible();
  // Find the hello.ts file by its header text
  const helloFile = diffView.getByTestId("diff-file").filter({ hasText: "hello.ts" });
  await expect(helloFile).toBeVisible();
  // Click on the gutter of the "hello world" line
  const addedLine = helloFile.getByRole("row").filter({ hasText: "hello world" });
  await addedLine.getByRole("cell").first().click();
  // Comment form appears
  const commentForm = helloFile.getByRole("textbox");
  await expect(commentForm).toBeVisible();
  // Type a comment and submit
  await commentForm.fill("This looks good");
  await helloFile.getByRole("button", { name: "Send now" }).click();
  // Comment form disappears after successful submission
  await expect(commentForm).not.toBeVisible();
  // Verify the request was sent with correct payload
  assert(commentPayload !== null, "comment API request was not sent");
  expect((commentPayload as Record<string, unknown>).comment).toBe("This looks good");
  expect((commentPayload as Record<string, unknown>).file).toContain("hello.ts");
});

test("GET /api/status returns the current branch name", async ({ request }) => {
  const res = await request.get("/api/status", {
    headers: { host: "127.0.0.1:14568" },
  });
  expect(res.ok()).toBe(true);
  const data = await res.json();
  expect(data.branch).toBe("feature/test");
});
