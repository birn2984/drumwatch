# DrumWatch

2人暮らし向けドラム式洗濯乾燥機の、個人用価格追跡MVPです。静的フロントエンドとJSONだけで動き、GitHub Pagesに公開できます。

## ローカル起動

```bash
npm install
npm run prices:generate
npm run dev
```

ローカル開発サーバーでは `http://localhost:3000/drumwatch/` を開きます。

価格APIが未設定でも、空の価格履歴で表示されます。

## データを編集する場所

- `data/products.json`: 製品スペック・追跡対象
- `data/price-history.json`: 取得済みの最安価格履歴
- `lib/price-utils.ts`: 買い時判定と集計ルール

`products.json` は、型番ごとに `familyId`、`doorDirection`、`monitorEnabled`、`tags` を持ちます。寸法は `dimensions.measurement` と一緒に保存し、ホースを含む総外形寸法と本体寸法を混同しません。`janCode`、自動投入、発売年、消費電力量など、メーカー公式で確認できない値は `null` を許容します。

`monitorEnabled: false` にすると価格履歴を消さずに、その型番の次回以降の検索だけを停止できます。

送料は `included`（込み）/ `excluded`（別）/ `unknown`（不明）で記録します。更新処理は、送料込みの候補があればその中の最安、なければ送料状態を明記した候補の最安を保存します。

## GitHub Pages

1. GitHubにリポジトリを作り、`main` ブランチへpushします。
2. リポジトリの **Settings → Pages → Build and deployment** で **GitHub Actions** を選びます。
3. `deploy-pages.yml` が完了すると、`https://birn2984.github.io/drumwatch/` で公開されます。

## ローカルでの価格API試験（推奨）

1. `.env.example` をコピーして `.env.local` を作ります。
2. `.env.local` の右辺だけに、取得したAPIキーを貼り付けます。
3. `npm run prices:preview` を実行します。

`.env.local` はGit管理対象外です。プレビューは価格履歴も表示用JSONも変更しません。`npm run prices`も同じプレビューの互換コマンドです。

## GitHub Actions用の価格API設定

GitHubリポジトリの **Settings → Secrets and variables → Actions** に次を追加します。

- `YAHOO_APP_ID`: Yahoo!ショッピング商品検索APIのアプリケーションID
- `RAKUTEN_APPLICATION_ID`: 楽天市場商品検索APIのアプリケーションID
- `RAKUTEN_ACCESS_KEY`: 楽天市場商品検索APIのAccess Key

楽天は現行API仕様に合わせ、Application IDをクエリ、Access Keyを`accessKey` HTTPヘッダーで送ります。登録後、Actionsの **Update price history** を手動実行して確認できます。いずれかの認証情報が未設定の販売元はスキップされ、既存の履歴は消えません。

価格更新は現時点では手動実行のみです。日次自動更新は、実APIの確認後に別途有効化します。

## 取得プレビュー

`npm run prices:preview` は完全なdry-runです。検索結果の上位5件を型番、商品状態、送料、照合理由、`wouldSelect`とともに表示し、最後に販売元ごとの判定数を集計します。価格履歴・表示用JSON・Gitは変更しません。`npm run prices`も同じプレビューの互換コマンドです。本番の履歴追記は `npm run prices:update` です。どちらもYahoo!は1.1秒以上、楽天も同じ間隔で直列に検索します。

## 現在の制限

- JANコード（任意）を優先検索し、型番の表記揺れを正規化して照合します。型番が一致しない候補、関連部品、前回価格から50%超変動する候補は履歴へ保存しません。
- ポイント還元、設置費用、延長保証、地域別送料は価格に含めません。
- サンプルの製品情報と価格履歴はUI確認用です。購入前にはメーカー・販売店の最新情報を確認してください。
