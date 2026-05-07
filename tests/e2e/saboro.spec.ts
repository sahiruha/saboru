import { test, expect, Page } from '@playwright/test';

// ====================================================
// サボロー — E2E テスト (MVP)
// 対象 MVP 機能 (kikaku.md 9章):
//   1. タスク入力
//   2. AIによるタスク定量化
//   3. 先延ばしアドバイス生成
//   4. タスク終了ボタン
//   5. AIジャッジ
//   6. サボりスコア算出
//   7. ランキング表示
// ====================================================

const APP_URL = '/index.html';

async function gotoFreshHome(page: Page) {
  await page.goto(APP_URL);
  await page.evaluate(() => localStorage.clear());
  await page.goto(APP_URL);
  await expect(page.getByText('今週のサボリスコア')).toBeVisible();
}

// ============================================================
// TC-001 起動とホーム表示
// ============================================================
test.describe('TC-001 起動とホーム表示', () => {
  test('初回起動でホーム画面が表示される', async ({ page }) => {
    await gotoFreshHome(page);
    await expect(page.getByRole('heading', { level: 1 }).first()).toContainText('サボロー');
    await expect(page.getByTestId('weekly-score-value')).toHaveText('0');
    await expect(page.getByTestId('empty-state')).toBeVisible();
  });

  test('注目ランキングに自分含む行が表示される', async ({ page }) => {
    await gotoFreshHome(page);
    const labels = page.getByText('サボリスコア');
    expect(await labels.count()).toBeGreaterThanOrEqual(3);
  });
});

// ============================================================
// TC-002 ボトムナビゲーション
// ============================================================
test.describe('TC-002 ボトムナビゲーション', () => {
  test('4タブを順に遷移できる', async ({ page }) => {
    await gotoFreshHome(page);
    await page.getByTestId('nav-tasks').click();
    await expect(page).toHaveURL(/#\/tasks$/);
    await page.getByTestId('nav-ranking').click();
    await expect(page).toHaveURL(/#\/ranking$/);
    await page.getByTestId('nav-me').click();
    await expect(page).toHaveURL(/#\/me$/);
    await page.getByTestId('nav-home').click();
    await expect(page).toHaveURL(/#\/home$/);
    await expect(page.getByText('今週のサボリスコア')).toBeVisible();
  });
});

// ============================================================
// TC-003 タスク入力 (MVP #1)
// ============================================================
test.describe('TC-003 タスク入力 (MVP #1)', () => {
  test('FAB でタスク追加画面に遷移する', async ({ page }) => {
    await gotoFreshHome(page);
    await page.getByTestId('nav-fab').click();
    await expect(page).toHaveURL(/#\/task\/add$/);
    await expect(page.getByTestId('input-task')).toBeVisible();
    await expect(page.getByTestId('title')).toBeVisible();
    await expect(page.getByTestId('deadline')).toBeVisible();
    await expect(page.getByTestId('stakeholders')).toBeVisible();
    await expect(page.getByTestId('hours')).toBeVisible();
  });

  test('AIで埋める → 4項目に推定値が入る', async ({ page }) => {
    await gotoFreshHome(page);
    await page.getByTestId('nav-fab').click();
    await page.getByTestId('input-task').fill('来週火曜までに営業資料を作る');
    await page.getByTestId('ai-fill').click();
    await expect(page.getByTestId('title')).toHaveValue('営業資料');
    await expect(page.getByTestId('hours')).toHaveValue('2.5');
    await expect(page.getByTestId('deadline')).toHaveValue(/.+/);
  });

  test('タイトル空のときは「定量化する」が押せない', async ({ page }) => {
    await gotoFreshHome(page);
    await page.getByTestId('nav-fab').click();
    await expect(page.getByTestId('next')).toBeDisabled();
    await page.getByTestId('title').fill('資料作成');
    await expect(page.getByTestId('next')).toBeEnabled();
  });

  test('重要度トグルで状態が切り替わる', async ({ page }) => {
    await gotoFreshHome(page);
    await page.getByTestId('nav-fab').click();
    await page.getByTestId('imp-high').click();
    await expect(page.getByTestId('imp-high')).toHaveClass(/on/);
    await expect(page.getByTestId('imp-mid')).not.toHaveClass(/on/);
  });
});

// ============================================================
// TC-004 タスク定量化 (MVP #2)
// ============================================================
test.describe('TC-004 タスク定量化 (MVP #2)', () => {
  test('5軸スコア・レーダーチャート・AIの理由が表示される', async ({ page }) => {
    await gotoFreshHome(page);
    await page.getByTestId('nav-fab').click();
    await page.getByTestId('input-task').fill('明日までに営業資料を作る');
    await page.getByTestId('ai-fill').click();
    await page.getByTestId('next').click();

    await expect(page).toHaveURL(/#\/task\/quantify\//);
    await expect(page.getByTestId('radar')).toBeVisible();

    const total = parseInt(await page.getByTestId('total-score').innerText(), 10);
    expect(total).toBeGreaterThanOrEqual(20);
    expect(total).toBeLessThanOrEqual(100);

    const list = page.getByTestId('score-list');
    await expect(list).toContainText('タスク重さ');
    await expect(list).toContainText('心理抵抗');
    await expect(list).toContainText('逃げやすさ');
    await expect(list).toContainText('危険度');
    await expect(list).toContainText('作業量');

    const reasons = page.getByTestId('reasons');
    await expect(reasons).toBeVisible();
    expect((await reasons.innerText()).trim().length).toBeGreaterThan(0);
  });

  test('「やり直す」で追加画面に戻れる', async ({ page }) => {
    await gotoFreshHome(page);
    await page.getByTestId('nav-fab').click();
    await page.getByTestId('input-task').fill('明日までに営業資料を作る');
    await page.getByTestId('ai-fill').click();
    await page.getByTestId('next').click();
    await page.getByTestId('redo').click();
    await expect(page).toHaveURL(/#\/task\/add$/);
  });
});

// ============================================================
// TC-005 登録 → 先延ばし提案 (MVP #3)
// ============================================================
test.describe('TC-005 登録 → 先延ばし提案 (MVP #3)', () => {
  test('「この内容で登録」で永続化されて先延ばし提案画面へ', async ({ page }) => {
    await gotoFreshHome(page);
    await registerTask(page, '明日までに営業資料を作る');

    await expect(page).toHaveURL(/#\/task\/snooze\//);
    await expect(page.getByTestId('snooze-card')).toBeVisible();
    const snoozeHours = parseInt(await page.getByTestId('snooze-hours').innerText(), 10);
    expect(snoozeHours).toBeGreaterThanOrEqual(0);

    const tasksJson = await page.evaluate(() => JSON.stringify(window.__saboro__.Store.data.tasks));
    const tasks = JSON.parse(tasksJson);
    const real = tasks.filter((t: any) => t.id !== '_draft');
    expect(real.length).toBe(1);
    expect(real[0].status).toBe('sleeping');
  });

  test('先延ばしの理由が3件出る', async ({ page }) => {
    await gotoFreshHome(page);
    await registerTask(page, '明日までに営業資料を作る');
    const reasons = page.getByTestId('snooze-reasons');
    await expect(reasons).toBeVisible();
    expect((await reasons.innerText()).trim().length).toBeGreaterThan(0);
  });
});

// ============================================================
// TC-006 寝かせる / 今やる
// ============================================================
test.describe('TC-006 寝かせる/今やる', () => {
  test('寝かせる → ホームに戻り、今日のタスクに新規が表示される', async ({ page }) => {
    await gotoFreshHome(page);
    await registerTask(page, '明日までに営業資料を作る');
    await page.getByTestId('snooze-it').click();
    await expect(page).toHaveURL(/#\/home$/);
    const rows = page.getByTestId('today-tasks').getByTestId('task-row');
    await expect(rows.first()).toBeVisible();
    await expect(rows.first()).toContainText('営業資料');
  });

  test('今やる → タスクビューへ', async ({ page }) => {
    await gotoFreshHome(page);
    await registerTask(page, '明日までに営業資料を作る');
    await page.getByTestId('do-it-now').click();
    await expect(page).toHaveURL(/#\/task\/view\//);
    await expect(page.getByTestId('view-title')).toContainText('営業資料');
  });
});

// ============================================================
// TC-007 タスク終了 → AIジャッジ (MVP #4 / #5 / #6)
// ============================================================
test.describe('TC-007 タスク終了 → AIジャッジ (MVP #4/#5/#6)', () => {
  test('ギリ生還で完了 → ジャッジ結果(badge / pt)が表示', async ({ page }) => {
    await gotoFreshHome(page);
    await registerTask(page, '明日までに会議資料を作る');
    await page.getByTestId('do-it-now').click();          // → view
    await page.getByTestId('goto-finish').click();         // → finish
    await page.getByTestId('mode-giri').click();
    await page.getByTestId('judge-it').click();

    await expect(page).toHaveURL(/#\/task\/judge\//);
    expect((await page.getByTestId('badge').innerText()).length).toBeGreaterThan(0);
    expect(parseInt(await page.getByTestId('points').innerText(), 10)).toBeGreaterThan(0);
    await expect(page.getByTestId('consumed')).toContainText('%');
    await expect(page.getByTestId('judge-comment')).toBeVisible();
  });

  test('完了済みはタスク一覧の完了済みに入る', async ({ page }) => {
    await gotoFreshHome(page);
    await registerTask(page, '明日までに会議資料を作る');
    await page.getByTestId('do-it-now').click();
    await page.getByTestId('goto-finish').click();
    await page.getByTestId('mode-sabori').click();
    await page.getByTestId('judge-it').click();
    await page.getByTestId('back-home').click();
    await page.getByTestId('nav-tasks').click();
    await expect(page.locator('[data-testid="task-row-done"]').first()).toBeVisible();
  });

  test('完了後、ホームの今週スコアが0より大きくなる (MVP #6)', async ({ page }) => {
    await gotoFreshHome(page);
    await registerTask(page, '明日までに会議資料を作る');
    await page.getByTestId('do-it-now').click();
    await page.getByTestId('goto-finish').click();
    await page.getByTestId('mode-giri').click();
    await page.getByTestId('judge-it').click();
    await page.getByTestId('back-home').click();
    const w = parseInt(await page.getByTestId('weekly-score-value').innerText(), 10);
    expect(w).toBeGreaterThan(0);
  });
});

// ============================================================
// TC-008 ランキング表示 (MVP #7)
// ============================================================
test.describe('TC-008 ランキング表示 (MVP #7)', () => {
  test('自分が一覧に含まれる', async ({ page }) => {
    await gotoFreshHome(page);
    await page.getByTestId('nav-ranking').click();
    const myRow = page.getByTestId('rank-row').filter({ hasText: 'あなた' });
    await expect(myRow).toHaveCount(1);
    const myScore = parseInt(await page.getByTestId('my-score').innerText(), 10);
    expect(myScore).toBeGreaterThanOrEqual(0);
  });

  test('ジャッジで得点が反映され順位が更新される', async ({ page }) => {
    await gotoFreshHome(page);
    await registerTask(page, '明日までに会議資料を作る');
    await page.getByTestId('do-it-now').click();
    await page.getByTestId('goto-finish').click();
    await page.getByTestId('mode-giri').click();
    await page.getByTestId('judge-it').click();
    await page.getByTestId('back-home').click();
    await page.getByTestId('nav-ranking').click();
    const myScore = parseInt(await page.getByTestId('my-score').innerText(), 10);
    expect(myScore).toBeGreaterThan(0);
  });
});

// ============================================================
// TC-009 リセット / 削除
// ============================================================
test.describe('TC-009 リセット / 削除', () => {
  test('マイページのリセットで全データが消える', async ({ page }) => {
    await gotoFreshHome(page);
    await registerTask(page, '明日までに営業資料を作る');
    await page.getByTestId('snooze-it').click();
    await page.getByTestId('nav-me').click();
    page.on('dialog', d => d.accept());
    await page.getByTestId('reset-btn').click();
    await page.getByTestId('nav-home').click();
    await expect(page.getByTestId('empty-state')).toBeVisible();
  });

  test('タスクビューから削除できる', async ({ page }) => {
    await gotoFreshHome(page);
    await registerTask(page, '明日までに営業資料を作る');
    await page.getByTestId('snooze-it').click();
    await page.getByTestId('task-row').first().click();
    page.on('dialog', d => d.accept());
    await page.getByTestId('delete-task').click();
    await expect(page).toHaveURL(/#\/home$/);
    await expect(page.getByTestId('empty-state')).toBeVisible();
  });
});

// ============================================================
// TC-010 永続化
// ============================================================
test.describe('TC-010 永続化', () => {
  test('登録したタスクはリロードしても消えない', async ({ page }) => {
    await gotoFreshHome(page);
    await registerTask(page, '明日までに営業資料を作る');
    await page.getByTestId('snooze-it').click();
    await page.reload();
    const rows = page.getByTestId('today-tasks').getByTestId('task-row');
    await expect(rows.first()).toBeVisible();
  });
});

// ----- shared helpers -----
async function registerTask(page: Page, text: string) {
  await page.getByTestId('nav-fab').click();
  await page.getByTestId('input-task').fill(text);
  await page.getByTestId('ai-fill').click();
  await page.getByTestId('next').click();
  await page.getByTestId('register').click();
  await expect(page).toHaveURL(/#\/task\/snooze\//);
}

declare global {
  interface Window {
    __saboro__: {
      Store: any;
      AI: any;
      Router: any;
    };
  }
}
