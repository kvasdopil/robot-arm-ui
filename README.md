## Robot3

Interactive 3D scene built with Next.js and Three.js. The app renders a fullscreen canvas with a red cube, a grid, and a draggable orange sphere. Camera position/target and sphere position persist across reloads via `localStorage`.

### Tech Stack
- **Framework**: [Next.js](https://nextjs.org) (App Router), TypeScript
- **Styling**: Tailwind CSS v4
- **3D**: three, [@react-three/fiber](https://github.com/pmndrs/react-three-fiber), [@react-three/drei](https://github.com/pmndrs/drei)
- **Lint/Format**: ESLint (flat config) + Prettier

### Implemented Features
- **Fullscreen viewport**: `<Canvas>` fills the page (`w-screen h-screen`).
- **Scene**:
  - Red cube (2×2×2)
  - Drei `Grid` with 1×1 cell size, light gray background, double-sided rendering
  - Camera positioned at (10, 10, 10)
- **Controls**:
  - `OrbitControls` with rotation and zoom limits (min 1, max 100)
  - Draggable orange sphere via `TransformControls` (translate mode). Orbit controls temporarily disable while dragging
- **Persistence**:
  - `usePersistedState` hook saves to `localStorage`
  - Persists camera position, camera target, and sphere position

### Directory Highlights
- `src/app/page.tsx`: Scene, controls, and persistence wiring
- `src/hooks/usePersistedState.ts`: LocalStorage-backed React state hook
- `src/app/layout.tsx`: Global layout and fonts
- `src/app/globals.css`: Tailwind setup and theme variables

### Scripts
```bash
npm run dev        # Start dev server (http://localhost:3000)
npm run build      # Production build
npm run start      # Start prod server
npm run lint       # ESLint
npm run format     # Prettier check
npm run format:fix # Prettier write
```

### Usage
- **Rotate/Zoom**: Use mouse (OrbitControls) to navigate the scene
- **Drag sphere**: Use the transform gizmo to move the orange sphere
- **Persistence**: Camera position/target and sphere position are saved automatically

To reset saved state:
```js
localStorage.removeItem('camera-position');
localStorage.removeItem('camera-target');
localStorage.removeItem('sphere-position');
```

### Development Notes
- Main files to modify: `src/app/page.tsx`, `src/hooks/usePersistedState.ts`
- Tailwind classes are used for layout sizing. The background color is set in-scene via `<color attach="background" ... />`
