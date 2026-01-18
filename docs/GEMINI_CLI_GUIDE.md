# Gemini CLI コマンドガイド

このプロジェクトでは、GitHub上で `@gemini-cli` を使って AI によるコードレビュー、Issue トリアージ、コード分析を実行できます。

---

## 📋 目次

- [利用可能なコマンド](#利用可能なコマンド)
- [使い方](#使い方)
- [トリガー条件](#トリガー条件)
- [自動トリガー](#自動トリガー)
- [実行例](#実行例)
- [トラブルシューティング](#トラブルシューティング)

---

## 利用可能なコマンド

### 1. PRレビュー

```
@gemini-cli /review
```

**機能:**
- プルリクエスト全体のコードレビュー
- バグ、セキュリティ脆弱性、パフォーマンス問題の検出
- コードスタイル、ベストプラクティスの提案
- インラインコメントでフィードバック

**追加コンテキスト:**
```
@gemini-cli /review セキュリティ脆弱性に特に注目してください
@gemini-cli /review パフォーマンス改善の提案をお願いします
```

---

### 2. Issue トリアージ

```
@gemini-cli /triage
```

**機能:**
- Issue の内容分析
- 適切なラベルの提案
- 優先度の評価
- 関連Issue/PRの検索

---

### 3. 汎用タスク（カスタムコマンド）

```
@gemini-cli <任意のテキスト>
```

**使用例:**

**コード分析:**
```
@gemini-cli このPRの変更内容をサマリーしてください
@gemini-cli summary
@gemini-cli この関数のバグを探して
```

**ドキュメント生成:**
```
@gemini-cli このコンポーネントのドキュメントを作成してください
@gemini-cli README.mdを更新してください
```

**質問:**
```
@gemini-cli この実装の意図を説明してください
@gemini-cli パフォーマンスのボトルネックを特定してください
```

---

## 使い方

### Step 1: コメントを投稿

以下の場所でコマンドを使用できます：

- ✅ **PR コメント欄**
- ✅ **PR レビューコメント**
- ✅ **Issue コメント欄**

### Step 2: コマンドを入力

コメント欄に `@gemini-cli` で始まるコマンドを投稿します。

### Step 3: 自動実行

GitHub Actions が自動的にワークフローを開始し、結果をコメントで返します。

```
🤖 Hi @username, I've received your request, and I'm working on it now!
```

### Step 4: 結果確認

- コメント欄に結果が投稿されます
- 実行ログは Actions タブで確認できます

---

## トリガー条件

### 権限要件

以下のいずれかの権限が必要です：

- ✅ **OWNER** - リポジトリオーナー
- ✅ **MEMBER** - Organization メンバー
- ✅ **COLLABORATOR** - コラボレーター

外部コントリビューター（CONTRIBUTOR）は実行できません。

### イベント条件

| イベント | 自動実行 | コメント実行 |
|---------|---------|-------------|
| PR 作成 | ✅ `/review` | - |
| Issue 作成 | ✅ `/triage` | - |
| Issue 再オープン | ✅ `/triage` | - |
| PR コメント | - | ✅ |
| Issue コメント | - | ✅ |
| PR レビューコメント | - | ✅ |

---

## 自動トリガー

### PR 作成時の自動レビュー

新しいPRを作成すると、自動的に `/review` が実行されます。

**無効化する方法:**
- `.github/workflows/gemini-dispatch.yml` の `pull_request.opened` イベントを削除

### Issue 作成時の自動トリアージ

新しいIssueを作成すると、自動的に `/triage` が実行されます。

**無効化する方法:**
- `.github/workflows/gemini-dispatch.yml` の `issues.opened` イベントを削除

---

## 実行例

### 例1: PRレビュー

**コメント:**
```
@gemini-cli /review
```

**結果:**
```markdown
## Code Review Summary

### Overall Assessment
✅ Code quality is good with minor improvements needed.

### Issues Found
1. **Security**: Potential XSS vulnerability in line 42
2. **Performance**: Unnecessary re-rendering in Component.tsx
3. **Style**: Missing JSDoc comments for public methods

### Recommendations
- Add input sanitization for user-provided data
- Use React.memo() to prevent unnecessary renders
- Document all exported functions

### Detailed Comments
[Inline comments added to PR]
```

---

### 例2: カスタム分析

**コメント:**
```
@gemini-cli このPRで追加されたコンポーネントのテストカバレッジを確認してください
```

**結果:**
```markdown
## Test Coverage Analysis

### New Components
1. `AppHeader.tsx` - ❌ No tests found
2. `GlassPanel.tsx` - ❌ No tests found

### Recommendations
- Add unit tests for AppHeader component
- Add integration tests for GlassPanel with theme switching
- Target coverage: 80%+

### Suggested Test Cases
1. AppHeader renders correctly in dark/light mode
2. GlassPanel closes when onClose is called
3. GlassPanel footer renders when provided
```

---

### 例3: Issue トリアージ

**Issue タイトル:**
> App crashes when clicking the map

**コメント:**
```
@gemini-cli /triage
```

**結果:**
```markdown
## Issue Triage

### Category
🐛 Bug

### Priority
🔴 High

### Suggested Labels
- bug
- high-priority
- needs-investigation

### Potential Root Cause
Based on the description, this appears to be a JavaScript error.
Likely causes:
1. Null reference in event handler
2. Missing map initialization check

### Related Issues
- #42: Similar map interaction bug
- #38: MapLibre initialization timing issue

### Recommended Next Steps
1. Reproduce the issue locally
2. Check browser console for error messages
3. Add error boundary to map component
```

---

## トラブルシューティング

### コマンドが実行されない

**原因1: 権限不足**
- OWNER/MEMBER/COLLABORATOR 権限が必要
- 外部コントリビューターは実行不可

**原因2: Fork からの PR**
- セキュリティのため、Fork からのPRでは実行不可
- メインリポジトリにマージ後に実行可能

**原因3: API Key 未設定**
- `Settings > Secrets and variables > Actions`
- `GEMINI_API_KEY` を設定

### エラーメッセージ

**"I was unable to process your request"**
- Actions タブでログを確認
- API Key の有効期限をチェック
- ワークフローの実行権限を確認

### 実行ログの確認方法

1. リポジトリの **Actions** タブを開く
2. **Gemini Dispatch** ワークフローを選択
3. 失敗したジョブをクリック
4. エラーメッセージを確認

---

## 設定ファイル

### ワークフロー構成

| ファイル | 役割 |
|---------|------|
| `gemini-dispatch.yml` | コマンド振り分け |
| `gemini-review.yml` | PRレビュー実行 |
| `gemini-triage.yml` | Issueトリアージ実行 |
| `gemini-invoke.yml` | 汎用タスク実行 |

### 環境変数

| 変数名 | 種類 | 説明 |
|--------|------|------|
| `GEMINI_API_KEY` | Secret | Gemini API認証キー（必須） |
| `GEMINI_MODEL` | Variable | 使用するモデル（オプション） |
| `GEMINI_DEBUG` | Variable | デバッグモード有効化 |

---

## よくある質問 (FAQ)

### Q: 複数のコマンドを同時実行できますか？
**A:** いいえ、1コメントにつき1コマンドのみです。複数実行する場合は、別々のコメントを投稿してください。

### Q: 実行時間はどれくらいですか？
**A:** 通常 1-3分程度です。大規模なPRの場合は5-7分かかることがあります。

### Q: 実行回数に制限はありますか？
**A:** GitHub Actionsの無料枠内（月2,000分）で制限されます。超過した場合は課金されます。

### Q: プライベートリポジトリでも使えますか？
**A:** はい、API Keyを設定すれば使用できます。

### Q: コマンドをキャンセルできますか？
**A:** Actions タブから実行中のワークフローをキャンセルできます。

---

## 関連リンク

- [GitHub Actions ドキュメント](https://docs.github.com/actions)
- [Gemini API ドキュメント](https://ai.google.dev/docs)
- [リポジトリ Issues](https://github.com/BoxPistols/DID-J26/issues)

---

**最終更新:** 2026-01-18
