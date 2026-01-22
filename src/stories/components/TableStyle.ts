/**
 * 共通テーブルスタイル定義
 * Storybookドキュメント用の統一されたテーブルスタイル
 */
export const TableStyle = {
  // テーブル全体
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    margin: '16px 0',
  },
  // テーブルヘッダー（<thead>要素に適用）
  thead: {
    backgroundColor: 'rgba(74, 158, 255, 0.1)',
    borderBottom: '2px solid rgba(74, 158, 255, 0.3)',
  },
  // ヘッダーセル（<th>要素に適用）
  th: {
    padding: '12px',
    textAlign: 'left',
    fontWeight: 600,
  },
  // データ行（<tr>要素に適用）
  tr: {
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
  },
  // データセル（<td>要素に適用）
  td: {
    padding: '12px',
  },
  // 中央揃えデータセル
  tdCenter: {
    padding: '12px',
    textAlign: 'center',
  },
  // インラインコード
  code: {
    backgroundColor: 'rgba(74, 158, 255, 0.1)',
    padding: '2px 6px',
    borderRadius: '4px',
    fontFamily: 'monospace',
  },
  // 強調テキスト
  strong: {
    fontWeight: 700,
  },
} as const

export type TableStyleType = typeof TableStyle