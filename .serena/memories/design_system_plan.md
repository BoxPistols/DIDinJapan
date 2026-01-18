# Design System Refactoring Plan

## Objective
Create a unified, cohesive design system with:
1. ✅ Clear color architecture (dark mode)
2. ✅ Glassmorphism effects on modals
3. ✅ CSS Modules instead of inline styles
4. ✅ Reusable design tokens
5. ✅ Consistent typography and spacing

## Color Architecture (Dark Mode)
### Core Colors
- **Primary Background**: #0f1419 (page)
- **Secondary BG**: #1a1f2e (panels/modals)
- **Glass Background**: rgba(26, 31, 46, 0.7) (for glassmorphism)
- **Accent Color**: #4a9eff (primary blue)

### Text Colors
- Primary: #ffffff
- Secondary: #b0b8cc
- Tertiary: #7a8299

### Semantic Colors
- Success: #10b981
- Warning: #f59e0b
- Error: #ef4444

## Files to Create/Modify
1. `src/styles/theme.ts` - Enhanced with color tokens
2. `src/styles/tokens.css` - CSS custom properties
3. `src/components/Modal.module.css` - NEW
4. `src/components/Dialog.module.css` - NEW
5. `src/components/Modal.tsx` - Refactor to use CSS Modules
6. `src/components/Dialog.tsx` - Refactor to use CSS Modules + dark mode
7. `src/index.css` - Add global Glassmorphism styles

## Glassmorphism Properties
- backdrop-filter: blur(10px)
- background: rgba with reduced opacity
- border: 1px solid rgba(255, 255, 255, 0.1)
- box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.1)
