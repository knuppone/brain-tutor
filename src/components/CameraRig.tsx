import { useRef, useEffect } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useBrainStore } from '../store/useBrainStore'
import { regionsById } from '../data/regions'

export function CameraRig() {
  const { camera } = useThree()
  const targetPos = useRef(new THREE.Vector3(0, 0.5, 3))
  const targetLook = useRef(new THREE.Vector3(0, 0, 0))
  const currentPos = useRef(new THREE.Vector3(0, 0.5, 3))
  const currentLook = useRef(new THREE.Vector3(0, 0, 0))
  const animating = useRef(false)
  const progress = useRef(1)

  const selectedId = useBrainStore((s) => s.selectedRegionId)
  const fromCurriculum = useBrainStore((s) => s.cameraFromCurriculum)
  const prevSelected = useRef<string | null>(null)

  useEffect(() => {
    if (selectedId && fromCurriculum && selectedId !== prevSelected.current) {
      const region = regionsById[selectedId]
      if (region?.cameraPosition && region?.cameraTarget) {
        currentPos.current.copy(camera.position)
        targetPos.current.set(...region.cameraPosition)
        targetLook.current.set(...region.cameraTarget)
        animating.current = true
        progress.current = 0
      }
    }
    prevSelected.current = selectedId
  }, [selectedId, fromCurriculum, camera])

  useFrame((_, delta) => {
    if (!animating.current) return
    progress.current = Math.min(1, progress.current + delta * 1.4)
    const t = easeInOutCubic(progress.current)
    camera.position.lerpVectors(currentPos.current, targetPos.current, t)
    currentLook.current.lerp(targetLook.current, t * 0.08)
    camera.lookAt(currentLook.current)
    if (progress.current >= 1) animating.current = false
  })

  return null
}

function easeInOutCubic(x: number): number {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
}
