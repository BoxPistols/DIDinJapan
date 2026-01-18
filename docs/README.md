# ドキュメント索引

このドキュメントは自動生成されています。
**更新方法:** `npm run docs:index`

---

## 📋 目次

- [📊 データ関連](#data)
- [🔌 API・外部連携](#api)
- [📐 仕様書](#specifications)
- [🛠️ 開発ガイド](#development)

---

## 📊 データ関連

DIDデータ、空港データ、地形データの取得・更新・配布に関するドキュメント

### [データ配布・利用ガイド](./data/DATA_DISTRIBUTION_GUIDE.md)

このドキュメントでは、DID-J26プロジェクトで使用している地理データを他のプロジェクトで利用する方法を説明します。

### [データ更新状況: 2020年 DIDデータ](./data/DATA_UPDATE_STATUS.md)

2010年（平成22年）のDIDデータから、2020年（令和2年）データへの移行を進めています。

### [DIDデータ更新ガイド](./data/DID_DATA_UPDATE_GUIDE.md)

e-Stat（政府統計の総合窓口）から人口集中地区（DID）データを取得し、MapLibreで使用可能なGeoJSON形式に変換するまでの手順を記載します。

### [2024年ポスト災害地形データ実装ガイド](./data/TERRAIN_2024_IMPLEMENTATION.md)

このドキュメントは、2024年能登半島地震後の地形変化を可視化するための実装について説明します。2020年（震災前）と2024年（震災後）のデータを比較し、ドローンフライト計画に必要な座標・海抜高度情報を取得できます。

### [DIDデータ最新化 要件定義](./data/UPDATE_REQUIREMENTS.md)

現在のデータ（平成22年/2010年）を令和2年（2020年）国勢調査データに更新する。

---

## 🔌 API・外部連携

ドローン運航API、気象API、外部サービス連携に関するドキュメント

### [ドローン運用統合APIガイド](./api/DRONE_OPERATION_API_GUIDE.md)

**作成日**: 2026年1月18日

### [天気予報API 詳細調査報告書](./api/WEATHER_API_INVESTIGATION.md)

**作成日**: 2026年1月18日

### [天気予報機能 要件定義書](./api/WEATHER_API_REQUIREMENTS.md)

**作成日**: 2026年1月18日

---

## 📐 仕様書

プロジェクト要件定義、機能仕様、アーキテクチャ設計

### [衝突判定機能 技術仕様書](./specifications/COLLISION_DETECTION_SPEC.md)

**作成日**: 2026年1月18日

### [日本向けオーバーレイ地図ライブラリ 要件定義](./specifications/PROJECT_REQUIREMENTS.md)

日本の各種地理データをトグルでオーバーレイ表示できる汎用地図ライブラリ。

---

## 🛠️ 開発ガイド

開発環境、CI/CD、パッケージ化、タスク管理

### [進行中タスク・未着手課題](./development/ACTIVE_TASKS.md)

最終更新: 2026年1月18日

### [ブランチ ft/261017_refact リファクタリング完全レポート](./development/BRANCH_FT_261017_REFACT_SUMMARY.md)

**ブランチ名:** `ft/261017_refact`

### [CLI完了通知アーキテクチャ](./development/CLI_NOTIFICATION_ARCHITECTURE.md)

このドキュメントは、DIDinJapanプロジェクトにおけるCLIスクリプト完了通知システムのアーキテクチャを説明します。

### [Gemini CLI コマンドガイド](./development/GEMINI_CLI_GUIDE.md)

このプロジェクトでは、GitHub上で `@gemini-cli` を使って AI によるコードレビュー、Issue トリアージ、コード分析を実行できます。

### [Next Actions & Technical Architecture](./development/NEXT_ACTION.md)

**プロジェクト名**: DID-J26

### [NPMパッケージ化計画 (RFC: Request for Comments)](./development/npm_package_plan.md)

現在 `DID-J26` として開発されている地図・ドローン飛行エリア判定アプリケーションの一部を、再利用可能な NPM パッケージとして切り出し、外部の React / Next.js アプリケーションから利用可能にするための設計計画です。

---

---

**最終更新:** 2026-01-18
**生成コマンド:** `npm run docs:index`
