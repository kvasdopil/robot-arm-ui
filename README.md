## Robot3

Interactive robotic arm playground using Next.js + Three.js with server-side IK in Python (ikpy).

### Tech Stack

- **Frontend**: Next.js (App Router), TypeScript, Tailwind CSS
- **3D**: three, @react-three/fiber, @react-three/drei
- **IK (server)**: Python 3, ikpy (spawned from Next.js API route)
- **Lint/Format**: ESLint + Prettier

### Features

- Fullscreen 3D scene with grid, orbit controls, and a draggable orange target sphere
- Simple arm visualization with joints: base yaw, shoulder pitch, ankle, fixed ankle2, forearm pitch
- UI sliders for base, shoulder, and forearm angles
- Backend IK endpoint computes angles and a bones chain for visualization
- Camera and target positions persist between reloads

### Project Layout Highlights

- `src/app/page.tsx`: Scene, controls, UI, and calls `/api/ik`
- `src/components/RobotArm.tsx`: Arm visualization receiving angles (radians)
- `src/components/IkDebug.tsx`: Renders bones chain returned by backend
- `src/app/api/ik/route.ts`: Next.js API route spawning Python solver
- `scripts/ik_solver.py`: Python ikpy solver (reads JSON on stdin, prints JSON)
- `src/lib/ikts.ts`: TypeScript IK utilities (kept for reference, client no longer solves IK)

### Prerequisites

- Node.js and npm
- Python 3.9+ available at `/usr/bin/python3` (or compatible)

### Setup

1) Install Node deps

```bash
npm install
```

2) Create venv and install Python deps (ikpy, numpy, scipy, sympy)

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

3) Start Next.js

```bash
npm run dev
```

### Backend IK API

- Path: `POST /api/ik`
- Request body:

```json
{ "target": [x, y, z] }
```

- Response body:

```json
{
  "angles": {
    "baseYawDeg": number,
    "shoulderPitchDeg": number,
    "forearmPitchDeg": number
  },
  "bones": [
    { "name": "base", "start": [x,y,z], "end": [x,y,z] },
    { "name": "shoulder", "start": [x,y,z], "end": [x,y,z] },
    { "name": "ankle", "start": [x,y,z], "end": [x,y,z] },
    { "name": "ankle2", "start": [x,y,z], "end": [x,y,z] },
    { "name": "forearm", "start": [x,y,z], "end": [x,y,z] }
  ],
  "effector": [x, y, z]
}
```

Notes:
- The API uses the project venv Python at `.venv/bin/python` and launches `scripts/ik_solver.py`.
- Arm configuration is currently hardcoded in the solver (base=3, shoulder=4, ankle=10, ankle2=4, forearm=10).

### Python Solver

- Location: `scripts/ik_solver.py`
- Input (stdin): `{ target: [x,y,z], config?: { baseLength, shoulderLength, ankleLength, ankle2Length, forearmLength } }`
- Output (stdout): JSON as per the Backend IK API above
- Kinematic model:
  - base_yaw (rot-Y) → base (fixed +Y)
  - shoulder_joint (rot-X) → shoulder (fixed -X)
  - ankle (fixed +Y) → ankle2 (fixed +X)
  - forearm_joint (rot-X) → forearm (fixed +Y)

Manual test:

```bash
echo '{"target":[1,3,-1]}' | .venv/bin/python scripts/ik_solver.py
```

### Usage

- Orbit to view the scene
- Drag the orange sphere to set the target; on release, the client requests `/api/ik`, applies returned angles to the arm, and renders the bones chain
- Adjust sliders to manually set angles

To reset saved state:

```js
localStorage.removeItem('camera-position');
localStorage.removeItem('camera-target');
localStorage.removeItem('sphere-position');
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
