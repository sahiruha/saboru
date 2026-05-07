# サボロー

> タスクを早く終わらせる時代に、あえて **“先延ばし力”** を競うアプリ。
> ギリギリまで寝かせて、最後に間に合わせる人こそ偉い。

- 🔗 本番: <https://saboro.pages.dev>
- 📐 デザインモックアップ集: <https://saboro.pages.dev/mockup.html>
- 📦 コード: 単一HTML/CSS/JS、ビルド不要。永続化は `localStorage` のみ。
- ✅ E2E: Playwright (Chromium) で **38 件**、ローカル & 本番ともに pass。

## 構成

```
.
├── index.html          # SPA 本体
├── app.js              # ルーター / Store / Mock AI / 全画面ビュー
├── app.css             # 端末フレームと共通トークン
├── mockup.html         # 10画面モックアップ集 (リファレンス)
├── concept.md / kikaku.md  # 企画ドキュメント
├── package.json        # Playwright のみ devDependency
├── playwright.config.ts
└── tests/
    ├── e2e/saboro.spec.ts   # 19 ケース
    └── test-spec.md         # E2E テスト仕様書
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
