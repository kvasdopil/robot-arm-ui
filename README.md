## Robot3

Interactive robotic arm playground using Next.js + Three.js with server-side IK in Python (ikpy).

### Tech Stack

- **Frontend**: Next.js (App Router), TypeScript, Tailwind CSS
- **3D**: three, @react-three/fiber, @react-three/drei
- **IK (server)**: Python 3, ikpy (spawned from Next.js API route)
- **Lint/Format**: ESLint + Prettier

### Features

- Fullscreen 3D scene with grid, orbit controls, and multiple draggable target spheres (Add with +)
- Simple arm visualization with joints: base yaw, shoulder pitch, ankle, fixed ankle2, forearm pitch
- UI sliders for base, shoulder, and forearm angles
- Backend IK endpoint computes angles and a bones chain for visualization
- Arm follows the selected target; IK recalculates when you release the drag (mouse up)
- Camera and all targets persist between reloads
- Joint limits: shoulder ±90°, forearm ±135°

### Project Layout Highlights

- `src/app/page.tsx`: Scene, controls, UI, dynamic targets, and calls `/api/ik`
- `src/components/RobotArm.tsx`: Arm visualization receiving angles (radians)
- `src/components/IkDebug.tsx`: Renders bones chain returned by backend
- `src/app/api/ik/route.ts`: Next.js API route spawning Python solver
- `scripts/ik_solver.py`: Python ikpy solver (reads JSON on stdin, prints JSON)
- `src/lib/ikts.ts`: TypeScript IK utilities (kept for reference, client no longer solves IK)

### Prerequisites

- Node.js and npm
- Python 3.9+ available at `/usr/bin/python3` (or compatible)

### Setup

1. Install Node deps

```bash
npm install
```

2. Create venv and install Python deps (ikpy, numpy, scipy, sympy)

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

3. Start Next.js

```bash
npm run dev
```

### Backend IK API

- Path: `POST /api/ik`
- Request body:

```json
{
  "target": [x, y, z],
  "origin": [x, y, z],
  "fractions": [0.25, 0.5, 0.75]
}
```

- Response body:

```json
{
  "intermediates": [
    {
      "angles": { "baseYawDeg": number, "shoulderPitchDeg": number, "forearmPitchDeg": number },
      "bones": [ { "name": string, "start": [x,y,z], "end": [x,y,z] }, ... ],
      "effector": [x, y, z]
    }
  ],
  "final": {
    "angles": { "baseYawDeg": number, "shoulderPitchDeg": number, "forearmPitchDeg": number },
    "bones": [ { "name": string, "start": [x,y,z], "end": [x,y,z] }, ... ],
    "effector": [x, y, z]
  },
  "angles": { "baseYawDeg": number, "shoulderPitchDeg": number, "forearmPitchDeg": number },
  "bones": [ { "name": string, "start": [x,y,z], "end": [x,y,z] }, ... ],
  "effector": [x, y, z]
}
```

Notes:

- The API uses the project venv Python at `.venv/bin/python` and launches `scripts/ik_solver.py`.
- Arm configuration is currently hardcoded in the solver (base=3, shoulder=4, ankle=10, ankle2=4, forearm=10).
- Joint clamps in server output: shoulder ±90°, forearm ±135°.
- If `origin` is provided, the solver returns `intermediates` poses along the straight line determined by `fractions` (defaults to `[0.25, 0.5, 0.75]`).
- IK solves are warm-started from the previous solution to minimize movement between steps.
- If your venv lives elsewhere, update the Python path in `src/app/api/ik/route.ts`.

### Python Solver

- Location: `scripts/ik_solver.py`
- Input (stdin): `{ target: [x,y,z], origin?: [x,y,z], fractions?: number[], config?: { baseLength, shoulderLength, ankleLength, ankle2Length, forearmLength } }`
- Output (stdout): JSON as per the Backend IK API above
- Kinematic model:
  - base_yaw (rot-Y) → base (fixed +Y)
  - shoulder_joint (rot-X) → shoulder (fixed -X)
  - ankle (fixed +Y) → ankle2 (fixed +X)
  - forearm_joint (rot-X) → forearm (fixed +Y)

Manual test:

```bash
# Final only
echo '{"target":[1,3,-1]}' | .venv/bin/python scripts/ik_solver.py

# With origin and intermediates (1/4, 1/2, 3/4)
echo '{"target":[1,3,-1], "origin":[0,2,0], "fractions":[0.25,0.5,0.75]}' | .venv/bin/python scripts/ik_solver.py
```

### Usage

- Orbit to view the scene
- Click numbered buttons to select a target; click + to add another
- Drag the active target sphere; on mouse up the arm animates through intermediates (1/4, 1/2, 3/4 by default) and then to the final target
- Adjust sliders to manually set angles

To reset saved state:

```js
localStorage.removeItem('camera-position');
localStorage.removeItem('camera-target');
localStorage.removeItem('targets');
```

### Troubleshooting

- API returns Python error or timeout:
  - Ensure venv exists (`.venv`) and `pip install -r requirements.txt` succeeded
  - Confirm executable: `.venv/bin/python --version`
  - Run solver manually (see Manual test) to read stderr directly

### Scripts

```bash
npm run dev        # Start dev server (http://localhost:3000)
npm run build      # Production build
npm run start      # Start prod server
npm run lint       # ESLint
npm run format     # Prettier check
npm run format:fix # Prettier write
```

Using yarn:

```bash
yarn dev
yarn build
yarn start
yarn lint     # runs eslint then typecheck (tsc --noEmit)
yarn format   # prettier --write .
```
