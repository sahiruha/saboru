# サボロー E2E テスト仕様書 (MVP)

| 項目     | 内容                                                            |
| -------- | --------------------------------------------------------------- |
| 製品名   | サボロー (Saboro) v1.0.0 — **MVP**                              |
| 対象     | Web版 SPA (`index.html` + `app.js` + `app.css`)                 |
| テスト種別 | エンドツーエンド (E2E) ・ ブラックボックス                        |
| 実行ツール | Playwright (Chromium)                                          |
| 仕様書版 | 2026-05-08 v2 (MVP に再構成)                                    |
| 作成者   | サボロー開発チーム                                              |

## 1. 目的

`kikaku.md` 9 章に定義された **MVP 7 機能**(下表)を網羅的に E2E で検証する。

| # | MVP 機能 | 該当画面 |
| - | -------- | -------- |
| 1 | タスク入力                | タスク追加(入力 + 4項目編集) |
| 2 | AIによるタスク定量化      | 定量化(レーダー / 5軸 / 理由) |
| 3 | 先延ばしアドバイス生成    | 先延ばし提案(おすすめ時間 + 理由) |
| 4 | タスク終了ボタン          | タスク終了(モード選択) |
| 5 | AIジャッジ                | AIジャッジ(バッジ / pt) |
| 6 | サボりスコア算出          | ホーム(週次スコア) |
| 7 | ランキング表示            | ランキング |

非 MVP 機能 (PMF後の展望) は実装しない:
- ❌ Slack / Notion / Calendar 連携
- ❌ 「自分の取扱説明書」を作るための本音 / A/B テスト
- ❌ 完全自動タスク収集
- ❌ 不足情報チャット形式の往復(タスク追加内のフォームに統合)
- ❌ 承認画面(定量化画面に登録ボタンを統合)

## 2. テスト対象範囲

| 領域           | テスト対象                                       | 範囲   |
| -------------- | ------------------------------------------------ | ------ |
| 起動・ホーム   | 初期スコア / タスク一覧 / ランキング初期描画     | ✅ in  |
| ナビゲーション | ボトムナビ4タブ + FAB                            | ✅ in  |
| タスク入力     | 一言入力 → AI推定 → タイトル/締切/関係者/重要度/作業時間 編集 | ✅ in (MVP #1) |
| 定量化         | 5軸スコア・レーダー・AIの理由・登録              | ✅ in (MVP #2) |
| 先延ばし提案   | おすすめ時間・理由・寝かせる/今やる              | ✅ in (MVP #3) |
| タスク終了     | 3モード(サボり切った/ギリ生還/まだ寝かせる)      | ✅ in (MVP #4) |
| AIジャッジ     | バッジ・獲得pt・締切消費率                       | ✅ in (MVP #5) |
| サボりスコア   | 週次スコアの集計とホーム反映                     | ✅ in (MVP #6) |
| ランキング     | 自分含む順位、得点反映後の更新                   | ✅ in (MVP #7) |
| 永続化         | localStorage、リロード耐性                       | ✅ in  |
| リセット/削除  | マイページ・タスク削除                           | ✅ in  |

## 3. 環境

- ブラウザ: Chromium (Playwright 同梱)
- プロファイル: `iPhone 12` 互換 (390 × 844, mobile, Chromium engine) と `Desktop-Chromium` (480 × 900)
- ロケール / タイムゾーン: `ja-JP` / `Asia/Tokyo`
- ホスティング:
  - ローカル: `python3 -m http.server 4789` (Playwright `webServer` で自動起動)
  - 本番: Cloudflare Pages (`https://saboro.pages.dev`)

## 4. 前提条件

- Node.js >= 20、Python 3
- `npm install` 済み
- `npx playwright install chromium` 済み
- 各テストは独立。`gotoFreshHome` で `localStorage.clear()` 後に再 goto して初期状態へ戻す。

## 5. データモデル

| キー | 保存場所 | 内容 |
| ---- | -------- | ---- |
| `saboro:v1` | `localStorage` | `{user, tasks[], others[], lastWeekScore}` の単一 JSON |

## 6. テストケース一覧

| TC-ID | 範囲 | テスト | MVP # |
| ----- | ---- | ------ | ----- |
| TC-001-01 | ホーム表示 | 初回起動でホーム画面が表示される | (基本) |
| TC-001-02 | ホーム表示 | 注目ランキングに自分含む行が表示される | (基本) |
| TC-002-01 | ナビ      | 4タブを順に遷移できる | (基本) |
| TC-003-01 | タスク入力 | FAB でタスク追加画面に遷移 | **#1** |
| TC-003-02 | タスク入力 | AIで埋める → 4項目に推定値が入る | **#1** |
| TC-003-03 | タスク入力 | タイトル空のときは「定量化する」が押せない | **#1** |
| TC-003-04 | タスク入力 | 重要度トグルで状態が切り替わる | **#1** |
| TC-004-01 | 定量化   | 5軸/レーダー/AIの理由が表示される | **#2** |
| TC-004-02 | 定量化   | 「やり直す」で追加画面に戻れる | **#2** |
| TC-005-01 | 登録 → 先延ばし | 登録で永続化、先延ばし提案へ | **#3** |
| TC-005-02 | 登録 → 先延ばし | 先延ばしの理由が出る | **#3** |
| TC-006-01 | 寝かせる/今やる | 寝かせる → ホームに新規が出る | **#3** |
| TC-006-02 | 寝かせる/今やる | 今やる → タスクビュー | **#3** |
| TC-007-01 | 完了 → ジャッジ | ギリ生還 → ジャッジ表示 | **#4 / #5** |
| TC-007-02 | 完了 → ジャッジ | 完了済みリストに入る | **#4** |
| TC-007-03 | 完了 → ジャッジ | ホームの今週スコアが増える | **#6** |
| TC-008-01 | ランキング | 自分が一覧に含まれる | **#7** |
| TC-008-02 | ランキング | 得点反映で my-score が増える | **#6 / #7** |
| TC-009-01 | リセット | マイページの一括リセット | (運用) |
| TC-009-02 | リセット | タスクビューから削除 | (運用) |
| TC-010-01 | 永続化   | リロードしても残る | (基本) |

合計 **21 テストケース** ・ 2 プロファイルで **42 テスト** 実行。

## 7. 主要 testid

| testid | 役割 |
| ------ | ---- |
| `nav-home` / `nav-tasks` / `nav-ranking` / `nav-me` / `nav-fab` | ボトムナビ |
| `weekly-score-value` | 今週のサボリスコア |
| `today-tasks` / `task-row` / `task-row-done` | タスク行 |
| `empty-state` | 空状態カード |
| `input-task` / `ai-fill` | タスク追加: 一言入力 + AI 補完 |
| `title` / `deadline` / `stakeholders` / `imp-low/mid/high` / `hours` | タスク追加: 4項目編集 |
| `next` / `redo` | 定量化への遷移 / やり直し |
| `radar` / `total-score` / `score-list` / `reasons` / `register` | 定量化UI |
| `snooze-card` / `snooze-hours` / `snooze-reasons` / `snooze-it` / `do-it-now` | 先延ばし提案 |
| `view-title` / `goto-snooze` / `goto-finish` / `delete-task` | タスクビュー |
| `mode-giri` / `mode-sabori` / `mode-still` / `judge-it` | タスク終了 |
| `badge` / `points` / `consumed` / `judge-comment` / `back-home` | AIジャッジ |
| `rank-list` / `rank-row` / `my-score` | ランキング |
| `reset-btn` | リセット |

## 8. 合否判定

- **合格**: 全プロファイル × 全テストケースが pass。
- **要修正**: 1件以上 fail。HTML レポート (`tests/.report/index.html`) の trace と screenshot で原因特定。

## 9. 最新実行結果

| 環境 | URL | 結果 |
| ---- | --- | ---- |
| ローカル | `http://localhost:4789` | (`npm test` で常時更新) |
| Cloudflare Pages 本番 | `https://saboro.pages.dev` | (`npm run test:remote` で常時更新) |

## 10. 実行コマンド

```sh
npm install
npx playwright install chromium
npm test                    # ローカル(http.server) でヘッドレス
npm run test:remote         # Cloudflare Pages 本番に対して
npm run test:headed         # ブラウザを開いて
npm run test:ui             # Playwright UI モード
npm run test:report         # HTML レポートを表示
npm run build               # dist/ を生成
npm run deploy              # Cloudflare Pages へ反映
```

## 11. 変更履歴

| 日付       | 版 | 変更点 |
| ---------- | -- | ------ |
| 2026-05-08 | v1 | 初版。10画面 19ケース x 2プロファイル |
| 2026-05-08 | v2 | MVP に絞って画面を再構成(チャット/承認/本音を削除)。21ケース x 2プロファイルに更新 |
