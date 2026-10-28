"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useRef, type ReactNode } from "react";
import type { Group } from "three";

function HeroMesh() {
  const group = useRef<Group>(null);

  useFrame((state) => {
    if (!group.current) return;
    group.current.rotation.z = state.clock.elapsedTime * 0.13;
    group.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.38) * 0.08;
  });

  return (
    <group ref={group} position={[1.3, 0.12, 0]}>
      <mesh rotation={[0.55, 0.08, 0.4]}>
        <torusGeometry args={[1.2, 0.025, 12, 96]} />
        <meshBasicMaterial color="#c9ff22" transparent opacity={0.42} />
      </mesh>
      <mesh rotation={[0.55, 0.08, 0.4]}>
        <torusGeometry args={[0.87, 0.012, 10, 56, Math.PI * 1.28]} />
        <meshBasicMaterial color="#f4ffd2" transparent opacity={0.48} />
      </mesh>
      <mesh position={[0, -0.78, -0.1]} rotation={[0, 0, -0.58]}>
        <planeGeometry args={[2.45, 0.012]} />
        <meshBasicMaterial color="#c9ff22" transparent opacity={0.56} />
      </mesh>
    </group>
  );
}

function LifecycleMesh() {
  const group = useRef<Group>(null);

  useFrame((state) => {
    if (!group.current) return;
    group.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.27) * 0.18;
    group.current.position.y = Math.sin(state.clock.elapsedTime * 0.55) * 0.05;
  });

  return (
    <group ref={group} position={[1.5, -0.45, 0]} rotation={[0.36, -0.34, 0.04]}>
      <mesh>
        <boxGeometry args={[1.55, 0.82, 0.06]} />
        <meshBasicMaterial color="#c9ff22" transparent opacity={0.11} />
      </mesh>
      {[0.22, 0, -0.22].map((y) => (
        <mesh key={y} position={[-0.18, y, 0.08]}>
          <planeGeometry args={[0.82, 0.025]} />
          <meshBasicMaterial color="#dfffa0" transparent opacity={0.48} />
        </mesh>
      ))}
      <mesh position={[0.5, -0.18, 0.08]}>
        <circleGeometry args={[0.09, 24]} />
        <meshBasicMaterial color="#c9ff22" />
      </mesh>
    </group>
  );
}

function SceneCanvas({ children }: { children: ReactNode }) {
  return (
    <Canvas
      aria-hidden="true"
      camera={{ position: [0, 0, 4.2], fov: 42 }}
      dpr={[1, 1.5]}
      gl={{ alpha: true, antialias: false, powerPreference: "low-power" }}
    >
      {children}
    </Canvas>
  );
}

export function HeroThreeScene() {
  return <SceneCanvas><HeroMesh /></SceneCanvas>;
}

export function LifecycleThreeScene() {
  return <SceneCanvas><LifecycleMesh /></SceneCanvas>;
}
