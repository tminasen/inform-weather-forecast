# inform-weather-forecast
inform discord about weather forecast

Cloud Scheduler が Cloud Run Jobs を起動し（毎日 07:30 JST に今日、21:30 JST に明日の天気）、Yahoo 天気を取得して Discord に通知する。
構築・デプロイ・ロールバックの手順は [deploy/cloud-run-jobs.md](deploy/cloud-run-jobs.md) を参照。

## 構成
- 定期実行: Cloud Scheduler → Cloud Run Jobs（`inform-weather-forecast`）。Job の引数（`today` / `tomorrow`）は Scheduler が渡す。
- デプロイ: `master` への push で `.github/workflows/deploy.yml` が、イメージのビルド・push、Job の更新、古いイメージの削除を行う。
- Artifact Registry には、**デプロイ中のイメージ 1 つだけ**を残す。ロールバックは、`git revert` と再デプロイで行う。

## 設定
`DISCORD_URL` / `DISCORD_MENTION` は Secret Manager（`discord-url` / `discord-mention`）に置き、Job の環境変数として渡す。
- `DISCORD_URL`（必須）: 通知先の Discord webhook URL
- `DISCORD_MENTION`（任意）: 通知に付けるメンション（例: `<@&123>`）。未設定ならメンションなし

## 実行（ローカル）
```
npm ci
npm run build
DISCORD_URL=... DISCORD_MENTION=... node dist/main.js today   # または tomorrow
```
予備として、Actions の `inform-weather` を `workflow_dispatch` で `target` を選んで手動実行できる（GitHub Actions の Repository secrets の `DISCORD_URL` / `DISCORD_MENTION` を使う）。

## 開発
- `.node-version` を上げるときは、`Dockerfile` のベースイメージ（`node:<版>-slim`）も一緒に上げる。
- `pull-request.yml` で lint・test・build に加え、actionlint・hadolint・docker build を実行する。

## 失敗時
- アプリの中で失敗したとき（取得や通知の失敗、不正な引数など）は、アプリが `DISCORD_MENTION` 付きで失敗通知を `DISCORD_URL` に送る。
- 天気・日付・気温がすべて取れないとき（ページの構造変更やメンテナンス中など）も、失敗として通知される（`weather data not found: ...`）。
- GitHub Actions で手動実行して、アプリの中で失敗した場合は、アプリの通知と workflow の通知（curl）の **2 通**が届く。手動実行は予備の手段で頻度が低いため、許容している。

### 通知されない失敗
Cloud Monitoring のアラートは追加していない。次の失敗は Discord に通知されない。天気予報が届かなかったら、「気づく方法」で確認する。

| 失敗の種類 | 気づく方法 |
|---|---|
| Scheduler から Job を起動できない（権限の不足、URI の誤り、API のエラー） | Scheduler のジョブの「最終実行の結果」と Cloud Logging の `cloud_scheduler_job` ログ |
| コンテナが起動しない（イメージの pull 失敗、アーキテクチャの不一致、起動前のクラッシュ） | Cloud Run の Job の実行履歴（失敗した execution）とログ |
| Secret が読めない（実行用 SA の権限の不足、Secret やバージョンの削除） | 同上 |
| task-timeout（300 秒）を超えた | 同上（execution の状態が timeout になる） |
| OOM（メモリ不足） | 同上 |
| `DISCORD_URL` が未設定、または Webhook の URL が無効 | 同上（`DISCORD_URL is not set`、通知失敗のログ） |
| Discord 側の障害 | 同上（通知失敗のログ） |
| 天気のページから一部の項目だけ取れない（例: 天気は取れるが気温や指数が取れない、日付だけ取れない）。失敗とは扱わず、取れた項目だけで通知される | Discord の通知で項目が欠けている、またはタイトルが `"undefinedの天気"` になっている。Cloud Logging の `request param:` ログで送った内容を確かめられる |
