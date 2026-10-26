import { GAP_TYPE_MAP } from '../core/prompts'
import type { Profile } from '../core/engine'
import type { GapRecord } from '../core/engine'

export default function Passport({
  concept,
  profile,
  gaps,
  onClose,
}: {
  concept: string
  profile: Profile
  gaps: GapRecord[]
  onClose: () => void
}) {
  const closed = gaps.filter((g) => g.resolved)
  const open = gaps.filter((g) => !g.resolved)

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-lg my-auto animate-pop overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 护照头 */}
        <div className="bg-gradient-to-br from-kid-primary to-[#FFB088] p-5 text-white">
          <div className="flex items-center gap-2 text-xs opacity-90">
            <span>🎓</span> 学习护照 · Learning Passport
          </div>
          <div className="text-2xl font-extrabold mt-1">{concept}</div>
          <div className="text-xs opacity-90 mt-1">
            由「小问号」苏格拉底 × 费曼 主动学习智能体签发
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* 数字 */}
          <div className="grid grid-cols-4 gap-2">
            <Stat label="对话轮次" value={String(profile.rounds)} />
            <Stat label="发现缺口" value={String(profile.totalGaps)} />
            <Stat label="闭合缺口" value={String(profile.closedGaps)} tone="green" />
            <Stat label="理解度" value={`${profile.understoodLevel}%`} tone="blue" />
          </div>

          {/* 我讲清楚的部分 */}
          {closed.length > 0 && (
            <div>
              <div className="text-sm font-bold mb-2">✅ 今天我讲清楚了</div>
              <ul className="space-y-1.5">
                {closed.map((g) => {
                  const meta = GAP_TYPE_MAP[g.type]
                  return (
                    <li key={g.id} className="flex items-start gap-2 text-[13px]">
                      <span
                        className="chip text-white shrink-0 mt-0.5"
                        style={{ background: meta?.color ?? '#8A817C' }}
                      >
                        {meta?.name ?? g.type}
                      </span>
                      <span className="text-kid-ink/80">
                        第 {g.round} 轮卡住「{g.evidence}」，第 {g.resolvedRound} 轮想通了
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {/* 还没通的 */}
          {open.length > 0 && (
            <div>
              <div className="text-sm font-bold mb-2">🌱 下次还可以再想想</div>
              <ul className="space-y-1.5">
                {open.map((g) => {
                  const meta = GAP_TYPE_MAP[g.type]
                  return (
                    <li key={g.id} className="flex items-start gap-2 text-[13px]">
                      <span
                        className="chip text-white shrink-0 mt-0.5"
                        style={{ background: meta?.color ?? '#8A817C', opacity: 0.6 }}
                      >
                        {meta?.name ?? g.type}
                      </span>
                      <span className="text-kid-mute">
                        「{g.evidence}」这里还没说清楚 · {meta?.tip}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {/* 承诺 */}
          <div className="rounded-2xl bg-kid-bg p-3.5 text-xs leading-relaxed text-kid-ink/80">
            <div className="font-bold mb-1">🛡 这一场，AI 做到了</div>
            答问比 <b>{profile.qaRatio}</b>（越大越好）、泄露答案 <b>{profile.leakRate}%</b>（越低越好）、
            缺口闭合 <b>{profile.closureRate}%</b>。
            <br />
            <span className="text-kid-mute">{profile.verdict}</span>
          </div>

          <div className="flex gap-2">
            <button className="btn-primary flex-1" onClick={() => window.print()}>
              🖨 保存 / 打印
            </button>
            <button className="btn-ghost" onClick={onClose}>
              关闭
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'green' | 'blue' }) {
  const cls =
    tone === 'green'
      ? 'bg-kid-greenSoft text-[#2F9E75]'
      : tone === 'blue'
        ? 'bg-kid-blueSoft text-kid-blue'
        : 'bg-kid-bg text-kid-ink'
  return (
    <div className={`rounded-2xl py-2.5 text-center ${cls}`}>
      <div className="text-lg font-extrabold leading-none">{value}</div>
      <div className="text-[10px] opacity-75 mt-1">{label}</div>
    </div>
  )
}
