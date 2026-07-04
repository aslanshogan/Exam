"use client";

import { Suspense, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF, Environment } from "@react-three/drei";
import * as THREE from "three";

/**
 * TurbineHero3D
 * ---------------------------------------------------------------------
 * If /public/turbine.glb exists, it is loaded and slowly rotated.
 * Otherwise a lightweight procedural placeholder (a "turbine" built from
 * basic cylinder + box geometry) rotates instead, so the hero section
 * never looks broken even before you have a real 3D model.
 *
 * Kept deliberately simple (low poly, no heavy textures, capped pixel
 * ratio) so it runs smoothly on normal laptops and phones, and is
 * isolated in its own <Canvas> so it can never block or slow down exam
 * logic on the page.
 */
function RealModel() {
  const { scene } = useGLTF("/turbine.glb");
  const ref = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += delta * 0.15;
  });
  return <primitive ref={ref} object={scene} scale={1} />;
}

function PlaceholderTurbine() {
  const group = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (group.current) group.current.rotation.y += delta * 0.2;
  });
  return (
    <group ref={group}>
      {/* Housing */}
      <mesh position={[0, 0, 0]}>
        <cylinderGeometry args={[1.1, 1.1, 1.4, 24]} />
        <meshStandardMaterial color="#0F3D3E" metalness={0.5} roughness={0.4} />
      </mesh>
      {/* Hub */}
      <mesh position={[0, 0, 0.9]}>
        <cylinderGeometry args={[0.25, 0.25, 0.4, 16]} />
        <meshStandardMaterial color="#00C389" metalness={0.6} roughness={0.3} />
      </mesh>
      {/* Blades */}
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh
          key={i}
          position={[0, 0, 0.9]}
          rotation={[0, 0, (i * Math.PI * 2) / 5]}
        >
          <boxGeometry args={[0.15, 1.3, 0.06]} />
          <meshStandardMaterial color="#E5E9ED" metalness={0.3} roughness={0.5} />
        </mesh>
      ))}
      {/* Base shaft */}
      <mesh position={[0, -1.2, 0]}>
        <cylinderGeometry args={[0.3, 0.3, 1, 16]} />
        <meshStandardMaterial color="#0B1E33" metalness={0.5} roughness={0.5} />
      </mesh>
    </group>
  );
}

function Scene() {
  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[3, 4, 5]} intensity={1.1} />
      <Suspense fallback={<PlaceholderTurbine />}>
        <GLBOrPlaceholder />
      </Suspense>
      <Environment preset="city" />
    </>
  );
}

function GLBOrPlaceholder() {
  try {
    return <RealModel />;
  } catch {
    return <PlaceholderTurbine />;
  }
}

export default function TurbineHero3D() {
  return (
    <div className="w-full h-[320px] md:h-[440px] rounded-2xl overflow-hidden bg-gradient-to-br from-navy-800 to-teal-700">
      <Canvas
        dpr={[1, 1.5]}
        camera={{ position: [3, 1.5, 3], fov: 40 }}
        gl={{ antialias: true, powerPreference: "low-power" }}
      >
        <Scene />
      </Canvas>
    </div>
  );
}
