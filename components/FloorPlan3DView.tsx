'use client';

import { Canvas, useThree } from '@react-three/fiber';
import { Edges, Grid, Html, OrbitControls } from '@react-three/drei';
import { useEffect, useLayoutEffect, useMemo } from 'react';
import * as THREE from 'three';
import { getBoundaryPolygonPoints } from '@/lib/sketch-my-home/planBoundary';
import { createBoundaryRingGeometry } from '@/lib/plan3d/boundaryRingGeometry';
import {
  boundarySegmentsFromScene,
  wallMeshesFromScene,
} from '@/lib/plan3d/wallMeshesFromScene';
import {
  combinedBounds3D,
  doorOpenings3DFromScene,
  formatFeetLabel,
  windowOpenings3DFromScene,
} from '@/lib/plan3d/doors3dFromScene';
import type { WallOpening3DBase } from '@/lib/plan3d/wallOpening3d';
import { DEFAULT_GRID_PX_PER_FOOT } from '@/lib/plan3d/constants';
import { staircaseMeshesFromScene } from '@/lib/plan3d/staircaseMeshesFromScene';

function FitCamera({
  center,
  distance,
}: {
  center: THREE.Vector3;
  distance: number;
}) {
  const camera = useThree((s) => s.camera);
  useLayoutEffect(() => {
    camera.position.set(center.x + distance * 0.85, distance * 0.55, center.z + distance * 0.85);
    camera.near = 0.1;
    camera.far = Math.max(distance * 20, 500);
    camera.updateProjectionMatrix();
  }, [camera, center, distance]);
  return null;
}

/** Planner-style glass walls: see grid and interior through faces. */
const WALL_GLASS = {
  color: '#9db4d4',
  opacity: 0.38,
  roughness: 0.22,
  metalness: 0.08,
  emissive: '#0f172a',
  emissiveIntensity: 0.06,
} as const;

function Walls({ specs }: { specs: ReturnType<typeof wallMeshesFromScene> }) {
  return (
    <>
      {specs.map((w) => (
        <mesh
          key={w.id}
          position={[w.position.x, w.position.y, w.position.z]}
          rotation={[0, w.rotationY, 0]}
          renderOrder={2}
        >
          <boxGeometry args={[w.lengthFt, w.heightFt, w.thicknessFt]} />
          <meshStandardMaterial
            color={WALL_GLASS.color}
            transparent
            opacity={WALL_GLASS.opacity}
            roughness={WALL_GLASS.roughness}
            metalness={WALL_GLASS.metalness}
            emissive={WALL_GLASS.emissive}
            emissiveIntensity={WALL_GLASS.emissiveIntensity}
            depthWrite={false}
            side={THREE.DoubleSide}
            polygonOffset
            polygonOffsetFactor={1}
            polygonOffsetUnits={1}
          />
        </mesh>
      ))}
    </>
  );
}

function BoundaryEdges({
  specs,
}: {
  specs: ReturnType<typeof boundarySegmentsFromScene>;
}) {
  return (
    <>
      {specs.map((w) => (
        <mesh
          key={w.id}
          position={[w.position.x, w.position.y, w.position.z]}
          rotation={[0, w.rotationY, 0]}
          renderOrder={1}
        >
          <boxGeometry args={[w.lengthFt, w.heightFt, w.thicknessFt]} />
          <meshStandardMaterial
            color="#ea9a3a"
            transparent
            opacity={0.7}
            emissive="#78350f"
            emissiveIntensity={0.1}
            roughness={0.6}
            metalness={0.06}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </>
  );
}

const BOUNDARY_THICKNESS_FT = 3 / 12;
const BOUNDARY_HEIGHT_FT = 2.5;

/** Light red, semi-transparent — distinct from amber site boundary. */
const STAIR_3D = {
  tread: '#fca5a5',
  treadEdge: '#b91c1c',
  roughness: 0.5,
  metalness: 0.06,
  opacity: 0.62,
  emissive: '#450a0a',
  emissiveIntensity: 0.06,
} as const;

function StaircaseMeshes({
  specs,
}: {
  specs: ReturnType<typeof staircaseMeshesFromScene>;
}) {
  return (
    <>
      {specs.map((st) => (
        <group
          key={st.id}
          position={[st.position.x, st.position.y, st.position.z]}
          rotation={[0, st.rotationY, 0]}
          renderOrder={3}
        >
          {st.treads.map((t, i) => (
            <mesh key={`${st.id}-t-${i}`} position={[t.cx, t.cy, t.cz]} castShadow receiveShadow>
              <boxGeometry args={[t.w, t.h, t.d]} />
              <meshStandardMaterial
                color={STAIR_3D.tread}
                transparent
                opacity={STAIR_3D.opacity}
                roughness={STAIR_3D.roughness}
                metalness={STAIR_3D.metalness}
                emissive={STAIR_3D.emissive}
                emissiveIntensity={STAIR_3D.emissiveIntensity}
                depthWrite={false}
              />
              <Edges color={STAIR_3D.treadEdge} threshold={10} />
            </mesh>
          ))}
        </group>
      ))}
    </>
  );
}

function WallOpeningMeshes({ openings }: { openings: WallOpening3DBase[] }) {
  return (
    <>
      {openings.map((o) => {
        const d = o.getMeshSpec();
        const dims = o.getEffectiveMeshDimensions();
        const vis = o.getVisualStyle();
        const opacity = vis.fillOpacity ?? 0.22;
        const roughness = vis.roughness ?? 0.35;
        const metalness = vis.metalness ?? 0.12;
        const emissive = vis.emissive ?? '#000000';
        const emissiveIntensity = vis.emissiveIntensity ?? 0;
        return (
          <group key={d.id}>
            <group position={[d.position.x, d.position.y, d.position.z]} rotation={[0, d.rotationY, 0]}>
              <mesh renderOrder={4}>
                <boxGeometry args={[dims.widthFt, dims.heightFt, dims.depthFt]} />
                <meshStandardMaterial
                  color={vis.fillColor}
                  transparent
                  opacity={opacity}
                  depthWrite={false}
                  roughness={roughness}
                  metalness={metalness}
                  emissive={emissive}
                  emissiveIntensity={emissiveIntensity}
                  side={THREE.DoubleSide}
                />
                <Edges color={vis.edgeColor} threshold={12} renderOrder={5} />
              </mesh>
            </group>
            {d.distStartFt != null &&
              d.widthAlongWallFt != null &&
              d.distEndFt != null &&
              d.labelStartMid &&
              d.labelWidthCenter &&
              d.labelEndMid && (
                <>
                  <Html position={d.labelStartMid} center style={vis.labelStyle}>
                    {formatFeetLabel(d.distStartFt)}
                  </Html>
                  <Html position={d.labelWidthCenter} center style={vis.labelStyle}>
                    {formatFeetLabel(d.widthAlongWallFt)} wide
                  </Html>
                  <Html position={d.labelEndMid} center style={vis.labelStyle}>
                    {formatFeetLabel(d.distEndFt)}
                  </Html>
                </>
              )}
          </group>
        );
      })}
    </>
  );
}

function LotFloorFill({
  points,
  gridPxPerFoot,
}: {
  points: { x: number; y: number }[];
  gridPxPerFoot: number;
}) {
  const geometry = useMemo(() => {
    if (points.length < 3) return null;
    const s = 1 / gridPxPerFoot;
    const shape = new THREE.Shape();
    // Shape is drawn in local XY, then `rotateX(-π/2)` maps vertex (sx, sy, 0) → world Z = -sy.
    // Plan Z from canvas is zFt = -y·s, so use sy = y·s (same feet as walls from `canvasPxToPlan3DFt`).
    shape.moveTo(points[0].x * s, points[0].y * s);
    for (let i = 1; i < points.length; i++) {
      shape.lineTo(points[i].x * s, points[i].y * s);
    }
    shape.closePath();
    const geom = new THREE.ShapeGeometry(shape);
    geom.rotateX(-Math.PI / 2);
    return geom;
  }, [points, gridPxPerFoot]);

  useEffect(() => {
    return () => {
      geometry?.dispose();
    };
  }, [geometry]);

  if (!geometry) return null;

  return (
    <mesh geometry={geometry} position={[0, 0.02, 0]} receiveShadow>
      <meshStandardMaterial
        color="#f59e0b"
        transparent
        opacity={0.14}
        depthWrite={false}
        roughness={1}
        metalness={0}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

export default function FloorPlan3DView({
  scene,
  gridPxPerFoot = DEFAULT_GRID_PX_PER_FOOT,
}: {
  scene: unknown[];
  gridPxPerFoot?: number;
}) {
  const specs = useMemo(
    () => wallMeshesFromScene(scene, gridPxPerFoot),
    [scene, gridPxPerFoot]
  );
  const boundarySpecs = useMemo(
    () => boundarySegmentsFromScene(scene, gridPxPerFoot),
    [scene, gridPxPerFoot]
  );
  const doorOpenings = useMemo(
    () => doorOpenings3DFromScene(scene, gridPxPerFoot),
    [scene, gridPxPerFoot]
  );
  const windowOpenings = useMemo(
    () => windowOpenings3DFromScene(scene, gridPxPerFoot),
    [scene, gridPxPerFoot]
  );
  const staircaseSpecs = useMemo(
    () => staircaseMeshesFromScene(scene, gridPxPerFoot),
    [scene, gridPxPerFoot]
  );
  const allOpeningSpecs = useMemo(
    () => [...doorOpenings, ...windowOpenings].map((o) => o.getMeshSpec()),
    [doorOpenings, windowOpenings]
  );
  const lotPoints = useMemo(() => {
    const pts = getBoundaryPolygonPoints(Array.isArray(scene) ? scene : []);
    return pts && pts.length >= 3 ? pts : null;
  }, [scene]);

  const boundaryRingGeometry = useMemo(() => {
    if (!lotPoints) return null;
    return createBoundaryRingGeometry(
      lotPoints,
      gridPxPerFoot,
      BOUNDARY_THICKNESS_FT,
      BOUNDARY_HEIGHT_FT
    );
  }, [lotPoints, gridPxPerFoot]);

  useEffect(() => {
    return () => {
      boundaryRingGeometry?.dispose();
    };
  }, [boundaryRingGeometry]);

  const { center, size } = useMemo(
    () => combinedBounds3D(specs, boundarySpecs, allOpeningSpecs, staircaseSpecs),
    [specs, boundarySpecs, allOpeningSpecs, staircaseSpecs]
  );

  return (
    <Canvas
      gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
      className="h-full w-full"
    >
      <color attach="background" args={['#020617']} />
      <ambientLight intensity={0.45} />
      <directionalLight position={[size, size * 1.2, size * 0.6]} intensity={0.9} />
      <hemisphereLight args={['#e2e8f0', '#0f172a', 0.35]} />
      <FitCamera center={center} distance={size} />
      <Grid
        position={[center.x, 0, center.z]}
        args={[size * 4, size * 4]}
        cellSize={1}
        sectionSize={5}
        fadeDistance={size * 3}
        sectionColor="#334155"
        cellColor="#1e293b"
        infiniteGrid
      />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[center.x, -0.01, center.z]}>
        <planeGeometry args={[size * 8, size * 8]} />
        <meshStandardMaterial color="#0f172a" roughness={1} metalness={0} />
      </mesh>
      {lotPoints ? <LotFloorFill points={lotPoints} gridPxPerFoot={gridPxPerFoot} /> : null}
      {boundaryRingGeometry ? (
        <mesh geometry={boundaryRingGeometry} renderOrder={1} receiveShadow>
          <meshStandardMaterial
            color="#ea9a3a"
            transparent
            opacity={0.72}
            emissive="#78350f"
            emissiveIntensity={0.08}
            roughness={0.55}
            metalness={0.05}
            depthWrite={false}
            side={THREE.DoubleSide}
            polygonOffset
            polygonOffsetFactor={1}
            polygonOffsetUnits={1}
          />
        </mesh>
      ) : (
        <BoundaryEdges specs={boundarySpecs} />
      )}
      <Walls specs={specs} />
      <StaircaseMeshes specs={staircaseSpecs} />
      <WallOpeningMeshes openings={[...doorOpenings, ...windowOpenings]} />
      <OrbitControls makeDefault target={[center.x, center.y * 0.35, center.z]} maxPolarAngle={Math.PI / 2 - 0.08} />
    </Canvas>
  );
}
