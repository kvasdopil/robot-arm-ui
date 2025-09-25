'use client';

import { ReactNode } from 'react';

type Vec3 = [number, number, number];

function AxisRotation({
    axis,
    angle = 0,
    offset = [0, 0, 0],
    children,
}: {
    axis: Vec3;
    angle?: number;
    offset?: Vec3;
    children?: ReactNode;
}) {
    const rot: Vec3 = [0, 0, 0];
    if (axis[0]) rot[0] = angle;
    if (axis[1]) rot[1] = angle;
    if (axis[2]) rot[2] = angle;
    return (
        <group position={offset} rotation={rot}>
            {children}
        </group>
    );
}

export function RobotArm({ angle1 = 0, angle2 = 0, angle3 = 0 }: { angle1?: number; angle2?: number; angle3?: number }) {
    return (
        <group>
            {/* Base segment: cylinder 20x20x2 cm at (0,0,-1) */}
            <group position={[0, -1, 0]}>
                <mesh>
                    <cylinderGeometry args={[10, 10, 2, 32]} />
                    <meshStandardMaterial color="#808080" transparent opacity={0.2} depthWrite={false} />
                </mesh>
                <mesh position={[0, 3, 0]}>
                    <cylinderGeometry args={[2, 2, 4, 32]} />
                    <meshStandardMaterial color="#808080" transparent opacity={0.2} depthWrite={false} />
                </mesh>

                {/* First joint: vertical axis (Y) at 0,0 */}
                <AxisRotation axis={[0, 1, 0]} angle={angle1} offset={[0, 0, 0]}>
                    <mesh position={[4, 3, 0]} rotation={[0, 0, Math.PI / 2]}>
                        <cylinderGeometry args={[2, 2, 4, 24]} />
                        <meshStandardMaterial color="#ff0000" transparent opacity={0.3} depthWrite={false} />
                    </mesh>

                    {/* Shoulder segment (no visualization), second joint at 0,0,3 with horizontal X axis */}
                    <AxisRotation axis={[1, 0, 0]} angle={angle2} offset={[4, 3, 0]}>
                        {/* Ankle segment: cylinder 4x4x10 cm */}
                        <mesh position={[0, 5, 0]}>
                            <cylinderGeometry args={[2, 2, 10, 24]} />
                            <meshStandardMaterial color="#ff0000" transparent opacity={0.3} depthWrite={false} />
                        </mesh>

                        {/* ankle2: fixed offset [-3, 0, 0] relative to ankle end */}
                        <group position={[-4, 10, 0]}>
                            <mesh rotation={[0, 0, Math.PI / 2]}>
                                <cylinderGeometry args={[2, 2, 4, 16]} />
                                <meshStandardMaterial color="#00aa00" transparent opacity={0.5} depthWrite={false} />
                            </mesh>

                            {/* forearm: rotates around ankle2, extend along +Y */}
                            <AxisRotation axis={[1, 0, 0]} angle={angle3} offset={[0, 0, 0]}>
                                <mesh position={[0, 5, 0]}>
                                    <cylinderGeometry args={[2, 2, 10, 24]} />
                                    <meshStandardMaterial color="#00aa00" transparent opacity={0.35} depthWrite={false} />
                                </mesh>
                            </AxisRotation>
                        </group>
                    </AxisRotation>
                </AxisRotation>
            </group>
        </group>
    );
}

export default RobotArm;
