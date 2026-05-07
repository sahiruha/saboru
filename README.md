# サボロー

> タスクを早く終わらせる時代に、あえて **“先延ばし力”** を競うアプリ。
> ギリギリまで寝かせて、最後に間に合わせる人こそ偉い。

- 🔗 本番: <https://saboro.pages.dev>
- 📐 デザインモックアップ集: <https://saboro.pages.dev/mockup.html>
- 📦 コード: 単一HTML/CSS/JS、ビルド不要。永続化は `localStorage` のみ。
- 🧪 E2E: Playwright (Chromium) ・ ローカル & 本番ともに通る構成。
- 🎯 スコープ: **MVP**。`kikaku.md` 9章の 7 機能のみ実装。

## MVP 範囲

| # | MVP 機能 | 画面 |
| - | -------- | ---- |
| 1 | タスク入力                | タスク追加(入力 + 4項目を1画面で編集) |
| 2 | AIによるタスク定量化      | 定量化(レーダー / 5軸スコア / AIの理由) |
| 3 | 先延ばしアドバイス生成    | 先延ばし提案(おすすめ時間 + 寝かせる/今やる) |
| 4 | タスク終了ボタン          | タスク終了(3モードの選択) |
| 5 | AIジャッジ                | AIジャッジ(バッジ / 獲得pt) |
| 6 | サボりスコア算出          | ホームの今週スコア |
| 7 | ランキング表示            | ランキング |

非 MVP(モックアップ集 `mockup.html` で温存): 不足情報チャット / 承認画面 / 本音(取扱説明書)。

## 構成

```
.
├── index.html              # SPA 本体
├── app.js                  # ルーター / Store / Mock AI / MVP の全画面
├── app.css                 # 端末フレームと共通トークン
├── mockup.html             # 10画面モックアップ集 (リファレンス、デプロイ対象)
├── concept.md / kikaku.md  # 企画ドキュメント
├── package.json            # Playwright のみ devDependency
├── playwright.config.ts
└── tests/
    ├── e2e/saboro.spec.ts  # 21 ケース、MVP 7機能トレーサビリティ付き
    └── test-spec.md        # E2E テスト仕様書
```

## 開発

```sh
# 依存(Playwrightのみ)を入れる
npm install
npx playwright install chromium

# ローカル起動
npm run start                # http://localhost:4789/
```

## E2E テスト

```sh
npm test                     # ローカル(自動でhttp.server起動)
npm run test:remote          # 本番URL(Cloudflare Pages)に対して実行
npm run test:headed          # ブラウザを開いて実行
npm run test:ui              # Playwright UI モード
npm run test:report          # 直近実行のHTMLレポートを開く
```

詳細は [`tests/test-spec.md`](tests/test-spec.md)。

## デプロイ

Cloudflare Pages (静的、CDN配信)。

```sh
npm run build                # dist/ を生成 (index.html / mockup.html / app.css / app.js / _headers)
npm run deploy               # wrangler pages deploy で本番反映
```

## アーキテクチャ (要約)

| 層 | 技術 | 責務 |
| --- | --- | --- |
| UI | vanilla JS + Tailwind CDN | 10画面、ハッシュルーティング |
| 状態 | `localStorage` (`saboro:v1`) | タスク・スコア・本音メモ |
| AI | `app.js` 内のモック関数 | `parseInput`/`score`/`suggestSnooze`/`judge` |
| テスト | Playwright (Chromium) | 19ケース × 2プロファイル = 38 |
| 配信 | Cloudflare Pages | 静的アセットのみ |

XSS 防御: テンプレ内の全ユーザー値を `esc()` でエスケープし、DOM 反映は `Range.createContextualFragment` 経由 (innerHTML 直書きなし)。

## ライセンス

MVP / プロトタイプにつき特に指定なし。
