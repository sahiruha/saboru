# サボロー E2E テスト仕様書

| 項目     | 内容                                                            |
| -------- | --------------------------------------------------------------- |
| 製品名   | サボロー (Saboro) v1.0.0                                        |
| 対象     | Web版 SPA (`index.html` + `app.js` + `app.css`)                 |
| テスト種別 | エンドツーエンド (E2E) ・ ブラックボックス                        |
| 実行ツール | Playwright 1.59 (Chromium)                                     |
| 仕様書版 | 2026-05-08 v1                                                  |
| 作成者   | サボロー開発チーム                                              |

## 1. 目的

`mockup.html` で示した10画面のUI仕様と、`concept.md` / `kikaku.md` に記された MVP 機能要件 (タスク入力 → AI定量化 → 承認 → 先延ばし支援 → タスク終了 → AIジャッジ → サボリスコア → ランキング) が、**Web上で結線済みかつ通しで動作する** ことを E2E で保証する。

## 2. テスト対象範囲

| 機能領域       | テスト対象                                                        | 範囲   |
| -------------- | ----------------------------------------------------------------- | ------ |
| 起動・ホーム表示 | 初回起動の状態、サボリスコア・タスク一覧・ランキング初期描画      | ✅ in  |
| ナビゲーション | ボトムナビ4タブ + FAB                                              | ✅ in  |
| タスク追加     | 一言入力、AIで整理ボタン押下、タイトル抽出                          | ✅ in  |
| 不足情報チャット | 締切/関係者/まずさ/作業時間 4項目の入力UI、状態保存                 | ✅ in  |
| 定量化         | 5軸スコア、レーダーチャート描画、AIの理由提示                      | ✅ in  |
| 承認 → 登録    | 内容確認カード、永続化、先延ばし提案画面遷移                        | ✅ in  |
| 先延ばし提案   | おすすめサボり時間、理由3件、寝かせる/今やるの分岐                  | ✅ in  |
| 本音入力       | 5択チェック、許容/不許容、200字メモのカウンタ                       | ✅ in  |
| タスク終了     | 3モード選択 (サボり切った/ギリ生還/まだ寝かせる)                    | ✅ in  |
| AIジャッジ     | バッジ・獲得pt・締切消費率の表示と一貫性                            | ✅ in  |
| ランキング     | 自分の順位表示、3タブの切替                                          | ✅ in  |
| マイページ     | リセット機能                                                       | ✅ in  |
| 永続化         | localStorage 経由、リロード耐性                                    | ✅ in  |
| 認証 / SNS共有 | (未実装、PMF後の展望)                                              | ❌ out |
| Slack/Notion連携 | (未実装、PMF後の展望)                                            | ❌ out |

## 3. 環境

- ブラウザ: Chromium (Playwright同梱、`@playwright/test 1.59`)
- viewport: `iPhone 12` 相当 (390 × 844) ・ `Desktop-Chromium` (480 × 900) の2プロファイル
- ロケール / タイムゾーン: `ja-JP` / `Asia/Tokyo`
- アプリホスティング: ローカル `python3 -m http.server 4789`
- 起動方法: `npm test` (Playwright config の `webServer` が自動起動)

## 4. 前提条件

- Node.js >= 20、Python 3 が利用可能
- `npm install` 済み
- `npx playwright install chromium` 済み
- 各テストは **独立** に実行できる。`page.addInitScript` で `localStorage.clear()` を呼んで初期状態にする。

## 5. データ永続化モデル (テスト観点)

| キー | 保存場所 | 型 / 形式 | 説明 |
| ---- | -------- | --------- | ---- |
| `saboro:v1` | `localStorage` | JSON (`{user, tasks[], others[], lastWeekScore}`) | サボロー全アプリ状態 |

`window.__saboro__.Store` を経由して直接参照可能。

## 6. テストケース一覧

各テストケースは `tests/e2e/saboro.spec.ts` に実装。テストID は `TC-NNN`、Playwright の `test.describe` ブロックと 1:1 対応。

| TC-ID | グループ | テスト | 目的 |
| ----- | -------- | ------ | ---- |
| TC-001-01 | 起動とホーム表示 | 初回起動でホーム画面が表示される | 初期スコア=0/空状態 |
| TC-001-02 | 〃               | 注目ランキングに5人(自分含む)が表示される | seed の他ユーザー描画 |
| TC-002-01 | ボトムナビ      | ホーム→タスク→ランキング→マイページ→ホーム | ハッシュルーター結線 |
| TC-003-01 | タスク追加      | 空入力ではAI整理ボタンが押せない | 入力バリデーション |
| TC-003-02 | 〃              | 一言入力 → タイトル抽出 → 不足情報遷移 | AI parse 統合 |
| TC-003-03 | 〃              | 重要度トグルで状態が切り替わる | UI state |
| TC-004-01 | 定量化          | スコア・レーダー・5軸が出る | スコアリング |
| TC-004-02 | 〃              | AIの理由が1件以上出る | 理由生成ロジック |
| TC-005-01 | 承認 → 登録     | 登録でタスクが永続化、先延ばし遷移 | localStorage反映 |
| TC-005-02 | 〃              | おすすめサボり時間と理由 | 先延ばしAI |
| TC-006-01 | 寝かせる/今やる | 寝かせる → ホームに新規タスク表示 | 状態 sleeping |
| TC-006-02 | 〃              | 今やる → 本音 → view へ | 状態 in_progress / honne保存 |
| TC-007-01 | タスク終了      | ギリ生還 → ジャッジ表示 | judge ロジック |
| TC-007-02 | 〃              | サボり切った → 完了済みリストへ | task list 切り分け |
| TC-008-01 | スコア反映      | 今週のサボリスコアが増える | weeklyScore() |
| TC-009-01 | ランキング      | 自分が含まれ、3タブ切替できる | ranking UI |
| TC-010-01 | リセット        | マイページの一括リセット | Store.reset() |
| TC-010-02 | 〃              | タスク詳細から削除 | Store.deleteTask() |
| TC-011-01 | 永続化          | リロードしてもタスクが残る | localStorage |

合計 **19 テストケース** ・ 2 プロファイル (iPhone-12-mobile / Desktop-Chromium) で **38 テスト** 実行。

最新実行結果:

| 環境 | URL | 結果 | 実行時間 |
| ---- | --- | ---- | -------- |
| ローカル | `http://localhost:4789` | ✅ 38 passed (0 failed) | 約 2 分 |
| Cloudflare Pages 本番 | `https://saboro.pages.dev` | ✅ 38 passed (0 failed) | 約 2.5 分 |

リモート実行は `npm run test:remote` または `E2E_BASE_URL=https://saboro.pages.dev npx playwright test`。
ローカル実行と完全同一テストコードで通っているため、デプロイ時の挙動差異は無い。

## 7. テストケース詳細

### TC-003-02: 一言入力 → AIで整理 → 不足情報チャットへ遷移しタイトル抽出

| 項目 | 内容 |
| ---- | ---- |
| 前提 | ホーム画面表示中 |
| 手順 | 1. FAB を押す<br>2. 一言入力に「来週火曜までに営業資料を作る」を入力<br>3. 「AIで整理する」ボタンを押す |
| 期待結果 | URL が `#/task/info/_draft` に遷移<br>タイトルピルが「営業資料」と表示<br>締切入力に値、作業時間に `2.5` がセット<br>サボローの吹き出しが4本(締切/関係者/まずさ/作業時間)出ている |
| 関連要件 | 企画書 6.Step1, AI.parseInput / AI.guessTitle |

### TC-005-01: 登録するとタスクが永続化されて先延ばし提案へ遷移

| 項目 | 内容 |
| ---- | ---- |
| 前提 | 不足情報を埋めて定量化画面に到達 |
| 手順 | 1. 「この内容で進む」(定量化) を押す<br>2. 「この内容で登録」を押す |
| 期待結果 | URL が `#/task/snooze/<実ID>` に遷移<br>`localStorage` の `saboro:v1.tasks` に `_draft` 以外のタスクが1件存在<br>`status === 'sleeping'` |
| 関連要件 | 企画書 6.Step3-5 |

### TC-007-01: ギリ生還で完了 → ジャッジ結果が表示

| 項目 | 内容 |
| ---- | ---- |
| 前提 | タスク登録 → 今やる → 本音保存 → タスクviewに到達 |
| 手順 | 1. 「完了報告へ」を押す<br>2. 「ギリ生還」モードを選ぶ<br>3. 「ジャッジを見る」を押す |
| 期待結果 | URL が `#/task/judge/<ID>` に遷移<br>バッジ名(例:ギリギリ職人)が表示<br>獲得pt > 0<br>締切消費 (`%`) 表記が表示 |
| 関連要件 | 企画書 6.Step7-8, AI.judge |

### TC-011-01: リロードしてもタスクが消えない

| 項目 | 内容 |
| ---- | ---- |
| 前提 | タスクを1件登録、寝かせる選択でホームへ |
| 手順 | 1. ブラウザリロード |
| 期待結果 | 今日のタスク一覧に1件以上の `task-row` が表示 |
| 関連要件 | localStorage 永続化要件 |

## 8. データテストID 一覧 (主要なもの)

| testid | 役割 |
| ------ | ---- |
| `nav-home` / `nav-tasks` / `nav-ranking` / `nav-me` / `nav-fab` | ボトムナビ |
| `weekly-score-value` | 今週のサボリスコア表示 |
| `today-tasks` / `task-row` / `task-row-done` | タスク行 |
| `empty-state` | 空状態カード |
| `input-task` | タスク追加の textarea |
| `ai-organize` / `manual-add` | 追加ボタン |
| `task-title-pill` | チャットヘッダのタイトル表示 |
| `deadline` / `stakeholders` / `hours` / `imp-low/mid/high` | 不足情報入力 |
| `next-info` / `next-quantify` / `redo-quantify` | 進む/見直す |
| `radar` / `total-score` / `score-list` / `reasons` | 定量化UI |
| `confirm-card` / `confirm-deadline` / `register` / `brushup` | 承認画面 |
| `snooze-card` / `snooze-hours` / `snooze-reasons` / `snooze-it` / `do-it-now` | 先延ばし提案 |
| `honne-<理由>` / `allow-yes` / `allow-no` / `memo` / `memo-count` / `next-honne` | 本音入力 |
| `view-title` / `goto-snooze` / `goto-finish` / `delete-task` | タスクビュー |
| `mode-giri` / `mode-sabori` / `mode-still` / `judge-it` | タスク終了 |
| `badge` / `points` / `consumed` / `judge-comment` / `back-home` | AIジャッジ |
| `rank-tabs` / `rank-list` / `rank-row` / `my-score` | ランキング |
| `reset-btn` | マイページのリセットボタン |

## 9. 合否判定基準

- **合格**: 全プロファイル × 全テストケースが pass。
- **要修正**: 1件以上 fail。HTML レポート (`tests/.report/index.html`) の trace と screenshot で原因特定し修正。

## 10. 既知の制約 / 非機能観点

- AI 部分はすべてモック (決定的)。実 LLM 連携は MVP 範囲外。
- 認証 / マルチユーザー / Slack 等の外部連携は MVP 範囲外。
- アクセシビリティ (キーボード操作、コントラスト) は別途 a11y 監査で扱う。
- パフォーマンス測定は本仕様では取り扱わない。

## 11. 実行コマンド

```sh
npm install
npx playwright install chromium
npm test                    # ローカル(http.server) でヘッドレス実行
npm run test:remote         # Cloudflare Pages 本番(https://saboro.pages.dev) で実行
npm run test:headed         # ブラウザを開いて実行
npm run test:ui             # Playwright UI モード
npm run test:report         # HTML レポートを表示
npm run build               # dist/ を生成
npm run deploy              # build → wrangler で Cloudflare Pages にデプロイ
```

## 12. 変更履歴

| 日付 | 版 | 変更点 |
| ---- | -- | ------ |
| 2026-05-08 | v1 | 初版。MVP 10画面 18 ケース x 2 プロファイル分の網羅 |
