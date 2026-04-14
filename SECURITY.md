# セキュリティポリシー / Security Policy

## 脆弱性の報告

セキュリティ上の問題を発見した場合、GitHub Issues には投稿せず、リポジトリオーナーに直接ご連絡ください。

---

## シークレット漏洩インシデント対応手順

> 2026-04-15 発生したGemini APIキー漏洩を教訓として策定。

### Step 1 — 即時対応（5分以内）

```
1. GCP Console でキーを無効化・削除
   https://console.cloud.google.com/apis/credentials

2. 漏洩したキーを使って何が実行されたか確認（API使用状況ログ）
   GCP Console → APIs & Services → Credentials → 該当キーの使用履歴

3. 必要に応じてサービスを一時停止
```

### Step 2 — Git履歴から削除（30分以内）

```bash
# git-filter-repo をインストール
pip3 install git-filter-repo

# 置換ファイルを作成
echo "LEAKED_KEY_HERE==>REDACTED_REVOKED_API_KEY" > /tmp/replacements.txt

# 全履歴を書き換え
export PATH="/Library/Frameworks/Python.framework/Versions/3.12/bin:$PATH"
git-filter-repo --replace-text /tmp/replacements.txt --force

# リモートを再登録してforce push
git remote add origin https://github.com/itsmishb/poketre.git
git push origin main --force
git push origin --all --force
```

### Step 3 — GitHub キャッシュのパージ依頼

```
GitHub Support へ連絡:
https://support.github.com/contact

件名: "Request to purge cached git objects from public repository"
内容: リポジトリ名 + force push 済みの旧コミットハッシュを記載
```

### Step 4 — 新しいキーの発行と設定

```
1. GCP Console で新しいAPIキーを発行
2. キーに適切な制限を設定（IPアドレス制限 or APIスコープ制限）
3. Vercel / Cloud Run の環境変数を更新
4. ローカルの .env.local を更新
```

### Step 5 — 事後対応

- [ ] インシデントレポートを `docs/incidents/YYYY-MM-DD-secret-leak.md` に記録
- [ ] 漏洩した期間のAPIコストを確認し、不審な使用があればGCPに報告
- [ ] `make setup-hooks` でpre-commitフックを再確認
- [ ] チームメンバーに通知

---

## シークレット管理ルール

### NG（絶対にやってはいけないこと）

```python
# ❌ ソースコードにキーを直接記述
GEMINI_API_KEY = "AIzaSy..."

# ❌ .env ファイルをgitにコミット
# .env, .env.local, .env.production など
```

### OK（正しい方法）

```bash
# ✅ 環境変数から読み込む
GEMINI_API_KEY = os.environ["GEMINI_API_KEY"]

# ✅ .env.local.example にプレースホルダーを記述
GEMINI_API_KEY=your-api-key-here

# ✅ 本番はVercel / Cloud Run の環境変数設定画面から設定
```

### .gitignore で必ず除外するファイル

```
.env
.env.local
.env.production
*.json  # ← service account JSON など
*-credentials.json
*-keyfile.json
gcp-key*.json
service-account*.json
```

---

## 定期セキュリティチェックリスト（月1回）

- [ ] `make scan-secrets` を実行してシークレット漏洩がないか確認
- [ ] GCP Console でAPIキーの使用状況を確認
- [ ] サービスアカウントの権限が最小限か確認
- [ ] 不要なAPIキーや認証情報を削除
- [ ] `gh api repos/itsmishb/poketre/secret-scanning/alerts` でGitHub Secret Scanning結果を確認
