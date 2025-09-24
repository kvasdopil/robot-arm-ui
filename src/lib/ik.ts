'use client';

export type Vec3 = [number, number, number];

export type IkConfig = {
    basePosition: Vec3;
    elbowOffsetFromBaseLocal: Vec3; // local offset at yaw=0 (x,z define ring radius; y defines ring height above base)
    endEffectorLength: number;
    pitchMinDeg: number;
    pitchMaxDeg: number;
};

// Constrained FABRIK for this robot geometry:
// - Base at [0, -1, 0]
// - Elbow constrained to ring: y = base.y + 3, radius = 4
// - End effector length = 10 from elbow along local +Y after pitch
// Returns angles in degrees: { yawDeg, pitchDeg }
export function computeIkAnglesFabrik(
    target: Vec3,
    currentAnglesDeg: { yawDeg: number; pitchDeg: number },
    config: IkConfig,
): { yawDeg: number; pitchDeg: number } {
    const base: Vec3 = config.basePosition;
    const ringY = base[1] + config.elbowOffsetFromBaseLocal[1];
    const ringR = Math.hypot(config.elbowOffsetFromBaseLocal[0], config.elbowOffsetFromBaseLocal[2]);
    const link2 = config.endEffectorLength;

    const yaw0 = (currentAnglesDeg.yawDeg * Math.PI) / 180;
    let elbow: Vec3 = [
        base[0] + ringR * Math.cos(yaw0),
        ringY,
        base[2] - ringR * Math.sin(yaw0),
    ];

    let end: Vec3 = (() => {
        const dx = target[0] - elbow[0];
        const dy = target[1] - elbow[1];
        const dz = target[2] - elbow[2];
        const len = Math.hypot(dx, dy, dz) || 1;
        return [elbow[0] + (dx / len) * link2, elbow[1] + (dy / len) * link2, elbow[2] + (dz / len) * link2];
    })();

    const projectElbowToRing = (p: Vec3): Vec3 => {
        const dx = p[0] - base[0];
        const dz = p[2] - base[2];
        const lenXZ = Math.hypot(dx, dz);
        if (lenXZ === 0) {
            return [base[0] + ringR, ringY, base[2]];
        }
        const scale = ringR / lenXZ;
        return [base[0] + dx * scale, ringY, base[2] + dz * scale];
    };

    const maxIter = 20;
    const tol = 1e-3;
    for (let i = 0; i < maxIter; i++) {
        // Backward: set end to target, move elbow to maintain link2, then project elbow to ring
        end = [target[0], target[1], target[2]];
        const dx1 = elbow[0] - end[0];
        const dy1 = elbow[1] - end[1];
        const dz1 = elbow[2] - end[2];
        const len1 = Math.hypot(dx1, dy1, dz1) || 1;
        elbow = [end[0] + (dx1 / len1) * link2, end[1] + (dy1 / len1) * link2, end[2] + (dz1 / len1) * link2];
        elbow = projectElbowToRing(elbow);

        // Forward: base fixed, elbow projected to ring, end at distance link2 from elbow toward target
        elbow = projectElbowToRing(elbow);
        const dx2 = target[0] - elbow[0];
        const dy2 = target[1] - elbow[1];
        const dz2 = target[2] - elbow[2];
        const len2 = Math.hypot(dx2, dy2, dz2) || 1;
        end = [elbow[0] + (dx2 / len2) * link2, elbow[1] + (dy2 / len2) * link2, elbow[2] + (dz2 / len2) * link2];

        const err = Math.hypot(end[0] - target[0], end[1] - target[1], end[2] - target[2]);
        if (err < tol) break;
    }

    // Extract yaw from base->elbow and pitch from elbow->end
    const vBE: Vec3 = [elbow[0] - base[0], elbow[1] - base[1], elbow[2] - base[2]];
    const yaw = Math.atan2(-vBE[2], vBE[0]);
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);
    const vEE: Vec3 = [end[0] - elbow[0], end[1] - elbow[1], end[2] - elbow[2]];
    const ly = vEE[1];
    const lz = -vEE[0] * sinY + vEE[2] * cosY;
    let pitch = Math.atan2(lz, ly);
    // clamp to joint limits
    const pitchMin = (config.pitchMinDeg * Math.PI) / 180;
    const pitchMax = (config.pitchMaxDeg * Math.PI) / 180;
    if (pitch > pitchMax) pitch = pitchMax;
    if (pitch < pitchMin) pitch = pitchMin;

    return { yawDeg: (yaw * 180) / Math.PI, pitchDeg: (pitch * 180) / Math.PI };
}


