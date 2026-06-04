import { Suspense, useEffect, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import { ArcballControls, Html } from '@react-three/drei'
import { BrainModel } from './BrainModel'
import { CameraRig } from './CameraRig'

function LoadingFallback() {
  return (
    <Html center>
      <div className="flex flex-col items-center gap-3">
        <div className="w-12 h-12 rounded-full border-2 border-violet-400 border-t-transparent animate-spin" />
        <p className="text-zinc-400 text-sm font-medium">Loading brain…</p>
      </div>
    </Html>
  )
}

function Controls() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ref = useRef<any>(null)
  useEffect(() => {
    if (ref.current) ref.current.setGizmosVisible(false)
  }, [])
  return (
    <ArcballControls
      ref={ref}
      makeDefault
      enablePan={false}
      minDistance={1.5}
      maxDistance={6}
      dampingFactor={25}
      enableAnimations
    />
  )
}

export function BrainScene() {
  return (
    <Canvas
      camera={{ position: [0, 0.5, 3.2], fov: 38 }}
      gl={{ antialias: true, alpha: false }}
      style={{ background: 'transparent' }}
    >
      <color attach="background" args={['#09090b']} />

      <ambientLight intensity={0.35} />
      <directionalLight position={[4, 6, 5]} intensity={1.6} color="#ffffff" castShadow={false} />
      <directionalLight position={[-5, 1, -4]} intensity={0.55} color="#b8a4f5" />
      <directionalLight position={[0, -3, 3]} intensity={0.25} color="#d4e8ff" />
      <hemisphereLight args={['#1a1530', '#060608', 0.4]} />

      <Suspense fallback={<LoadingFallback />}>
        <BrainModel />
      </Suspense>

      <CameraRig />
      <Controls />
    </Canvas>
  )
}
