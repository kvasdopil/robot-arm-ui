#!/usr/bin/env python3
import sys
import json
import math

try:
    from ikpy.chain import Chain
    from ikpy.link import OriginLink, URDFLink
except Exception as e:
    print(json.dumps({"error": "ikpy not available", "details": str(e)}))
    sys.exit(1)


def clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def to_deg(rad: float) -> float:
    return rad * 180.0 / math.pi


def vec_from_frame(frame):
    # frame: 4x4
    return [float(frame[0, 3]), float(frame[1, 3]), float(frame[2, 3])]


def build_chain(cfg):
    base_len = float(cfg.get("baseLength", 3))
    shoulder_len = float(cfg.get("shoulderLength", 4))
    ankle_len = float(cfg.get("ankleLength", 10))
    ankle2_len = float(cfg.get("ankle2Length", 4))
    forearm_len = float(cfg.get("forearmLength", 10))

    # We construct a chain with 9 links (3 actuated joints), ensuring each revolute joint is followed by a fixed-length link
    # so the rotation affects the end-effector position:
    # 1) base_yaw (rot-y)
    # 2) base_len (fixed)
    # 3) shoulder_joint (rot-x)
    # 4) shoulder_link (fixed -X)
    # 5) ankle_link (fixed +Y)
    # 6) ankle2_link (fixed +X)
    # 7) forearm_joint (rot-x)
    # 8) forearm_link (fixed +Y)

    return Chain(name="robot_arm", links=[
        OriginLink(),
        # Base yaw: revolute around Y
        URDFLink(
            name="base_yaw",
            origin_translation=[0.0, -1.0, 0.0],
            origin_orientation=[0.0, 0.0, 0.0],
            rotation=[0.0, 1.0, 0.0],
            bounds=(-math.pi, math.pi),
            joint_type="revolute",
        ),
        # Base fixed link up
        URDFLink(
            name="base",
            origin_translation=[0.0, base_len, 0.0],
            origin_orientation=[0.0, 0.0, 0.0],
            joint_type="fixed",
        ),
        # Shoulder joint: revolute around X (pitch)
        URDFLink(
            name="shoulder_joint",
            origin_translation=[0.0, 0.0, 0.0],
            origin_orientation=[0.0, 0.0, 0.0],
            rotation=[1.0, 0.0, 0.0],
            bounds=(-math.pi/2, math.pi/2),
            joint_type="revolute",
        ),
        # Shoulder link: fixed -X
        URDFLink(
            name="shoulder",
            origin_translation=[-shoulder_len, 0.0, 0.0],
            origin_orientation=[0.0, 0.0, 0.0],
            joint_type="fixed",
        ),
        # Ankle: fixed up
        URDFLink(
            name="ankle",
            origin_translation=[0.0, ankle_len, 0.0],
            origin_orientation=[0.0, 0.0, 0.0],
            joint_type="fixed",
        ),
        # Ankle2: fixed +X
        URDFLink(
            name="ankle2",
            origin_translation=[ankle2_len, 0.0, 0.0],
            origin_orientation=[0.0, 0.0, 0.0],
            joint_type="fixed",
        ),
        # Forearm joint: revolute around X (same axis as shoulder)
        URDFLink(
            name="forearm_joint",
            origin_translation=[0.0, 0.0, 0.0],
            origin_orientation=[0.0, 0.0, 0.0],
            rotation=[1.0, 0.0, 0.0],
            bounds=(-3*math.pi/4, 3*math.pi/4),
            joint_type="revolute",
        ),
        # Forearm link: fixed +Y
        URDFLink(
            name="forearm",
            origin_translation=[0.0, forearm_len, 0.0],
            origin_orientation=[0.0, 0.0, 0.0],
            joint_type="fixed",
        ),
    ])


def main():
    raw = sys.stdin.read()
    try:
        payload = json.loads(raw)
    except Exception:
        print(json.dumps({"error": "Invalid JSON input"}))
        sys.exit(1)

    target = payload.get("target")
    origin = payload.get("origin")
    fractions = payload.get("fractions")
    cfg = payload.get("config", {})
    if not isinstance(target, list) or len(target) != 3:
        print(json.dumps({"error": "Invalid target"}))
        sys.exit(1)

    chain = build_chain(cfg)

    # Helper to solve IK and return angles/bones/effector
    def solve_pose(target_pos):
        init = [0.0 for _ in chain.links]
        ik = chain.inverse_kinematics(target_position=target_pos, initial_position=init)
        frames = chain.forward_kinematics(ik, full_kinematics=True)
        pts = [vec_from_frame(f) for f in frames]
        bone_defs = [
            ("base", 1, 2),
            ("shoulder", 2, 4),
            ("ankle", 4, 5),
            ("ankle2", 5, 6),
            ("forearm", 6, 8),
        ]
        bones_loc = [
            {"name": n, "start": pts[i], "end": pts[j]}
            for (n, i, j) in bone_defs
        ]
        base_yaw_loc = to_deg(ik[1])
        shoulder_pitch_loc = to_deg(ik[3])
        forearm_pitch_loc = to_deg(ik[7])
        return {
            "angles": {
                "baseYawDeg": base_yaw_loc,
                "shoulderPitchDeg": clamp(shoulder_pitch_loc, -90.0, 90.0),
                "forearmPitchDeg": clamp(forearm_pitch_loc, -135.0, 135.0),
            },
            "bones": bones_loc,
            "effector": pts[-1],
        }

    try:
        if isinstance(origin, list) and len(origin) == 3:
            # Validate and build fractions list (exclusive of 0 and 1)
            fracs: list[float] = []
            if isinstance(fractions, list) and len(fractions) > 0:
                for f in fractions:
                    try:
                        fv = float(f)
                        if 0.0 < fv < 1.0:
                            fracs.append(fv)
                    except Exception:
                        pass
                fracs = sorted(list(dict.fromkeys(fracs)))
            else:
                fracs = [0.25, 0.5, 0.75]

            # Build intermediate points along the straight line from origin to target
            ox, oy, oz = float(origin[0]), float(origin[1]), float(origin[2])
            tx, ty, tz = float(target[0]), float(target[1]), float(target[2])
            intermediates = []
            for f in fracs:
                p = [
                    ox + (tx - ox) * f,
                    oy + (ty - oy) * f,
                    oz + (tz - oz) * f,
                ]
                intermediates.append(solve_pose(p))

            final_pose = solve_pose(target)
            out = {
                "intermediates": intermediates,
                "final": final_pose,
                # Back-compat top-level mirrors final
                "angles": final_pose["angles"],
                "bones": final_pose["bones"],
                "effector": final_pose["effector"],
            }
            print(json.dumps(out))
        else:
            final_pose = solve_pose(target)
            out = {
                "intermediates": [],
                "final": final_pose,
                "angles": final_pose["angles"],
                "bones": final_pose["bones"],
                "effector": final_pose["effector"],
            }
            print(json.dumps(out))
    except Exception as e:
        print(json.dumps({"error": "IK failed", "details": str(e)}))
        sys.exit(2)


if __name__ == "__main__":
    main()


