import { test, expect, Page } from '@playwright/test';

// ====================================================
// サボロー — E2E テスト
// ====================================================
// 各テストは独立して実行できるように beforeEach で
// localStorage をクリアし、トップ画面から開始する。
// ====================================================

const APP_URL = '/index.html';

async function gotoFreshHome(page: Page) {
  // 最初の goto 後にクリアして再描画。reload 時にデータが消えないよう
  // addInitScript は使わない (TC-011 で永続化を確認するため)。
  await page.goto(APP_URL);
  await page.evaluate(() => localStorage.clear());
  await page.goto(APP_URL);
  await expect(page.getByText('今週のサボリスコア')).toBeVisible();
}

test.describe('TC-001 起動とホーム表示', () => {
  test('初回起動でホーム画面が表示される', async ({ page }) => {
    await gotoFreshHome(page);
    await expect(page.getByRole('heading', { level: 1 }).first()).toContainText('サボロー');
    await expect(page.getByTestId('weekly-score-value')).toHaveText('0');
    await expect(page.getByTestId('empty-state')).toBeVisible();
  });

  test('注目ランキングに5人(自分含む)が表示される', async ({ page }) => {
    await gotoFreshHome(page);
    const labels = page.getByText('サボリスコア');
    expect(await labels.count()).toBeGreaterThanOrEqual(3);
  });
});

test.describe('TC-002 ボトムナビゲーション', () => {
  test('ホーム → タスク → ランキング → マイページ → ホーム', async ({ page }) => {
    await gotoFreshHome(page);
    await page.getByTestId('nav-tasks').click();
    await expect(page).toHaveURL(/#\/tasks$/);
    await page.getByTestId('nav-ranking').click();
    await expect(page).toHaveURL(/#\/ranking$/);
    await expect(page.getByTestId('rank-tabs')).toBeVisible();
    await page.getByTestId('nav-me').click();
    await expect(page).toHaveURL(/#\/me$/);
    await page.getByTestId('nav-home').click();
    await expect(page).toHaveURL(/#\/home$/);
    await expect(page.getByText('今週のサボリスコア')).toBeVisible();
  });
});

test.describe('TC-003 タスク追加 → ② 不足情報', () => {
  test('AIで整理ボタンが空入力では押せない', async ({ page }) => {
    await gotoFreshHome(page);
    await page.getByTestId('nav-fab').click();
    await expect(page.getByTestId('input-task')).toBeVisible();
    await expect(page.getByTestId('ai-organize')).toBeDisabled();
  });

  test('一言入力 → AIで整理 → 不足情報チャットへ遷移しタイトル抽出', async ({ page }) => {
    await gotoFreshHome(page);
    await page.getByTestId('nav-fab').click();
    await page.getByTestId('input-task').fill('来週火曜までに営業資料を作る');
    await expect(page.getByTestId('ai-organize')).toBeEnabled();
    await page.getByTestId('ai-organize').click();
    await expect(page).toHaveURL(/#\/task\/info\//);
    await expect(page.getByTestId('task-title-pill')).toHaveText('営業資料');
    await expect(page.getByTestId('deadline')).toHaveValue(/.+/);
    await expect(page.getByTestId('hours')).toHaveValue('2.5');
    // チャットの吹き出しが4本(締切/関係者/まずさ/作業時間)出る
    await expect(page.getByText('締切はいつ?')).toBeVisible();
    await expect(page.getByText('関係者は誰かなぁ?')).toBeVisible();
    await expect(page.getByText('遅れたらどれくらいまずい?')).toBeVisible();
    await expect(page.getByText('作業時間はどれくらい?')).toBeVisible();
  });

  test('重要度トグルで選択状態が切り替わる', async ({ page }) => {
    await gotoFreshHome(page);
    await page.getByTestId('nav-fab').click();
    await page.getByTestId('input-task').fill('明日までに会議資料を作る');
    await page.getByTestId('ai-organize').click();
    await page.getByTestId('imp-high').click();
    await expect(page.getByTestId('imp-high')).toHaveClass(/on/);
    await expect(page.getByTestId('imp-mid')).not.toHaveClass(/on/);
  });
});

test.describe('TC-004 タスク定量化(レーダー & スコア)', () => {
  test('スコア・レーダーチャート・5軸の項目が表示される', async ({ page }) => {
    await gotoFreshHome(page);
    await page.getByTestId('nav-fab').click();
    await page.getByTestId('input-task').fill('明日までに営業資料を作る');
    await page.getByTestId('ai-organize').click();
    await page.getByTestId('next-info').click();

    await expect(page).toHaveURL(/#\/task\/quantify\//);
    await expect(page.getByTestId('radar')).toBeVisible();
    const total = await page.getByTestId('total-score').innerText();
    const score = parseInt(total, 10);
    expect(score).toBeGreaterThanOrEqual(20);
    expect(score).toBeLessThanOrEqual(100);

    const list = page.getByTestId('score-list');
    await expect(list).toContainText('タスク重さ');
    await expect(list).toContainText('心理抵抗');
    await expect(list).toContainText('逃げやすさ');
    await expect(list).toContainText('危険度');
    await expect(list).toContainText('作業量');
  });

  test('AIの理由が1件以上表示される', async ({ page }) => {
    await gotoFreshHome(page);
    await page.getByTestId('nav-fab').click();
    await page.getByTestId('input-task').fill('部長レビューの準備');
    await page.getByTestId('ai-organize').click();
    await page.getByTestId('next-info').click();
    const reasonsBox = page.getByTestId('reasons');
    await expect(reasonsBox).toBeVisible();
    const text = (await reasonsBox.innerText()).trim();
    expect(text.length).toBeGreaterThan(0);
  });
});

test.describe('TC-005 承認 → 登録 → 先延ばし提案', () => {
  test('登録するとタスクが永続化されて先延ばし提案へ遷移', async ({ page }) => {
    await gotoFreshHome(page);
    await page.getByTestId('nav-fab').click();
    await page.getByTestId('input-task').fill('明日までに営業資料を作る');
    await page.getByTestId('ai-organize').click();
    await page.getByTestId('next-info').click();
    await page.getByTestId('next-quantify').click();
    await expect(page.getByTestId('confirm-card')).toBeVisible();
    await expect(page.getByTestId('confirm-deadline')).toContainText(/\d+\/\d+/);

    await page.getByTestId('register').click();
    await expect(page).toHaveURL(/#\/task\/snooze\//);

    // localStorage に永続化されているか
    const tasksJson = await page.evaluate(() => JSON.stringify(window.__saboro__.Store.data.tasks));
    const tasks = JSON.parse(tasksJson);
    expect(tasks.filter((t: any) => t.id !== '_draft').length).toBe(1);
    expect(tasks.find((t: any) => t.id !== '_draft').status).toBe('sleeping');
  });

  test('先延ばし提案: おすすめ時間と理由が出る', async ({ page }) => {
    await gotoFreshHome(page);
    await registerTask(page, '明日までに営業資料を作る');
    await expect(page.getByTestId('snooze-card')).toBeVisible();
    const hoursText = await page.getByTestId('snooze-hours').innerText();
    expect(parseInt(hoursText, 10)).toBeGreaterThanOrEqual(0);
    const rows = page.getByTestId('snooze-reasons').locator('div');
    expect(await rows.count()).toBeGreaterThanOrEqual(3);
  });
});

test.describe('TC-006 寝かせる/今やる の分岐', () => {
  test('寝かせる → ホームに戻り、今日のタスクに新規が表示される', async ({ page }) => {
    await gotoFreshHome(page);
    await registerTask(page, '明日までに営業資料を作る');
    await page.getByTestId('snooze-it').click();
    await expect(page).toHaveURL(/#\/home$/);
    const rows = page.getByTestId('today-tasks').getByTestId('task-row');
    await expect(rows.first()).toBeVisible();
    await expect(rows.first()).toContainText('営業資料');
  });

  test('今やる → 本音 → 進む(view) のフロー', async ({ page }) => {
    await gotoFreshHome(page);
    await registerTask(page, '明日までに営業資料を作る');
    await page.getByTestId('do-it-now').click();
    await expect(page).toHaveURL(/#\/task\/honne\//);
    await page.getByTestId('honne-単純に嫌い').click();
    await expect(page.getByTestId('honne-単純に嫌い')).toHaveClass(/on/);
    await page.getByTestId('memo').fill('部長レビューが重い…');
    await expect(page.getByTestId('memo-count')).toHaveText('10/200');
    await page.getByTestId('next-honne').click();
    await expect(page).toHaveURL(/#\/task\/view\//);
    await expect(page.getByTestId('view-title')).toContainText('営業資料');
  });
});

test.describe('TC-007 タスク終了 → AIジャッジ', () => {
  test('ギリ生還で完了 → ジャッジ結果(badge / pt) が表示', async ({ page }) => {
    await gotoFreshHome(page);
    await registerTask(page, '明日までに会議資料を作る');
    await page.getByTestId('do-it-now').click();
    await page.getByTestId('next-honne').click();
    await page.getByTestId('goto-finish').click();
    await page.getByTestId('mode-giri').click();
    await page.getByTestId('judge-it').click();
    await expect(page).toHaveURL(/#\/task\/judge\//);
    const badge = await page.getByTestId('badge').innerText();
    expect(badge.length).toBeGreaterThan(0);
    const pts = await page.getByTestId('points').innerText();
    expect(parseInt(pts, 10)).toBeGreaterThan(0);
    await expect(page.getByTestId('consumed')).toContainText('%');
  });

  test('完了済みタスクはタスク一覧の完了済みセクションに入る', async ({ page }) => {
    await gotoFreshHome(page);
    await registerTask(page, '明日までに会議資料を作る');
    await page.getByTestId('do-it-now').click();
    await page.getByTestId('next-honne').click();
    await page.getByTestId('goto-finish').click();
    await page.getByTestId('mode-sabori').click();
    await page.getByTestId('judge-it').click();
    await page.getByTestId('back-home').click();
    await page.getByTestId('nav-tasks').click();
    await expect(page.locator('[data-testid="task-row-done"]').first()).toBeVisible();
  });
});

test.describe('TC-008 ホームのスコア反映', () => {
  test('ジャッジ完了後、今週のサボリスコアが0より大きくなる', async ({ page }) => {
    await gotoFreshHome(page);
    await registerTask(page, '明日までに会議資料を作る');
    await page.getByTestId('do-it-now').click();
    await page.getByTestId('next-honne').click();
    await page.getByTestId('goto-finish').click();
    await page.getByTestId('mode-giri').click();
    await page.getByTestId('judge-it').click();
    await page.getByTestId('back-home').click();
    const w = await page.getByTestId('weekly-score-value').innerText();
    expect(parseInt(w, 10)).toBeGreaterThan(0);
  });
});

test.describe('TC-009 ランキング画面', () => {
  test('自分が一覧に含まれ、タブを切り替えられる', async ({ page }) => {
    await gotoFreshHome(page);
    await page.getByTestId('nav-ranking').click();
    await expect(page.getByTestId('rank-tabs')).toBeVisible();
    // 「あなた」を含むランキング行が存在
    const myRow = page.getByTestId('rank-row').filter({ hasText: 'あなた' });
    await expect(myRow).toHaveCount(1);
    // タブ切替
    const giriTab = page.locator('button[data-tab="giri"]');
    await giriTab.click();
    await expect(giriTab).toHaveClass(/on/);
    const heavyTab = page.locator('button[data-tab="heavy"]');
    await heavyTab.click();
    await expect(heavyTab).toHaveClass(/on/);
  });
});

test.describe('TC-010 削除 / リセット', () => {
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

test.describe('TC-011 永続化 (リロード後も状態維持)', () => {
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
  await page.getByTestId('ai-organize').click();
  await page.getByTestId('next-info').click();
  await page.getByTestId('next-quantify').click();
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
