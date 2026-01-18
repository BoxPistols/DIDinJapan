# DID in Japan - Project Overview

## Purpose
ドローン飛行計画ツール - 日本の人口集中地区（DID）・空港周辺空域・飛行禁止区域をインタラクティブに表示

## Tech Stack
- React 18.x + TypeScript
- MapLibre GL 4.0.x
- Vite (build tool)
- CSS Modules for styling

## Code Structure
```
src/
├── components/       # React components
│  ├── DrawingTools.tsx    # Main tool for drawing/managing features
│  ├── Modal.tsx           # Generic modal dialog
│  ├── Dialog.tsx          # Confirm dialog
│  ├── CoordinateInfoPanel.tsx
│  ├── CoordinateDisplay.tsx
│  ├── CustomLayerManager.tsx
│  └── CoordinateInfoPanel.module.css
├── styles/
│  └── theme.ts       # Design tokens & theme definition
├── utils/            # Utility functions
├── lib/              # Core library code
└── index.css         # Global styles

## Current Design System Status
- ✅ theme.ts: Basic color tokens for dark/light mode
- ⚠️ Modal.tsx: Heavy inline styles, needs Glassmorphism
- ⚠️ Dialog.tsx: Inline styles, not responsive to dark mode (always light)
- ✅ CoordinateInfoPanel.module.css: Good CSS Modules structure

## Key Issues to Fix
1. Modal/Dialog components have lots of inline styles
2. Dialog.tsx is always light-themed (not respecting dark mode)
3. No Glassmorphism effect on modals
4. Inconsistent color architecture across components
5. Need to create CSS Module files for Modal and Dialog
