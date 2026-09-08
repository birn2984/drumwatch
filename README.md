# DrumWatch

2人暮らし向けドラム式洗濯乾燥機の、個人用価格追跡MVPです。静的フロントエンドとJSONだけで動き、GitHub Pagesに公開できます。

## ローカル起動

```bash
npm install
npm run prices:generate
npm run dev
```

価格APIが未設定でも、`data/price-history.json` のサンプル履歴で表示されます。

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
3. `deploy-pages.yml` が完了すると公開されます。プロジェクトページ用のパスはWorkflowが自動設定します。

## 価格APIの設定

GitHubリポジトリの **Settings → Secrets and variables → Actions** に次を追加します。

- `YAHOO_APP_ID`: Yahoo!ショッピング商品検索APIのアプリケーションID
- `RAKUTEN_APPLICATION_ID`: 楽天市場商品検索APIのアプリケーションID
- `RAKUTEN_ACCESS_KEY`: 楽天市場商品検索APIのAccess Key

楽天は現行API仕様に合わせ、Application IDをクエリ、Access Keyを`accessKey` HTTPヘッダーで送ります。登録後、Actionsの **Update price history** を手動実行して確認できます。いずれかの認証情報が未設定の販売元はスキップされ、既存の履歴は消えません。

毎日の自動更新は、日本時間の朝7時（GitHub Actions cronの都合で多少の遅延あり）です。

## 現在の制限

- JANコード（任意）を優先検索し、型番の表記揺れを正規化して照合します。型番が一致しない候補、関連部品、前回価格から50%超変動する候補は履歴へ保存しません。
- ポイント還元、設置費用、延長保証、地域別送料は価格に含めません。
- サンプルの製品情報と価格履歴はUI確認用です。購入前にはメーカー・販売店の最新情報を確認してください。
