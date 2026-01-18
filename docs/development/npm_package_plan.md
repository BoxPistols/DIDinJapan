# NPMパッケージ化計画 (RFC: Request for Comments)

## 概要

現在 `DID-J26` として開発されている地図・ドローン飛行エリア判定アプリケーションの一部を、再利用可能な NPM パッケージとして切り出し、外部の React / Next.js アプリケーションから利用可能にするための設計計画です。

## フェーズ分け

### Phase 1: コンポーネントの分離とリファクタリング (現在)

- 密結合しているロジックの分離（カスタムフック化）
- `components/` 以下の依存関係の整理
- 状態管理（Context/Reduxなど）のスコープ限定化

### Phase 2: Monorepo構成への移行 (計画)

- TurboRepo または Nx の導入
- `apps/web`: 現在のアプリケーション
- `packages/ui`: UIコンポーネントライブラリ
- `packages/core`: 地図ロジック・判定エンジン

### Phase 3: NPM Publish (計画)

- パッケージのビルド設定 (Rollup/Vite Library Mode)
- `@did-j26/react` 及び `@did-j26/core` の公開
- ドキュメンテーションの整備

## パッケージ構成案

### 1. `@did-j26/core`

UIに依存しないコアロジックのみを提供するSDK。Node.js環境でも動作することを目標とする。

- **機能**:
  - Point-in-Polygon (PIP) 判定
  - 距離計算 (Great-circle distance)
  - GeoJSONデータのパース・検証
  - 各種規制エリアデータの型定義
- **依存**: `turf`, `geojson`

### 2. `@did-j26/react` (Component)

React アプリケーション向けの地図コンポーネントライブラリ。

- **機能**:
  - `DIDMap`: メインの地図コンポーネント
  - `DrawingTools`: 描画ツール
  - `InfoPanel`: 情報表示パネル
- **依存**: `maplibre-gl`, `pmtiles`, `react`, `react-dom`

## 実装イメージ（将来像）

```tsx
import { DIDMap } from '@did-j26/react';
import '@did-j26/react/dist/style.css';

function App() {
  return (
    <div style={{ height: '100vh' }}>
      <DIDMap
        initialViewState={{ longitude: 139.7, latitude: 35.6, zoom: 10 }}
        onLoad={() => console.log('Map Loaded')}
      />
    </div>
  );
}
```

## 課題と検討事項

1. **データ配信**: 地図タイルや規制エリアデータ（PMTiles/GeoJSON）をどこから配信するか。
    - パッケージにバンドルするには大きすぎる。CDN経由での配信アーキテクチャが必要。
2. **スタイル管理**: MapLibreのスタイル定義 (`style.json`) の管理方法。
3. **認証**: 商用利用する場合のAPIキー認証の仕組み。
