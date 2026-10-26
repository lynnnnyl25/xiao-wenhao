import { useMemo } from 'react'
import type { SessionState } from '../core/engine'
import { getPack } from '../core/engine'
import { buildTeacherReport, reportToMarkdown } from '../core/teacher-report'

const MOVE_CN: Record<string, string> = {
  clarify: '澄清',
  example: '举例',
  counterexample: '反例',
  why: '追问理由',
  consequence: '追问后果',
  transfer: '换情境',
  summarize: '归纳',
  simplify: '降阶重问',
}

/**
 * 教学复盘：把"引导过程"变成可复核的证据
 * 这是给教师和评委看的 —— 证明 AI 不是在闲聊，而是在按方法推进。
 */
export default function Review({ session, onClose }: { session: SessionState; onClose: () => void }) {
  const pack = getPack(session)
  const report = useMemo(() => buildTeacherReport(session, pack), [session, pack])

  const download = () => {
    const md = reportToMarkdown(report)
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `学习报告-${session.concept}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  // 只取苏格拉底阶段的 AI 轮，画出"提问动作序列"
  const moves = session.history.filter((h) => h.role === 'ai' && h.move)

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-2xl my-8 animate-pop overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-gradient-to-br from-kid-blue to-[#7FC4E8] p-5 text-white">
          <div className="text-xs opacity-90">🔍 教学复盘 · Teaching Review</div>
          <div className="text-2xl font-extrabold mt-1">{report.concept}</div>
          <div className="text-sm opacity-95 mt-1">{report.headline}</div>
        </div>

        <div className="p-5 space-y-5">
          {/* 提问动作序列 —— 最有说服力的一块 */}
          <div>
            <div className="text-sm font-bold mb-2">🧭 提问动作序列</div>
            <div className="text-[11px] text-kid-mute mb-2">
              每一格是 AI 说的一句话。苏格拉底法不是随便问，而是按学生的状态换刀法。
            </div>
            <div className="flex flex-wrap gap-1.5">
              {moves.map((m, i) => (
                <span
                  key={i}
                  className={`chip ${
                    m.move === 'counterexample'
                      ? 'bg-[#F1E9FB] text-kid-purple'
                      : m.move === 'simplify'
                        ? 'bg-[#FFF6DF] text-[#B8860B]'
                        : 'bg-kid-blueSoft text-kid-blue'
                  }`}
                  title={m.text}
                >
                  {MOVE_CN[m.move ?? ''] ?? m.move}
                </span>
              ))}
              {moves.length === 0 && (
                <span className="text-xs text-kid-mute">还没有记录。</span>
              )}
            </div>
          </div>

          {/* 哪种问法最有效 */}
          <div>
            <div className="text-sm font-bold mb-2">🎯 哪种问法最有效</div>
            {report.moveEffect.length === 0 ? (
              <div className="text-xs text-kid-mute">暂无数据。</div>
            ) : (
              <div className="space-y-1.5">
                {report.moveEffect.map((m) => (
                  <div key={m.move} className="flex items-center gap-2 text-xs">
                    <span className="w-20 text-kid-ink">{MOVE_CN[m.move] ?? m.move}</span>
                    <div className="flex-1 h-2 rounded-full bg-kid-bg overflow-hidden">
                      <div
                        className="h-full rounded-full bg-kid-blue"
                        style={{ width: `${Math.min(100, m.rate * 100)}%` }}
                      />
                    </div>
                    <span className="w-24 text-right text-kid-mute">
                      {m.used} 次 / 逼出 {m.exposed}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 缺口归并 */}
          <div>
            <div className="text-sm font-bold mb-2">📌 卡在哪里</div>
            {report.gapsByType.length === 0 ? (
              <div className="text-xs text-kid-mute">本次没有记录到缺口。</div>
            ) : (
              <ul className="space-y-2">
                {report.gapsByType.map((g) => (
                  <li key={g.type} className="rounded-2xl bg-kid-bg p-2.5">
                    <div className="flex items-center gap-2">
                      <span className="chip text-white" style={{ background: g.color }}>
                        {g.name}
                      </span>
                      <span className="text-[11px] text-kid-mute">
                        出现 {g.count} 次 · 已闭合 {g.closed}
                      </span>
                    </div>
                    {g.examples[0] && (
                      <div className="text-[12px] mt-1 text-kid-ink/80">
                        他说：<span className="italic">「{g.examples[0]}」</span>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* 建议 */}
          <div>
            <div className="text-sm font-bold mb-2">💡 下一步怎么教</div>
            <ul className="space-y-1.5">
              {report.suggestions.map((s, i) => (
                <li key={i} className="text-[13px] text-kid-ink/85 flex gap-1.5">
                  <span className="text-kid-primary">·</span>
                  {s}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex gap-2 pt-1">
            <button className="btn-primary flex-1" onClick={download}>
              ⬇ 导出学习报告（Markdown）
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
