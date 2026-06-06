import { useMemo, useEffect, Suspense } from 'react'
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

// ── Real mesh definitions ─────────────────────────────────────────────────────

interface RealMeshDef {
  regionId: string
  objPath: string
}

const REAL_MESH_DEFS: RealMeshDef[] = [
  // Exterior structures (visible even with opaque cortex)
  { regionId: 'cerebellum',     objPath: '/models/cerebellum.obj'       },
  { regionId: 'brainstem',      objPath: '/models/brainstem.obj'        },
  { regionId: 'olfactory-bulb', objPath: '/models/olfactory-bulb-l.obj' },
  { regionId: 'olfactory-bulb', objPath: '/models/olfactory-bulb-r.obj' },

  // Interior structures (visible when cortex goes transparent on selection)
  { regionId: 'thalamus',       objPath: '/models/thalamus-l.obj'       },
  { regionId: 'thalamus',       objPath: '/models/thalamus-r.obj'       },
  { regionId: 'hippocampus',    objPath: '/models/hippocampus-l.obj'    },
  { regionId: 'hippocampus',    objPath: '/models/hippocampus-r.obj'    },
  { regionId: 'amygdala',       objPath: '/models/amygdala-l.obj'       },
  { regionId: 'amygdala',       objPath: '/models/amygdala-r.obj'       },
  { regionId: 'basal-ganglia',  objPath: '/models/basal-ganglia-l.obj'  },
  { regionId: 'basal-ganglia',  objPath: '/models/basal-ganglia-r.obj'  },
  { regionId: 'insular-cortex', objPath: '/models/insular-cortex-l.obj' },
  { regionId: 'insular-cortex', objPath: '/models/insular-cortex-r.obj' },
  { regionId: 'corpus-callosum', objPath: '/models/corpus-callosum.obj' },
  { regionId: 'hypothalamus',   objPath: '/models/hypothalamus.obj'     },
  { regionId: 'ventricles',     objPath: '/models/ventricles.obj'       },
  { regionId: 'pituitary',      objPath: '/models/pituitary.obj'        },
  { regionId: 'pineal-gland',   objPath: '/models/pineal-gland.obj'     },
]

// ── SubOBJMesh component ──────────────────────────────────────────────────────

interface SubOBJMeshProps {
  def: RealMeshDef
  isHovered: boolean
  isSelected: boolean
  isDimmed: boolean
}

function SubOBJMesh({ def, isHovered, isSelected, isDimmed }: SubOBJMeshProps) {
  const setHovered = useBrainStore(s => s.setHovered)
  const setSelected = useBrainStore(s => s.setSelected)
  const region = regionsById[def.regionId]

  const obj = useLoader(OBJLoader, def.objPath)

  const geo = useMemo(() => {
    const geos: THREE.BufferGeometry[] = []
    obj.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        geos.push((child as THREE.Mesh).geometry.clone())
      }
    })
    if (geos.length === 0) throw new Error(`No mesh in ${def.objPath}`)
    const merged = geos.length > 1 ? mergeGeometries(geos) : geos[0]
    if (geos.length > 1) geos.forEach(g => g.dispose())
    merged.computeVertexNormals()
    return merged
  }, [obj, def.objPath])

  useEffect(() => () => { geo.dispose() }, [geo])

  const mat = useMemo(() => new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(region?.color ?? '#888888'),
    roughness: 0.40,
    metalness: 0.02,
    clearcoat: 0.15,
    clearcoatRoughness: 0.35,
    transparent: isDimmed,
    opacity: isDimmed ? 0.13 : 0.95,
    depthWrite: !isDimmed,
    side: THREE.DoubleSide,
    emissive: isSelected
      ? new THREE.Color('#a78bfa')
      : isHovered
      ? new THREE.Color('#c4b5fd')
      : new THREE.Color('#000000'),
    emissiveIntensity: isSelected ? 0.45 : isHovered ? 0.22 : 0,
  }), [region, isDimmed, isSelected, isHovered])

  return (
    <mesh
      geometry={geo}
      material={mat}
      renderOrder={isDimmed ? 0 : 2}
      onPointerOver={(e) => {
        e.stopPropagation()
        setHovered(def.regionId)
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={(e) => {
        e.stopPropagation()
        setHovered(null)
        document.body.style.cursor = 'auto'
      }}
      onClick={(e) => {
        e.stopPropagation()
        setSelected(def.regionId, false)
      }}
    />
  )
}

// ── BrainModel ────────────────────────────────────────────────────────────────

export function BrainModel() {
  const hoveredId = useBrainStore(s => s.hoveredRegionId)
  const selectedId = useBrainStore(s => s.selectedRegionId)

  return (
    <group>
      <BrainCortex />
      {REAL_MESH_DEFS.map((def, idx) => {
        const isSelected = selectedId === def.regionId
        const isDimmed = selectedId !== null && !isSelected
        return (
          <Suspense key={idx} fallback={null}>
            <SubOBJMesh
              def={def}
              isHovered={hoveredId === def.regionId}
              isSelected={isSelected}
              isDimmed={isDimmed}
            />
          </Suspense>
        )
      })}
    </group>
  )
}

// Preload all sub-structure OBJs at module load time
REAL_MESH_DEFS.forEach(def => useLoader.preload(OBJLoader, def.objPath))
