# Cloud Run Jobs + Cloud Scheduler への移行手順書

inform-weather-forecast の定期実行を、GitHub Actions の schedule から Cloud Run Jobs + Cloud Scheduler に移すための手順書。
**ここに書いた GCP / GitHub の操作は、人間が実行する。**

- GCP 側の構築（章 1〜9）→ 並行稼働（章 10）→ ルールセットの設定（章 11）→ マージ（章 12）の順に進める。
- マージ前に Job を手動で作る理由: `workflow_dispatch` はデフォルトブランチにあるワークフローでしか使えず、マージ前にはデプロイ用ワークフロー（`deploy.yml`）を動かせないため。
- リポジトリは `tminasen/inform-weather-forecast`、デフォルトブランチは `master`。

## 1. 変数

以降のコマンドで使う変数を、シェルに設定する。

```bash
export GCP_PROJECT_ID="<プロジェクト ID>"
export GCP_REGION="asia-northeast1"
export GAR_REPOSITORY="inform-weather-forecast"
export GITHUB_REPO="tminasen/inform-weather-forecast"
export RUNTIME_SA_NAME="inform-weather-runtime"
export DEPLOY_SA_NAME="inform-weather-deploy"
export SCHEDULER_SA_NAME="inform-weather-scheduler"
export RUNTIME_SA="${RUNTIME_SA_NAME}@${GCP_PROJECT_ID}.iam.gserviceaccount.com"
export DEPLOY_SA="${DEPLOY_SA_NAME}@${GCP_PROJECT_ID}.iam.gserviceaccount.com"
export SCHEDULER_SA="${SCHEDULER_SA_NAME}@${GCP_PROJECT_ID}.iam.gserviceaccount.com"
export IMAGE="${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/${GAR_REPOSITORY}/inform-weather-forecast"
export POOL="github"
export PROVIDER="inform-weather-forecast"
gcloud config set project "$GCP_PROJECT_ID"
export PROJECT_NUMBER="$(gcloud projects describe "$GCP_PROJECT_ID" --format='value(projectNumber)')"
```

## 2. API の有効化

```bash
gcloud services enable \
  run.googleapis.com \
  cloudscheduler.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  iam.googleapis.com \
  iamcredentials.googleapis.com \
  sts.googleapis.com
```

## 3. Artifact Registry

```bash
gcloud artifacts repositories create "$GAR_REPOSITORY" \
  --repository-format=docker --location="$GCP_REGION"
```

- このリポジトリ（Artifact Registry の Docker リポジトリ）には、**デプロイ中のイメージ 1 つだけ**が残る。デプロイのたびに、今回のイメージ以外はタグの有無に関係なくすべて削除される。
- **リポジトリに image index（manifest list）がないことが前提**である。ビルドは `--provenance=false --sbom=false` で単一の manifest にする。index が入ると、子 manifest が「今回の digest 以外」として削除されるおそれがあるため、`deploy.yml` はデプロイした digest が index なら何も削除せずに失敗する（章 13 を参照）。

## 4. Secret Manager

```bash
# 貼り付けた値は画面に表示されず、シェルの履歴にも残らない
read -rs DISCORD_URL_VALUE && printf '%s' "$DISCORD_URL_VALUE" | gcloud secrets create weather-forecast-discord-url --data-file=- ; unset DISCORD_URL_VALUE
printf '%s' '<メンション。例: <@&123>>' | gcloud secrets create weather-forecast-discord-mention --data-file=-
```

`weather-forecast-discord-mention` も必ず作る。今の Repository secrets に両方あるため、両方を登録する前提にしている。

## 5. サービスアカウントと IAM（最小権限）

```bash
gcloud iam service-accounts create "$RUNTIME_SA_NAME" --display-name="inform-weather runtime"
gcloud iam service-accounts create "$DEPLOY_SA_NAME" --display-name="inform-weather deploy (GitHub Actions)"
gcloud iam service-accounts create "$SCHEDULER_SA_NAME" --display-name="inform-weather scheduler"
```

| SA | 付けるロール | 付ける範囲 | 根拠 |
|---|---|---|---|
| デプロイ用 SA | `roles/artifactregistry.repoAdmin`（push、`dockerImages.get` での mediaType の取得、削除。writer では削除できない） | **リポジトリ単位**。プロジェクト単位では付けない | https://cloud.google.com/artifact-registry/docs/access-control#roles |
| デプロイ用 SA | `roles/run.developer`（Job の更新） | **Job 単位** | https://cloud.google.com/run/docs/reference/iam/roles 、https://cloud.google.com/run/docs/securing/managing-access |
| デプロイ用 SA | `roles/iam.serviceAccountUser`（実行用 SA への actAs） | **実行用 SA に対して** | https://cloud.google.com/run/docs/configuring/jobs/service-identity 、https://cloud.google.com/iam/docs/service-accounts-actas |
| デプロイ用 SA | `roles/iam.workloadIdentityUser`（WIF の principalSet に付ける） | デプロイ用 SA に対して（章 6） | https://cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines 、https://github.com/google-github-actions/auth#security-considerations |
| 実行用 SA | `roles/secretmanager.secretAccessor` | **Secret 単位**（`weather-forecast-discord-url` / `weather-forecast-discord-mention`） | https://cloud.google.com/secret-manager/docs/access-control |
| Scheduler 用 SA | `run.jobs.runWithOverrides` を含むロール | **Job 単位** | https://cloud.google.com/run/docs/execute/jobs-on-schedule 、https://cloud.google.com/run/docs/execute/jobs#override-job-configuration 、https://cloud.google.com/run/docs/reference/iam/roles |

### 5-1. いま付けられるもの

```bash
# デプロイ用 SA: Artifact Registry（リポジトリ単位）
gcloud artifacts repositories add-iam-policy-binding "$GAR_REPOSITORY" --location="$GCP_REGION" \
  --member="serviceAccount:$DEPLOY_SA" --role="roles/artifactregistry.repoAdmin"

# デプロイ用 SA: 実行用 SA への actAs（実行用 SA に対して）
gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA" \
  --member="serviceAccount:$DEPLOY_SA" --role="roles/iam.serviceAccountUser"

# 実行用 SA: Secret（Secret 単位）
for s in weather-forecast-discord-url weather-forecast-discord-mention; do
  gcloud secrets add-iam-policy-binding "$s" \
    --member="serviceAccount:$RUNTIME_SA" --role="roles/secretmanager.secretAccessor"
done
```

### 5-2. Job を作ったあとに付けるもの（章 8-2 のあとに実行）

Job 単位の権限は、Job ができてから付ける。

```bash
# デプロイ用 SA: Job の更新（Job 単位）
gcloud run jobs add-iam-policy-binding inform-weather-forecast --region="$GCP_REGION" \
  --member="serviceAccount:$DEPLOY_SA" --role="roles/run.developer"
```

Scheduler 用 SA のロールは、次の読み取りコマンドで確かめてから選ぶ。`roles/run.invoker` に含まれていればそれを使い、含まれていなければ `roles/run.developer` を Job 単位で付ける。

```bash
gcloud iam roles describe roles/run.invoker --format='value(includedPermissions)' | tr ';' '\n' | grep runWithOverrides

# 含まれていた場合
gcloud run jobs add-iam-policy-binding inform-weather-forecast --region="$GCP_REGION" \
  --member="serviceAccount:$SCHEDULER_SA" --role="roles/run.invoker"
# 含まれていなかった場合
gcloud run jobs add-iam-policy-binding inform-weather-forecast --region="$GCP_REGION" \
  --member="serviceAccount:$SCHEDULER_SA" --role="roles/run.developer"
```

### 5-3. 付けた権限の確認

```bash
# リポジトリ単位
gcloud artifacts repositories get-iam-policy "$GAR_REPOSITORY" --location="$GCP_REGION"
# プロジェクト単位（デプロイ用 SA のロールが付いていないことを確かめる）
gcloud projects get-iam-policy "$GCP_PROJECT_ID" --flatten="bindings[].members" --filter="bindings.members:serviceAccount:$DEPLOY_SA" --format="table(bindings.role)"
# Job 単位
gcloud run jobs get-iam-policy inform-weather-forecast --region="$GCP_REGION"
```

### 5-4. 初回の deploy.yml が権限不足で失敗したとき

デプロイ用 SA の `roles/run.developer` を Job 単位にしているため、プロジェクト単位でしか付けられない権限（例: operation の取得）が足りずに、初回の `deploy.yml` が失敗する可能性がある。

1. エラーに出た権限名を確かめる。
2. その権限を含む最小のロールを調べる（`gcloud iam roles describe <ロール> --format='value(includedPermissions)'`）。
3. そのロールを必要な範囲で追加する。
4. プロジェクト単位の `roles/run.developer` に戻すのは最後の手段にする。

## 6. Workload Identity Federation

名前（`assertion.repository`）では縛らない。リポジトリは改名でき、旧オーナー名は第三者が取得できるため、**不変の ID** で縛る。
根拠: https://github.com/google-github-actions/auth#security-considerations

```bash
# ID を確かめる（期待値: 1427172897 / 29924465）
gh api repos/tminasen/inform-weather-forecast --jq '.id, .owner.id'

gcloud iam workload-identity-pools create "$POOL" --location=global --display-name="GitHub"

gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" \
  --location=global --workload-identity-pool="$POOL" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository_id=assertion.repository_id,attribute.repository_owner_id=assertion.repository_owner_id,attribute.ref=assertion.ref" \
  --attribute-condition="assertion.repository_id=='1427172897' && assertion.repository_owner_id=='29924465' && assertion.ref=='refs/heads/master'"

gcloud iam service-accounts add-iam-policy-binding "$DEPLOY_SA" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/attribute.repository_id/1427172897"

# GitHub Variables に登録する値
gcloud iam workload-identity-pools providers describe "$PROVIDER" \
  --location=global --workload-identity-pool="$POOL" --format='value(name)'
```

attribute-condition で `refs/heads/master` だけを許可しているため、PR のブランチからは認証できない。

## 7. GitHub Variables

リポジトリの Settings > Secrets and variables > Actions > Variables に登録する（リポジトリにはコミットしない）。

| 名前 | 値 |
|---|---|
| `GCP_PROJECT_ID` | プロジェクト ID |
| `GCP_REGION` | `asia-northeast1` |
| `GAR_REPOSITORY` | `inform-weather-forecast` |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | 章 6 の最後のコマンドの出力（`projects/<番号>/locations/global/workloadIdentityPools/<POOL>/providers/<PROVIDER>`） |
| `GCP_DEPLOY_SERVICE_ACCOUNT` | `$DEPLOY_SA` |
| `GCP_RUNTIME_SERVICE_ACCOUNT` | `$RUNTIME_SA` |

Job 名とイメージ名は、ワークフローに `inform-weather-forecast` と固定で書いてある。

## 8. 初回の手動デプロイと実行の確認

### 8-1. ビルドと push

**作業マシンが arm64（Apple Silicon）の場合でも、必ず `--platform linux/amd64 --provenance=false --sbom=false` を付ける。**
Cloud Run のコンテナ契約で、イメージは 64 ビット Linux（linux/amd64）向けにビルドする必要があるため。根拠: https://cloud.google.com/run/docs/container-contract
`--provenance=false --sbom=false` は、attestation 付きの image index を作らないため（章 3、章 13）。

```bash
TAG="manual-$(date +%Y%m%d%H%M%S)"
docker build --platform linux/amd64 --provenance=false --sbom=false -t "$IMAGE:$TAG" .

# push の前に、アーキテクチャを確かめる（linux/amd64 が出ること）
docker image inspect "$IMAGE:$TAG" --format '{{.Os}}/{{.Architecture}}'

gcloud auth configure-docker "${GCP_REGION}-docker.pkg.dev" --quiet
docker push "$IMAGE:$TAG"
```

### 8-2. Job を作る

```bash
gcloud run jobs deploy inform-weather-forecast \
  --image="$IMAGE:$TAG" \
  --region="$GCP_REGION" \
  --max-retries=0 --tasks=1 --task-timeout=300s \
  --service-account="$RUNTIME_SA" \
  --set-secrets=DISCORD_URL=weather-forecast-discord-url:latest,DISCORD_MENTION=weather-forecast-discord-mention:latest
```

- `--max-retries=0` は、今と同じくリトライなしにして、失敗通知を重複させないため。
- Job の引数は持たない。Scheduler が overrides で毎回渡す。

このあと、章 5-2 を実行する。

### 8-3. 動作確認

```bash
gcloud run jobs execute inform-weather-forecast --region="$GCP_REGION" --args=today --wait
```

Discord に天気が届くこと、`gcloud run jobs executions list --job=inform-weather-forecast --region="$GCP_REGION"` で成功になっていることを確かめる。

### 8-4. 失敗通知の確認

```bash
gcloud run jobs execute inform-weather-forecast --region="$GCP_REGION" --args=invalid --wait
```

execution は失敗になり、Discord に次の失敗通知が届くこと。

- 本文: `<メンション> inform-weather failure :umbrella:`
- embed `build detail` の `job` / `execution` / `error`（`error` は `invalid target: invalid`）

天気のページから天気・日付・気温がすべて取れないときも、同じ失敗通知が届く。`error` の例: `weather data not found: target=今日 place=https://weather.yahoo.co.jp/weather/jp/11/4310.html`

### 8-5. dockerImages.get（mediaType の取得）の確認

`deploy.yml` は、デプロイした digest の mediaType を Artifact Registry API の `dockerImages.get` で取る。手動で push したあとに、同じ curl を試して、権限と URL を確かめる。

```bash
DIGEST="$(docker inspect --format '{{range .RepoDigests}}{{println .}}{{end}}' "$IMAGE:$TAG" | grep -F -- "$IMAGE@" | head -n1 | sed 's/.*@//')"
curl -fsS -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  "https://artifactregistry.googleapis.com/v1/projects/${GCP_PROJECT_ID}/locations/${GCP_REGION}/repositories/${GAR_REPOSITORY}/dockerImages/inform-weather-forecast@${DIGEST}" \
  | jq -r '.mediaType'
```

- 期待値: `application/vnd.docker.distribution.manifest.v2+json` または `application/vnd.oci.image.manifest.v1+json`。`manifest.list` / `image.index` なら、ビルドの設定を確かめて作り直す。
- URL の `{+name}` の部分では、`:` と `@` をエンコードしない。API の `name` パラメータは `{+name}`（予約文字を展開する形）で、`inform-weather-forecast@sha256:...` をそのまま入れる。`%40` や `%3A` にするとエラーになる。
- 必要な権限は `artifactregistry.dockerimages.get`（`roles/artifactregistry.repoAdmin` に含まれる）。
- 根拠: https://cloud.google.com/artifact-registry/docs/reference/rest/v1/projects.locations.repositories.dockerImages/get

## 9. Cloud Scheduler

### 9-1. Scheduler のジョブ

07:30 に今日、21:30 に明日（Asia/Tokyo）。Job を起動するとき、overrides で args を渡す。認証は `--oauth-service-account-email` に Scheduler 用 SA を指定する。

```bash
URI="https://run.googleapis.com/v2/projects/${GCP_PROJECT_ID}/locations/${GCP_REGION}/jobs/inform-weather-forecast:run"

gcloud scheduler jobs create http inform-weather-today \
  --location="$GCP_REGION" --schedule="30 7 * * *" --time-zone="Asia/Tokyo" \
  --uri="$URI" --http-method=POST \
  --headers="Content-Type=application/json" \
  --message-body='{"overrides":{"containerOverrides":[{"args":["today"]}]}}' \
  --oauth-service-account-email="$SCHEDULER_SA"

gcloud scheduler jobs create http inform-weather-tomorrow \
  --location="$GCP_REGION" --schedule="30 21 * * *" --time-zone="Asia/Tokyo" \
  --uri="$URI" --http-method=POST \
  --headers="Content-Type=application/json" \
  --message-body='{"overrides":{"containerOverrides":[{"args":["tomorrow"]}]}}' \
  --oauth-service-account-email="$SCHEDULER_SA"
```

根拠: https://cloud.google.com/run/docs/execute/jobs-on-schedule

作った直後に、手動で起動して確かめる。

```bash
gcloud scheduler jobs run inform-weather-today --location="$GCP_REGION"
gcloud scheduler jobs describe inform-weather-today --location="$GCP_REGION" --format='value(status)'
```

## 10. 並行稼働

master にある既存の GitHub Actions の schedule と並行して、1〜2 日動かす。**通知は二重になる。** Cloud Scheduler の通知が、07:30 / 21:30 JST のとおりに届くことを確認する。

## 11. ルールセットへの必須チェックの追加（マージの前）

今のルールセット `protect-main` は「PR 必須」だけで、必須のステータスチェックがない。`deploy.yml` はテストを再実行しないため、**CI が成功したコミットだけが master に入る**ようにする必要がある。

1. Settings > Rules > Rulesets > `protect-main` で、「Require status checks to pass」を有効にする。
2. 必須のチェックに、`pull-request.yml` の job `check_pull_request`（lint・test・build・actionlint・hadolint・docker build）を追加する。

根拠: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets#require-status-checks-to-pass-before-merging

確認コマンド（読み取りのみ）:

```bash
gh api repos/tminasen/inform-weather-forecast/rulesets --jq '.[].id'
gh api repos/tminasen/inform-weather-forecast/rulesets/<id> --jq '.rules[] | select(.type=="required_status_checks")'
```

出力に `check_pull_request` が含まれていること。**この手順を済ませるまでは、マージしない。**

## 12. マージ

PR をマージする（`inform-weather.yml` の schedule と再有効化処理の削除、`deploy.yml` の追加）。

- **07:30 / 21:30 JST の前後にはマージしない。** 削除の直前に作られ、まだタスクが起動していない execution が、古い digest を参照している可能性があるため。
- マージ時の push で `deploy.yml` が動き、Job が更新され、古いイメージが削除されることを確認する。
- **このとき、章 8-1 で作った `manual-<日時>` のイメージも削除される。これで問題ない。**
  - 削除ステップは deploy ステップの成功後にしか動かない。その時点で Job は新しい digest を参照しているので、Job が手動のイメージを参照することはない。
  - Scheduler は Job を起動するだけで、イメージを直接参照しない。
  - ロールバックは git revert と再デプロイで行う（章 14）ので、手動のイメージを残す理由もない。
- `deploy.yml` は、デプロイした digest が image index なら、**何も削除せずに失敗する**。その場合は、ビルドの設定（`docker build` に `--provenance=false --sbom=false` が付いていること）を確かめて、作り直す。

## 13. イメージ削除の確認

マージ後の `deploy.yml` の実行が成功したら、次の 2 つで確かめる。

```bash
# 1. イメージが 1 つだけ残っていること
gcloud artifacts docker images list "$IMAGE" --include-tags --format='value(version)'
# 2. 残った digest が、Job の参照している digest と同じであること
gcloud run jobs describe inform-weather-forecast --region="$GCP_REGION" --format='value(spec.template.spec.template.spec.containers[0].image)'
```

1 は 1 行だけ出ること。2 の出力の `@` より後ろが、1 の出力と一致すること。違っていたら、ワークフローのログを確かめてから人間が判断する。

### 削除が失敗し続けるとき（image index がある場合）

リポジトリに image index があると、子 manifest の削除が失敗し続けたり、`deploy.yml` が「deployed image is an image index」で止まったりする。

1. `images list` の出力と、`dockerImages.get` の mediaType（章 8-5）で、どの digest が index かを確かめる。
2. Job が参照している digest（上の 2）を控える。
3. 控えた digest 以外の index と、その子 manifest を、`gcloud artifacts docker images delete "<package>@sha256:<digest>" --delete-tags --quiet` で、1 つずつ手動で削除する。**`@sha256:...` を付けずに実行すると、パッケージ全体が削除される。**
4. ビルドの設定を確かめ、`--provenance=false --sbom=false` で作り直して、再デプロイする。

## 14. ロールバック（git revert と再デプロイ）

古いイメージは残さない（Artifact Registry には、デプロイ中のイメージ 1 つだけが残る）。ロールバックは、次の手順で行う。

1. 戻したい変更を `git revert` する PR を作り、マージする。
2. マージの push で `deploy.yml` が動き、戻したコードで新しくビルドされて、Job が更新される。

## 15. 失敗通知の確認

章 8-4 を参照。マージ後は、`workflow_dispatch` の `inform-weather`（予備）でも確かめられる。ただし、**アプリ内で失敗したときは、アプリ内の通知と workflow の curl の通知の 2 通が届く**。

## 16. 通知されない失敗

Cloud Monitoring のアラートは追加しない。次の失敗は Discord に**通知されない**。「天気予報が届かなかったら、次の方法で確認する」という運用にする。

| 失敗の種類 | 通知されない理由 | 気づく方法 |
|---|---|---|
| Scheduler から Job を起動できない（権限の不足、URI の誤り、API のエラー） | Job 自体が動かない | Scheduler のジョブの「最終実行の結果」と Cloud Logging の `cloud_scheduler_job` ログ |
| コンテナが起動しない（イメージの pull 失敗、アーキテクチャの不一致、`node` が起動する前のクラッシュ） | アプリのコードが動かない | Cloud Run の Job の実行履歴（失敗した execution）とログ |
| Secret が読めない（実行用 SA の権限の不足、Secret やバージョンの削除） | コンテナが起動する前に失敗する | 同上 |
| task-timeout（300 秒）を超えた | SIGTERM / SIGKILL で止まり、catch に届かない | 同上（execution の状態が timeout になる） |
| OOM（メモリ不足） | プロセスが強制終了する | 同上 |
| `DISCORD_URL` が未設定、または Webhook の URL が無効 | 通知先そのものが使えない | 同上（`DISCORD_URL is not set`、通知失敗のログ） |
| Discord 側の障害 | 通知の送信に失敗する | 同上（通知失敗のログ） |
| 天気のページから一部の項目だけ取れない（例: 天気は取れるが気温や指数が取れない、日付だけ取れない） | 失敗として扱わず、取れた項目だけで今までどおり通知する | Discord に届いた通知で、項目が欠けている、またはタイトルが `"undefinedの天気"` になっている。Cloud Logging の `request param:` ログで送った内容を確かめられる |

- 天気・日付・気温がすべて取れない場合は、失敗として通知される（`weather data not found: ...`。章 8-4）。この表には入らない。
