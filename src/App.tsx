import { useEffect, useState } from 'react'
import { BrainScene } from './components/BrainScene'
import { CurriculumPanel } from './components/CurriculumPanel'
import { InfoPanel } from './components/InfoPanel'
import { useBrainStore } from './store/useBrainStore'
import { regionsById } from './data/regions'

function HoverTooltip() {
  const hoveredId = useBrainStore((s) => s.hoveredRegionId)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const region = hoveredId ? regionsById[hoveredId] : null

  useEffect(() => {
    const handler = (e: MouseEvent) => setPos({ x: e.clientX, y: e.clientY })
    window.addEventListener('mousemove', handler)
    return () => window.removeEventListener('mousemove', handler)
  }, [])

  if (!region) return null
  return (
    <div
      className="fixed z-30 pointer-events-none px-2.5 py-1 rounded-md bg-zinc-800/95 border border-zinc-700 text-xs text-zinc-200 font-medium backdrop-blur-sm whitespace-nowrap"
      style={{ left: pos.x + 14, top: pos.y - 28 }}
    >
      <span
        className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle"
        style={{ background: region.color }}
      />
      {region.displayName}
    </div>
  )
}

export default function App() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-zinc-950">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 50% 40%, rgba(109,40,217,0.06) 0%, transparent 70%)',
        }}
      />

      <div className="absolute inset-0">
        <BrainScene />
      </div>

      <CurriculumPanel />
      <InfoPanel />
      <HoverTooltip />
    </div>
  )
}
