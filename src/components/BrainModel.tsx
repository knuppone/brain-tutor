import { useMemo, useEffect } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { useLoader } from '@react-three/fiber'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { ThreeEvent } from '@react-three/fiber'
import { regionsById, buildMeshLookup } from '../data/regions'
import { useBrainStore } from '../store/useBrainStore'

export { buildMeshLookup }

// ── Cortex region classification (on normalized unit sphere) ─────────────────

const CORTEX_IDS = ['frontal-lobe', 'parietal-lobe', 'temporal-lobe', 'occipital-lobe'] as const
type CortexId = typeof CORTEX_IDS[number]

function classifyCortex(nx: number, ny: number, nz: number): number {
  // After RAS→Y-up transform: ny=superior(+up), nz=anterior(+forward toward camera)
  // 0=frontal, 1=parietal, 2=temporal, 3=occipital
  if (ny > 0.42) return 1               // top → parietal
  if (nz > 0.28 && ny > -0.18) return 0 // front → frontal
  if (nz < -0.28 && ny > -0.50) return 3 // back → occipital
  if (Math.abs(nx) > 0.52) return 2     // sides → temporal
  if (nz > 0.05) return 0
  return 3
}

// ── Cortex geometry from real FreeSurfer OBJ ─────────────────────────────────

function processCortexGeo(obj: THREE.Group): { geo: THREE.BufferGeometry; baseColors: Float32Array } {
  // Collect all hemisphere meshes (rh + lh) and merge them
  const geos: THREE.BufferGeometry[] = []
  obj.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      geos.push((child as THREE.Mesh).geometry.clone())
    }
  })
  if (geos.length === 0) throw new Error('No mesh in brain OBJ')

  const geo = geos.length > 1 ? mergeGeometries(geos) : geos[0]
  // Discard individual clones after merge
  if (geos.length > 1) geos.forEach(g => g.dispose())

  // Center and normalize scale
  geo.computeBoundingBox()
  const box = geo.boundingBox!
  const center = new THREE.Vector3()
  box.getCenter(center)
  const size = new THREE.Vector3()
  box.getSize(size)
  const s = 0.92 / Math.max(size.x, size.y, size.z)
  geo.translate(-center.x, -center.y, -center.z)
  geo.scale(s, s, s)

  // RAS → Y-up, front-facing:
  //   X' = -X (left-right flip maintains det=1 with the axis swap)
  //   Y' =  Z (FreeSurfer Z=superior → Three.js Y=up)
  //   Z' =  Y (FreeSurfer Y=anterior → Three.js Z=toward camera)
  geo.applyMatrix4(new THREE.Matrix4().set(
    -1, 0, 0, 0,
     0, 0, 1, 0,
     0, 1, 0, 0,
     0, 0, 0, 1
  ))

  geo.computeVertexNormals()

  // Assign per-vertex lobe colors and region IDs
  const pos = geo.attributes.position as THREE.BufferAttribute
  const n = pos.count
  const regionColor = CORTEX_IDS.map(id => new THREE.Color(regionsById[id]!.color))
  const colors = new Float32Array(n * 3)
  const rids = new Float32Array(n)

  for (let i = 0; i < n; i++) {
    const px = pos.getX(i)
    const py = pos.getY(i)
    const pz = pos.getZ(i)
    const len = Math.sqrt(px * px + py * py + pz * pz)
    const rid = len > 0.001 ? classifyCortex(px / len, py / len, pz / len) : 0
    rids[i] = rid
    const c = regionColor[rid]
    colors[i * 3] = c.r
    colors[i * 3 + 1] = c.g
    colors[i * 3 + 2] = c.b
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geo.setAttribute('regionIdx', new THREE.BufferAttribute(rids, 1))

  return { geo, baseColors: colors.slice() }
}

// ── BrainCortex component ─────────────────────────────────────────────────────

function BrainCortex() {
  const hoveredId = useBrainStore(s => s.hoveredRegionId)
  const selectedId = useBrainStore(s => s.selectedRegionId)
  const setHovered = useBrainStore(s => s.setHovered)
  const setSelected = useBrainStore(s => s.setSelected)

  const obj = useLoader(OBJLoader, '/models/brain-cortex.obj')
  const { geo, baseColors } = useMemo(() => processCortexGeo(obj), [obj])

  const isInteriorSelected =
    selectedId !== null &&
    selectedId !== 'cerebral-cortex' &&
    !(CORTEX_IDS as readonly string[]).includes(selectedId)

  const mat = useMemo(() => new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 0.55,
    metalness: 0.0,
    clearcoat: 0.18,
    clearcoatRoughness: 0.45,
    transparent: isInteriorSelected,
    opacity: isInteriorSelected ? 0.12 : 1.0,
    depthWrite: !isInteriorSelected,
    side: THREE.FrontSide,
  }), [isInteriorSelected])

  // Repaint vertex colors when hover / select changes
  useEffect(() => {
    const colorAttr = geo.attributes.color as THREE.BufferAttribute
    const ridAttr = geo.attributes.regionIdx as THREE.BufferAttribute

    const selIdx = selectedId ? (CORTEX_IDS as readonly string[]).indexOf(selectedId) : -1
    const hovIdx = hoveredId ? (CORTEX_IDS as readonly string[]).indexOf(hoveredId) : -1
    const isCerebralSel = selectedId === 'cerebral-cortex'
    const hasCortexSel = selIdx >= 0

    for (let i = 0; i < ridAttr.count; i++) {
      const rid = Math.round(ridAttr.getX(i))
      const b = i * 3
      let r = baseColors[b], g = baseColors[b + 1], bl = baseColors[b + 2]

      if (isCerebralSel) {
        r = Math.min(1, r * 1.22 + 0.05)
        g = Math.min(1, g * 1.22 + 0.05)
        bl = Math.min(1, bl * 1.22 + 0.05)
      } else if (hasCortexSel) {
        if (rid === selIdx) {
          r = Math.min(1, r * 1.30 + 0.10)
          g = Math.min(1, g * 1.30 + 0.10)
          bl = Math.min(1, bl * 1.30 + 0.10)
        } else {
          r *= 0.20; g *= 0.20; bl *= 0.20
        }
      } else if (hovIdx >= 0 && rid === hovIdx) {
        r = Math.min(1, r * 1.20 + 0.06)
        g = Math.min(1, g * 1.20 + 0.06)
        bl = Math.min(1, bl * 1.20 + 0.06)
      }

      colorAttr.setXYZ(i, r, g, bl)
    }
    colorAttr.needsUpdate = true
  }, [selectedId, hoveredId, geo, baseColors])

  const regionAtFace = (e: ThreeEvent<PointerEvent | MouseEvent>): CortexId | null => {
    const face = (e as unknown as { face: THREE.Face | null }).face
    if (!face) return null
    const ridAttr = geo.attributes.regionIdx as THREE.BufferAttribute
    const rid = Math.round(ridAttr.getX(face.a))
    return CORTEX_IDS[rid] ?? null
  }

  return (
    <mesh
      geometry={geo}
      material={mat}
      onPointerMove={(e) => {
        e.stopPropagation()
        const id = regionAtFace(e)
        if (id) {
          setHovered(id)
          document.body.style.cursor = 'pointer'
        }
      }}
      onPointerOut={(e) => {
        e.stopPropagation()
        setHovered(null)
        document.body.style.cursor = 'auto'
      }}
      onClick={(e) => {
        e.stopPropagation()
        const id = regionAtFace(e)
        if (id) setSelected(id, false)
      }}
    />
  )
}

// ── Cerebellum geometry (procedural, visually OK for a rear structure) ────────

function buildCerebellumGeometry() {
  const geo = new THREE.IcosahedronGeometry(1.0, 4)
  const pos = geo.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    const ox = pos.getX(i), oy = pos.getY(i), oz = pos.getZ(i)
    let x = ox * 0.38, y = oy * 0.22, z = oz * 0.28
    // Simple noise for folia-like texture
    const n = Math.sin(ox * 12.3 + oy * 7.8 + oz * 9.1) * 0.035
    const len = Math.sqrt(x * x + y * y + z * z)
    x += (x / len) * n; y += (y / len) * n; z += (z / len) * n
    pos.setXYZ(i, x, y, z)
  }
  geo.computeVertexNormals()
  return geo
}

// ── Subcortical & external structures ────────────────────────────────────────

const SPHERE_GEO = new THREE.SphereGeometry(0.5, 32, 24)
const CYLINDER_GEO = new THREE.CylinderGeometry(0.5, 0.38, 1, 20)
let CEREBELLUM_GEO: THREE.BufferGeometry | null = null

interface SubInstance {
  regionId: string
  position: [number, number, number]
  scale: [number, number, number]
  geoType?: 'sphere' | 'cylinder' | 'cerebellum'
}

// Positions tuned for normalized OBJ brain occupying roughly:
//   X: ±0.36, Y: −0.45 (inferior) to +0.45 (superior), Z: −0.34 (posterior) to +0.34 (anterior)
const SUB_INSTANCES: SubInstance[] = [
  // External structures (always visible)
  { regionId: 'cerebellum',  position: [0,    -0.38, -0.50], scale: [0.85, 0.65, 0.70],  geoType: 'cerebellum' },
  { regionId: 'brainstem',   position: [0,    -0.60, -0.22], scale: [0.14, 0.34, 0.14],  geoType: 'cylinder' },

  // Interior structures (visible when cortex goes transparent)
  { regionId: 'thalamus',        position: [0,     0.02, -0.04], scale: [0.16, 0.11, 0.18] },
  { regionId: 'hippocampus',     position: [-0.17,-0.10, -0.04], scale: [0.10, 0.06, 0.20] },
  { regionId: 'hippocampus',     position: [ 0.17,-0.10, -0.04], scale: [0.10, 0.06, 0.20] },
  { regionId: 'amygdala',        position: [-0.20,-0.12,  0.16], scale: [0.08, 0.08, 0.08] },
  { regionId: 'amygdala',        position: [ 0.20,-0.12,  0.16], scale: [0.08, 0.08, 0.08] },
  { regionId: 'hypothalamus',    position: [0,    -0.16,  0.08], scale: [0.08, 0.06, 0.08] },
  { regionId: 'basal-ganglia',   position: [-0.14, 0.04,  0.06], scale: [0.11, 0.12, 0.13] },
  { regionId: 'basal-ganglia',   position: [ 0.14, 0.04,  0.06], scale: [0.11, 0.12, 0.13] },
  { regionId: 'corpus-callosum', position: [0,     0.14,  0.00], scale: [0.30, 0.04, 0.24] },
  { regionId: 'insular-cortex',  position: [-0.36, 0.02,  0.05], scale: [0.08, 0.15, 0.16] },
  { regionId: 'insular-cortex',  position: [ 0.36, 0.02,  0.05], scale: [0.08, 0.15, 0.16] },
  { regionId: 'pituitary',       position: [0,    -0.28,  0.12], scale: [0.05, 0.05, 0.05] },
  { regionId: 'pineal-gland',    position: [0,     0.02, -0.12], scale: [0.035,0.035,0.035] },
  { regionId: 'ventricles',      position: [0,     0.06, -0.02], scale: [0.17, 0.11, 0.24] },
  { regionId: 'olfactory-bulb',  position: [-0.09,-0.18,  0.38], scale: [0.07, 0.05, 0.07] },
  { regionId: 'olfactory-bulb',  position: [ 0.09,-0.18,  0.38], scale: [0.07, 0.05, 0.07] },
]

interface SubMeshProps {
  inst: SubInstance
  isHovered: boolean
  isSelected: boolean
  isDimmed: boolean
}

function SubMesh({ inst, isHovered, isSelected, isDimmed }: SubMeshProps) {
  const setHovered = useBrainStore(s => s.setHovered)
  const setSelected = useBrainStore(s => s.setSelected)
  const region = regionsById[inst.regionId]

  const mat = useMemo(() => {
    return new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(region?.color ?? '#888888'),
      roughness: 0.40,
      metalness: 0.02,
      clearcoat: 0.15,
      clearcoatRoughness: 0.35,
      transparent: isDimmed,
      opacity: isDimmed ? 0.13 : 0.95,
      depthWrite: !isDimmed,
      emissive: isSelected
        ? new THREE.Color('#a78bfa')
        : isHovered
        ? new THREE.Color('#c4b5fd')
        : new THREE.Color('#000000'),
      emissiveIntensity: isSelected ? 0.45 : isHovered ? 0.22 : 0,
    })
  }, [region, isDimmed, isSelected, isHovered])

  let geo: THREE.BufferGeometry = SPHERE_GEO
  if (inst.geoType === 'cylinder') geo = CYLINDER_GEO
  else if (inst.geoType === 'cerebellum') {
    if (!CEREBELLUM_GEO) CEREBELLUM_GEO = buildCerebellumGeometry()
    geo = CEREBELLUM_GEO
  }

  return (
    <mesh
      position={inst.position}
      scale={inst.scale}
      geometry={geo}
      material={mat}
      renderOrder={isDimmed ? 0 : 2}
      onPointerOver={(e) => {
        e.stopPropagation()
        setHovered(inst.regionId)
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={(e) => {
        e.stopPropagation()
        setHovered(null)
        document.body.style.cursor = 'auto'
      }}
      onClick={(e) => {
        e.stopPropagation()
        setSelected(inst.regionId, false)
      }}
    />
  )
}

export function BrainModel() {
  const hoveredId = useBrainStore(s => s.hoveredRegionId)
  const selectedId = useBrainStore(s => s.selectedRegionId)

  return (
    <group>
      <BrainCortex />
      {SUB_INSTANCES.map((inst, idx) => {
        const isSelected = selectedId === inst.regionId
        const isDimmed = selectedId !== null && !isSelected
        return (
          <SubMesh
            key={idx}
            inst={inst}
            isHovered={hoveredId === inst.regionId}
            isSelected={isSelected}
            isDimmed={isDimmed}
          />
        )
      })}
    </group>
  )
}
