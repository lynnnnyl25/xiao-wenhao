/**
 * DeepSeek 客户端（浏览器直连，支持流式）
 * ---------------------------------------------------------------
 * 直连意味着 API Key 只存在用户自己的浏览器 localStorage 里，
 * 不经任何中间服务器 —— 对教育场景的隐私合规更友好。
 */

const DEFAULT_BASE = 'https://api.deepseek.com/v1'

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

export type CallOptions = {
  apiKey: string
  model?: string
  baseUrl?: string
  messages: ChatMessage[]
  temperature?: number
  maxTokens?: number
  signal?: AbortSignal
  /** 要求模型返回 JSON */
  json?: boolean
}

export class DeepSeekError extends Error {
  constructor(
    message: string,
    readonly kind: 'no_key' | 'network' | 'api' | 'abort' | 'parse',
  ) {
    super(message)
    this.name = 'DeepSeekError'
  }
}

function endpoint(baseUrl?: string) {
  const b = (baseUrl || DEFAULT_BASE).replace(/\/+$/, '')
  return `${b}/chat/completions`
}

/** 非流式调用，用于诊断器与费曼评审（要拿完整 JSON） */
export async function callJson(opts: CallOptions): Promise<string> {
  if (!opts.apiKey) throw new DeepSeekError('还没有填写 DeepSeek API Key', 'no_key')

  const res = await fetch(endpoint(opts.baseUrl), {
    method: 'POST',
    signal: opts.signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify({
      model: opts.model ?? 'deepseek-chat',
      messages: opts.messages,
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.maxTokens ?? 700,
      stream: false,
      ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
    }),
  }).catch((e: unknown) => {
    if (e instanceof Error && e.name === 'AbortError') throw new DeepSeekError('已取消', 'abort')
    throw new DeepSeekError('连不上 DeepSeek，检查网络或 Key', 'network')
  })

  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new DeepSeekError(`DeepSeek 返回 ${res.status}：${txt.slice(0, 180)}`, 'api')
  }

  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[]
  }
  return json.choices?.[0]?.message?.content ?? ''
}

/**
 * 流式调用，用于苏格拉底提问（逐字显示，体验更好）
 * 返回完整原始文本。
 */
export async function callStream(
  opts: CallOptions,
  onDelta: (chunk: string) => void,
): Promise<string> {
  if (!opts.apiKey) throw new DeepSeekError('还没有填写 DeepSeek API Key', 'no_key')

  const res = await fetch(endpoint(opts.baseUrl), {
    method: 'POST',
    signal: opts.signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify({
      model: opts.model ?? 'deepseek-chat',
      messages: opts.messages,
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.maxTokens ?? 600,
      stream: true,
    }),
  }).catch((e: unknown) => {
    if (e instanceof Error && e.name === 'AbortError') throw new DeepSeekError('已取消', 'abort')
    throw new DeepSeekError('连不上 DeepSeek，检查网络或 Key', 'network')
  })

  if (!res.ok || !res.body) {
    const txt = await res.text().catch(() => '')
    throw new DeepSeekError(`DeepSeek 返回 ${res.status}：${txt.slice(0, 180)}`, 'api')
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  let full = ''

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })

    const lines = buf.split('\n')
    buf = lines.pop() ?? ''

    for (const line of lines) {
      const t = line.trim()
      if (!t.startsWith('data:')) continue
      const payload = t.slice(5).trim()
      if (payload === '[DONE]') continue
      try {
        const j = JSON.parse(payload) as {
          choices?: { delta?: { content?: string } }[]
        }
        const piece = j.choices?.[0]?.delta?.content
        if (piece) {
          full += piece
          onDelta(piece)
        }
      } catch {
        /* 忽略半包 */
      }
    }
  }
  return full
}

/**
 * 流式时模型会先输出 ```json 再输出内容，UI 上不宜直接显示。
 * 这里做一个"只显示 say 字段内容"的流式提取器：边收边尝试解析，
 * 一旦解析出 say 就把增量推给 UI。
 */
export function makeSayStreamer(onSay: (text: string) => void) {
  let raw = ''
  let emitted = ''
  return {
    push(chunk: string) {
      raw += chunk
      // 尚未进入 JSON 内容区就先不显示（跳过 ```json 与 { "say": "）
      const say = extractPartialSay(raw)
      if (say.length > emitted.length) {
        const delta = say.slice(emitted.length)
        emitted = say
        onSay(delta)
      }
    },
    get raw() {
      return raw
    },
  }
}

/** 从不完整 JSON 里尽力抠出 say 的值（支持流式半包） */
export function extractPartialSay(raw: string): string {
  const i = raw.indexOf('"say"')
  if (i < 0) return ''
  const colon = raw.indexOf(':', i + 5)
  if (colon < 0) return ''
  const q1 = raw.indexOf('"', colon + 1)
  if (q1 < 0) return ''
  // 找结束引号（跳过转义）
  let out = ''
  let closed = false
  for (let p = q1 + 1; p < raw.length; p++) {
    const c = raw[p]
    if (c === '\\') {
      const nx = raw[p + 1]
      if (nx === 'n') out += '\n'
      else if (nx === 't') out += '\t'
      else if (nx) out += nx
      p++
      continue
    }
    if (c === '"') {
      closed = true
      break
    }
    out += c
  }
  return closed || out.length > 0 ? out : ''
}

// ---------------------------------------------------------------- 解析器

export function stripFence(s: string): string {
  return s
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
}

function looseParse<T>(raw: string): T | null {
  const text = stripFence(raw)
  try {
    return JSON.parse(text) as T
  } catch {
    // 模型可能把 JSON 埋在别的话里：抠出最外层 {...}
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1)) as T
      } catch {
        return null
      }
    }
    return null
  }
}

export type SocraticOut = {
  say: string
  level: number
  target_gap: string
  intent: string
  give_up_hint: string
}

export function parseSocratic(raw: string): SocraticOut {
  const j = looseParse<Record<string, unknown>>(raw)
  const text = stripFence(raw)
  if (!j) {
    return { say: text || '（小问号还在想……）', level: 1, target_gap: '', intent: '', give_up_hint: '' }
  }
  return {
    say: typeof j.say === 'string' && j.say.trim() ? j.say.trim() : text || '（小问号还在想……）',
    level: Number(j.level) || 1,
    target_gap: String(j.target_gap ?? ''),
    intent: String(j.intent ?? ''),
    give_up_hint: String(j.give_up_hint ?? ''),
  }
}

export type DiagnosisOut = {
  gaps: { type: string; evidence: string; confidence: number; need_ask: boolean }[]
  understood_level: number
  note: string
}

export function parseDiagnosis(raw: string): DiagnosisOut {
  const j = looseParse<Record<string, unknown>>(raw)
  if (!j) return { gaps: [], understood_level: 0.5, note: '' }
  const gapsRaw = Array.isArray(j.gaps) ? j.gaps : []
  return {
    gaps: gapsRaw.slice(0, 2).map((g) => {
      const o = (g ?? {}) as Record<string, unknown>
      return {
        type: String(o.type ?? 'def'),
        evidence: String(o.evidence ?? '').slice(0, 60),
        confidence: clamp01(Number(o.confidence) || 0.6),
        need_ask: o.need_ask !== false,
      }
    }),
    understood_level: clamp01(Number(j.understood_level) || 0.5),
    note: String(j.note ?? ''),
  }
}

export type FeynmanOut = {
  say: string
  passed: boolean
  stuck_at: string
  missing: string[]
  praise: string
}

export function parseFeynman(raw: string): FeynmanOut {
  const j = looseParse<Record<string, unknown>>(raw)
  const text = stripFence(raw)
  if (!j) return { say: text, passed: false, stuck_at: '', missing: [], praise: '' }
  return {
    say: String(j.say ?? '').trim() || text,
    passed: j.passed === true,
    stuck_at: String(j.stuck_at ?? ''),
    missing: Array.isArray(j.missing) ? j.missing.map(String) : [],
    praise: String(j.praise ?? ''),
  }
}

export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0.5
  return Math.max(0, Math.min(1, n))
}
