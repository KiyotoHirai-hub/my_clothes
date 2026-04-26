# Vercel デプロイ手順書

## ファイル構成

```
wardrobe/
├── api/
│   └── weather.js      # Vercel Serverless Function（天気取得）
├── index.html          # 一覧ページ
├── detail.html         # 詳細ページ
├── style.css           # スタイル
├── app.js              # 共通ロジック（データ管理・CSV・天気）
├── detail.js           # 詳細ページ専用ロジック
├── vercel.json         # Vercel ルーティング設定
├── package.json        # Node.js バージョン指定
├── .gitignore
└── DEPLOY.md           # 本ファイル
```

---

## Step 1 — GitHub リポジトリを作る

```bash
# WSL 上で実行
cd ~/path/to/wardrobe   # このフォルダに移動

git init
git add .
git commit -m "first commit"
```

GitHub で新しいリポジトリを作成（例: `my-wardrobe`）してから:

```bash
git remote add origin https://github.com/あなたのユーザー名/my-wardrobe.git
git branch -M main
git push -u origin main
```

---

## Step 2 — Vercel アカウントを作る

1. https://vercel.com にアクセス
2. 「Sign Up」→「Continue with GitHub」でGitHubアカウントと連携

---

## Step 3 — Vercel にデプロイする

1. Vercelダッシュボードで「Add New... → Project」
2. GitHubのリポジトリ一覧から `my-wardrobe` を選んで「Import」
3. 設定はすべてデフォルトのままで「Deploy」をクリック
4. 1〜2分でデプロイ完了 → URLが発行される（例: `https://my-wardrobe.vercel.app`）

---

## Step 4 — スマホから使う

発行されたURL（`https://my-wardrobe.vercel.app`）をスマホのブラウザで開く。

ホーム画面に追加するとアプリのように使える:
- **iPhone**: Safari で開く → 共有ボタン →「ホーム画面に追加」
- **Android**: Chrome で開く → メニュー →「ホーム画面に追加」

---

## Step 5 — コードを更新してデプロイする（日常の流れ）

```bash
# ファイルを編集したあと
git add .
git commit -m "変更内容のメモ"
git push
```

GitHub にプッシュすると **Vercel が自動で再デプロイ**する（約1分）。

---

## CSVインポートの使い方

ヘッダー付きCSV（UTF-8）を用意してアプリ上の「📥 CSV」ボタンから読み込む。

**CSVフォーマット:**

```csv
name,brand,category,color,season,count
Active Jacket,Carhartt,ジャケット,brown,winter,0
G-1 Flight Jacket,USN,ジャケット,brown,winter,3
```

| 列 | 必須 | 説明 |
|----|------|------|
| name | ✅ | アイテム名 |
| brand | | ブランド名 |
| category | | ジャケット / アウター / パーカー / スウェット / シャツ / ニット / ベスト / パンツ / シューズ / バッグ / アクセサリー / その他 |
| color | | カラー |
| season | | winter / spring / summer / all（省略時はカテゴリから自動推定） |
| count | | 着用回数（省略時は 0） |

**重複の扱い（インポート時に選択）:**
- スキップ: 同名・同ブランドのアイテムはそのまま
- 上書き: カテゴリ・カラー・季節のみ更新（着用回数・写真は維持）
- 追加: 重複でも新しいアイテムとして追加

---

## データについて

- データはスマホ・ブラウザの **localStorage** に保存される
- Vercel サーバーにはデータは送られない（天気取得のみサーバーを使う）
- ブラウザのキャッシュをクリアするとデータが消えるので注意
- 複数デバイス間でデータは同期されない（スマホとPCは別々）

### データのバックアップ方法

ブラウザの開発者ツール（F12）→ コンソールで以下を実行するとJSONが表示される:

```js
console.log(localStorage.getItem('wardrobe_v3'));
```

これをコピーしてテキストファイルに保存しておくとバックアップになる。

---

## トラブルシューティング

| 症状 | 対処 |
|------|------|
| 天気が表示されない | Open-Meteo APIの一時障害。しばらく待つと回復する |
| アイテムが消えた | ブラウザキャッシュをクリアした可能性あり。上記バックアップ方法を事前に実施 |
| デプロイが失敗する | Vercelダッシュボードの「Deployments」でエラーログを確認 |
| CSVが読み込まれない | ファイルの文字コードがUTF-8か確認。Excelで保存する場合「CSV UTF-8（コンマ区切り）」を選ぶ |
