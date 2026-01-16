/**
 * Mock MapLibre GL for Storybook
 * 
 * DrawingTools のテストに必要な最小限の MapLibre GL インスタンスをモックします。
 */

type EventType = 'click' | 'move' | 'zoom' | 'drag' | 'draw.create' | 'draw.update' | 'draw.delete' | string

interface MapEventHandler {
  (event: unknown): void
}

/**
 * Mock Map インスタンス
 */
export class MockMap {
  private _zoom = 10
  private _center: [number, number] = [137.0, 36.5]
  private _listeners: Map<EventType, Set<MapEventHandler>> = new Map()
  private _controls: unknown[] = []
  private _style: Record<string, unknown> = {}
  private _layers: Map<string, Record<string, unknown>> = new Map()
  private _sources: Map<string, Record<string, unknown>> = new Map()
  private _bearing = 0
  private _pitch = 0

  constructor() {
    this.initializeBaseLayers()
  }

  private initializeBaseLayers() {
    // 基本的なベースレイヤーを初期化
    this._layers.set('background', {
      type: 'background',
      paint: { 'background-color': '#fff' }
    })
  }

  /**
   * ズームレベルを取得
   */
  getZoom(): number {
    return this._zoom
  }

  /**
   * ズームレベルを設定
   */
  setZoom(zoom: number): this {
    this._zoom = zoom
    return this
  }

  /**
   * センター座標を取得
   */
  getCenter(): { lng: number; lat: number } {
    return { lng: this._center[0], lat: this._center[1] }
  }

  /**
   * センター座標を設定
   */
  setCenter(lngLat: [number, number] | { lng: number; lat: number }): this {
    if (Array.isArray(lngLat)) {
      this._center = lngLat
    } else {
      this._center = [lngLat.lng, lngLat.lat]
    }
    this.emit('move', {})
    return this
  }

  /**
   * コントローラを追加
   */
  addControl(control: unknown): this {
    this._controls.push(control)
    return this
  }

  /**
   * コントローラを削除
   */
  removeControl(control: unknown): this {
    const index = this._controls.indexOf(control)
    if (index > -1) {
      this._controls.splice(index, 1)
    }
    return this
  }

  /**
   * イベントリスナーを追加
   */
  on(event: EventType, handler: MapEventHandler): this {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set())
    }
    this._listeners.get(event)!.add(handler)
    return this
  }

  /**
   * イベントリスナーを削除
   */
  off(event: EventType, handler?: MapEventHandler): this {
    if (!handler) {
      this._listeners.delete(event)
    } else {
      this._listeners.get(event)?.delete(handler)
    }
    return this
  }

  /**
   * イベントを発火
   */
  private emit(event: EventType, data: unknown): void {
    const handlers = this._listeners.get(event)
    if (handlers) {
      handlers.forEach(handler => {
        handler(data)
      })
    }
  }

  /**
   * レイヤーを追加
   */
  addLayer(layer: Record<string, unknown>): this {
    const id = typeof layer.id === 'string' ? layer.id : `layer-${this._layers.size}`
    this._layers.set(id, layer)
    return this
  }

  /**
   * レイヤーを削除
   */
  removeLayer(layerId: string): this {
    this._layers.delete(layerId)
    return this
  }

  /**
   * レイヤーを取得
   */
  getLayer(layerId: string): Record<string, unknown> | null {
    return this._layers.get(layerId) || null
  }

  /**
   * レイヤーの可視性を設定
   */
  setLayoutProperty(layerId: string, key: string, value: unknown): this {
    const layer = this._layers.get(layerId)
    if (layer) {
      const layout = (layer.layout && typeof layer.layout === 'object' && !Array.isArray(layer.layout))
        ? (layer.layout as Record<string, unknown>)
        : {}
      layout[key] = value
      layer.layout = layout
    }
    return this
  }

  /**
   * ソースを追加
   */
  addSource(sourceId: string, source: Record<string, unknown>): this {
    this._sources.set(sourceId, source)
    return this
  }

  /**
   * ソースを削除
   */
  removeSource(sourceId: string): this {
    this._sources.delete(sourceId)
    return this
  }

  /**
   * ソースを取得
   */
  getSource(sourceId: string): Record<string, unknown> | null {
    return this._sources.get(sourceId) || null
  }

  /**
   * ベアリングを取得
   */
  getBearing(): number {
    return this._bearing
  }

  /**
   * ベアリングを設定
   */
  setBearing(bearing: number): this {
    this._bearing = bearing
    return this
  }

  /**
   * ピッチを取得
   */
  getPitch(): number {
    return this._pitch
  }

  /**
   * ピッチを設定
   */
  setPitch(pitch: number): this {
    this._pitch = pitch
    return this
  }

  /**
   * キャンバス要素を取得（ダミー）
   */
  getCanvas(): HTMLCanvasElement {
    return document.createElement('canvas')
  }

  /**
   * コンテナ要素を取得（ダミー）
   */
  getContainer(): HTMLElement {
    return document.createElement('div')
  }

  /**
   * マップをリサイズ
   */
  resize(): this {
    return this
  }

  /**
   * マップをクリーンアップ
   */
  remove(): void {
    this._listeners.clear()
    this._controls = []
    this._layers.clear()
    this._sources.clear()
  }

  /**
   * 座標をピクセルに変換（ダミー実装）
   */
  project(lngLat: [number, number]): { x: number; y: number } {
    return { x: 0, y: 0 }
  }

  /**
   * ピクセルを座標に変換（ダミー実装）
   */
  unproject(point: { x: number; y: number }): { lng: number; lat: number } {
    return { lng: 0, lat: 0 }
  }
}

/**
 * DrawingToolsをテストするための完全なモック環境を作成
 */
export function createMockMapEnvironment() {
  const map = new MockMap()

  // Map.addControl などのメソッドが確実に存在することを確認
  map.setCenter([137.0, 36.5]).setZoom(10)

  return map
}

/**
 * マップイベント用の型定義
 */
export interface MockMapEvent {
  type: string
  lngLat?: { lng: number; lat: number }
  [key: string]: unknown
}
