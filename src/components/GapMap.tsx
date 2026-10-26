import { GAP_TYPE_MAP } from '../core/prompts'
import type { Profile } from '../core/engine'

/** 认知缺口雷达图：7 个维度，外环=诊断出的缺口，内环实心=已闭合 */
function Radar({ byType }: { byType: Profile['byType'] }) {
  const all = Object.keys(GAP_TYPE_MAP)
  const size = 200
  const cx = size / 2
  const cy = size / 2
  const R = 72

  const pt = (i: number, r: number) => {
    const a = (Math.PI * 2 * i) / all.length - Math.PI / 2
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]
  }

  const maxTotal = Math.max(1, ...byType.map((b) => b.total))

  // 外圈：诊断出的缺口数（越大越靠外 = 问题越多）
  const outer = all.map((t, i) => {
    const b = byType.find((x) => x.type === t)
    const r = b ? (b.total / maxTotal) * R * 0.95 : 6
    return pt(i, r).join(',')
  })

  // 内圈：已闭合数
  const inner = all.map((t, i) => {
    const b = byType.find((x) => x.type === t)
    const r = b && b.closed > 0 ? (b.closed / maxTotal) * R * 0.95 : 4
    return pt(i, r).join(',')
  })

  const grid = [0.25, 0.5, 0.75, 1].map((k) =>
    all.map((_, i) => pt(i, R * k).join(',')).join(' '),
  )

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[220px] mx-auto">
      {grid.map((g, i) => (
        <polygon key={i} points={g} fill="none" stroke="#EFE6DC" strokeWidth="1" />
      ))}
      {all.map((_, i) => {
        const [x, y] = pt(i, R)
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#EFE6DC" strokeWidth="1" />
      })}

      <polygon points={outer.join(' ')} fill="rgba(255,138,91,0.22)" stroke="#FF8A5B" strokeWidth="2" />
      <polygon points={inner.join(' ')} fill="rgba(87,204,153,0.45)" stroke="#57CC99" strokeWidth="2" />

      {all.map((t, i) => {
        const [x, y] = pt(i, R + 16)
        const g = GAP_TYPE_MAP[t]
        const b = byType.find((x2) => x2.type === t)
        return (
          <text
            key={t}
            x={x}
            y={y}
            fontSize="8"
            textAnchor="middle"
            dominantBaseline="middle"
            fill={b ? g.color : '#C9C0B8'}
            fontWeight={b ? 700 : 400}
          >
            {g.name}
          </text>
        )
      })}
    </svg>
  )
}

/** 成长曲线：每一轮的理解度 */
function Curve({ history }: { history: { round: number; understood?: number }[] }) {
  const pts = history.filter((h) => typeof h.understood === 'number')
  const w = 240
  const h = 70
  if (pts.length < 2) {
    return <div className="text-xs text-kid-mute py-6 text-center">多聊几轮，这里会长出你的成长曲线 🌱</div>
  }
  const step = w / Math.max(1, pts.length - 1)
  const path = pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${i * step} ${h - (p.understood ?? 0) * (h - 8) - 4}`)
    .join(' ')

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
      <line x1="0" y1={h - 4} x2={w} y2={h - 4} stroke="#EFE6DC" strokeWidth="1" />
      <path d={path} fill="none" stroke="#4EA8DE" strokeWidth="2.5" strokeLinecap="round" />
      {pts.map((p, i) => (
        <circle key={i} cx={i * step} cy={h - (p.understood ?? 0) * (h - 8) - 4} r="3" fill="#4EA8DE" />
      ))}
    </svg>
  )
}

export default function GapMap({
  profile,
  gaps,
  understoodTrail,
}: {
  profile: Profile
  gaps: {
    id: string
    type: string
    evidence: string
    round: number
    resolved: boolean
    resolvedRound?: number
    confidence: number
  }[]
  understoodTrail: { round: number; understood: number }[]
}) {
  return (
    <div className="space-y-4">
      {/* 三个硬指标 */}
      <div className="grid grid-cols-3 gap-2">
        <Metric label="答问比" value={String(profile.qaRatio)} hint="越大越好 · 目标≥3" tone="blue" />
        <Metric
          label="泄露率"
          value={`${profile.leakRate}%`}
          hint="越低越好 · 目标≤5%"
          tone={profile.leakRate <= 5 ? 'green' : 'warn'}
        />
        <Metric
          label="闭合率"
          value={`${profile.closureRate}%`}
          hint="越高越好 · 目标≥60%"
          tone={profile.closureRate >= 60 ? 'green' : 'yellow'}
        />
      </div>

      <div className="card p-4">
        <div className="text-sm font-bold mb-1">🧠 认知缺口图谱</div>
        <Radar byType={profile.byType} />
        <div className="flex items-center justify-center gap-4 text-[11px] text-kid-mute -mt-1">
          <span className="flex items-center gap-1">
            <i className="w-2.5 h-2.5 rounded-sm inline-block bg-kid-primary/40" />
            诊断出的缺口
          </span>
          <span className="flex items-center gap-1">
            <i className="w-2.5 h-2.5 rounded-sm inline-block bg-kid-green/70" />
            已闭合
          </span>
        </div>
      </div>

      <div className="card p-4">
        <div className="text-sm font-bold mb-2">📈 理解度成长曲线</div>
        <Curve history={understoodTrail} />
      </div>

      {/* 证据链 */}
      <div className="card p-4">
        <div className="text-sm font-bold mb-2 flex items-center justify-between">
          <span>🔍 缺口证据链</span>
          <span className="text-xs font-normal text-kid-mute">
            {profile.closedGaps}/{profile.totalGaps} 已闭合
          </span>
        </div>
        {gaps.length === 0 ? (
          <div className="text-xs text-kid-mute py-4 text-center">
            还没有发现缺口。继续聊，小问号会把他没说清的地方记下来。
          </div>
        ) : (
          <ul className="space-y-2">
            {gaps.map((g) => {
              const meta = GAP_TYPE_MAP[g.type]
              return (
                <li
                  key={g.id}
                  className={`rounded-2xl border p-2.5 ${
                    g.resolved ? 'bg-kid-greenSoft/60 border-kid-green/30' : 'bg-kid-primarySoft/50 border-kid-primary/25'
                  }`}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className="chip text-white"
                      style={{ background: meta?.color ?? '#8A817C' }}
                    >
                      {meta?.name ?? g.type}
                    </span>
                    <span className="text-[11px] text-kid-mute">第 {g.round} 轮发现</span>
                    {g.resolved && (
                      <span className="chip bg-kid-green text-white">第 {g.resolvedRound} 轮闭合 ✓</span>
                    )}
                  </div>
                  <div className="mt-1.5 text-[13px] text-kid-ink/90">
                    <span className="text-kid-mute">他说：</span>
                    <span className="italic">「{g.evidence}」</span>
                  </div>
                  <div className="mt-1 text-[11px] text-kid-mute">{meta?.tip}</div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

function Metric({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: string
  hint: string
  tone: 'blue' | 'green' | 'yellow' | 'warn'
}) {
  const map = {
    blue: 'bg-kid-blueSoft text-kid-blue',
    green: 'bg-kid-greenSoft text-[#2F9E75]',
    yellow: 'bg-[#FFF6DF] text-[#B8860B]',
    warn: 'bg-[#FFEAEF] text-[#C2185B]',
  }
  return (
    <div className={`rounded-2xl px-2.5 py-2 text-center ${map[tone]}`}>
      <div className="text-[10px] opacity-80">{label}</div>
      <div className="text-lg font-extrabold leading-tight">{value}</div>
      <div className="text-[9px] opacity-70 leading-tight mt-0.5">{hint}</div>
    </div>
  )
}
