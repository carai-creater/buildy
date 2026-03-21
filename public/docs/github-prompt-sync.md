# GitHub からシステムプロンプトを同期

Buildy は **公開 GitHub リポジトリ**のファイルを Contents API で読み、エージェントの `system_prompt`（LLM の振る舞い）に使えます。

## 探索順（先に見つかったものを採用）

1. `.buildy/system-prompt.md`
2. `.buildy/prompt.md`
3. `buildy/system-prompt.md`
4. `buildy/prompt.md`
5. `BUILDY_PROMPT.md`
6. `docs/BUILDY_PROMPT.md`
7. `README.md`

1 ファイルあたり最大約 48,000 文字に切り詰めます。

## API

- **`GET /api/github/repo-prompt?repo=owner/repo`** … テキストを返すだけ（フォームの「読み込み」用）
- **`POST /api/agents/:agentId/sync-github-prompt`** … DB の `system_prompt` を上書き保存

## 環境変数（任意）

| 変数 | 説明 |
|------|------|
| `GITHUB_TOKEN` | 細かい API 制限緩和・**プライベートリポ**読取に利用可能（PAT） |

未設定でも公開リポは未認証 API（時間あたりの上限あり）で読めます。

## UI

- **エージェント追加 / 編集**: 「GitHub からプロンプトを読み込む」「同期して保存」
- **クリエイターダッシュボード**: エージェント詳細の「GitHub プロンプト同期」

**注意**: リポジトリ内の **Python/Node などのコードは実行されません**。同期されるのは上記パスの **テキスト**のみです。
