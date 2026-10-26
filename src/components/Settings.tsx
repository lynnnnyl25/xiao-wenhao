import { useState } from 'react'

export default function Settings({
  apiKey,
  model,
  onSave,
  onClose,
}: {
  apiKey: string
  model: string
  onSave: (key: string, model: string) => void
  onClose: () => void
}) {
  const [k, setK] = useState(apiKey)
  const [m, setM] = useState(model)

  return (
    <div
      className="fixed inset-0 z-50 bg-black/35 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="card w-full max-w-md p-5 animate-pop" onClick={(e) => e.stopPropagation()}>
        <div className="font-extrabold text-lg mb-1">⚙ 设置</div>
        <div className="text-xs text-kid-mute mb-4 leading-relaxed">
          API Key 只保存在<b className="text-kid-ink">你自己的浏览器</b>里，不上传任何服务器。
          不填也能用「体验模式」看完整效果。
        </div>

        <label className="block text-xs font-bold mb-1">DeepSeek API Key</label>
        <input
          className="w-full rounded-2xl border border-kid-line px-3 py-2.5 text-sm mb-3 outline-none
            focus:border-kid-primary font-mono"
          placeholder="sk-..."
          value={k}
          onChange={(e) => setK(e.target.value)}
          type="password"
        />

        <label className="block text-xs font-bold mb-1">模型</label>
        <select
          className="w-full rounded-2xl border border-kid-line px-3 py-2.5 text-sm mb-4 outline-none
            focus:border-kid-primary bg-white"
          value={m}
          onChange={(e) => setM(e.target.value)}
        >
          <option value="deepseek-chat">deepseek-chat（对话，推荐）</option>
          <option value="deepseek-reasoner">deepseek-reasoner（推理，更慢更严谨）</option>
        </select>

        <div className="text-[11px] text-kid-mute bg-kid-bg rounded-2xl p-3 mb-4 leading-relaxed">
          <b>没有 Key？</b> 到 platform.deepseek.com 注册就能领。
          <br />
          <b>只想看效果？</b> 关掉这里，切到「体验模式」，里面有 3 段完整回放。
        </div>

        <div className="flex gap-2">
          <button className="btn-primary flex-1" onClick={() => onSave(k.trim(), m)}>
            保存
          </button>
          <button className="btn-ghost" onClick={onClose}>
            取消
          </button>
        </div>
      </div>
    </div>
  )
}
