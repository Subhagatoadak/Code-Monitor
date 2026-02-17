import type { Event, MatchResponse, AIConversation, AIConversationTimeline, AIStats } from '@/types/events'

const API_BASE = import.meta.env.PROD ? '' : 'http://localhost:4381'

export async function fetchEvents(params: {
  limit?: number
  offset?: number
  kind?: string
}): Promise<{ items: Event[]; count: number }> {
  const url = new URL(`${API_BASE}/events`)
  if (params.limit) url.searchParams.set('limit', String(params.limit))
  if (params.offset) url.searchParams.set('offset', String(params.offset))
  if (params.kind) url.searchParams.set('kind', params.kind)

  const response = await fetch(url)
  if (!response.ok) throw new Error('Failed to fetch events')
  return response.json()
}

export async function logPrompt(data: {
  text: string
  source?: string
  model?: string
}): Promise<{ status: string }> {
  const response = await fetch(`${API_BASE}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!response.ok) throw new Error('Failed to log prompt')
  return response.json()
}

export async function logCopilotChat(data: {
  prompt: string
  response: string
  source?: string
  model?: string
  conversation_id?: string
}): Promise<{ status: string }> {
  const response = await fetch(`${API_BASE}/copilot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!response.ok) throw new Error('Failed to log copilot chat')
  return response.json()
}

export async function matchEvents(params: {
  start_ts?: number
  end_ts?: number
  event_ids?: number[]
  include_kinds?: string[]
}): Promise<MatchResponse> {
  const response = await fetch(`${API_BASE}/match`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  if (!response.ok) throw new Error('Failed to match events')
  return response.json()
}

export async function generateSummary(): Promise<{ summary: string }> {
  const response = await fetch(`${API_BASE}/summary/run`, {
    method: 'POST',
  })
  if (!response.ok) throw new Error('Failed to generate summary')
  return response.json()
}

export async function healthCheck(): Promise<{ status: string; events: number }> {
  const response = await fetch(`${API_BASE}/health`)
  if (!response.ok) throw new Error('Health check failed')
  return response.json()
}

// AI Chat API functions
export async function fetchAIConversations(params: {
  project_id?: number
  ai_provider?: string
  limit?: number
  offset?: number
}): Promise<{ conversations: AIConversation[]; total: number }> {
  const url = new URL(`${API_BASE}/ai-chat`)
  if (params.project_id) url.searchParams.set('project_id', String(params.project_id))
  if (params.ai_provider) url.searchParams.set('ai_provider', params.ai_provider)
  if (params.limit) url.searchParams.set('limit', String(params.limit))
  if (params.offset) url.searchParams.set('offset', String(params.offset))

  const response = await fetch(url)
  if (!response.ok) throw new Error('Failed to fetch AI conversations')
  return response.json()
}

export async function fetchAIConversation(id: number): Promise<AIConversation> {
  const response = await fetch(`${API_BASE}/ai-chat/${id}`)
  if (!response.ok) throw new Error('Failed to fetch AI conversation')
  return response.json()
}

export async function fetchAIConversationTimeline(id: number): Promise<AIConversationTimeline> {
  const response = await fetch(`${API_BASE}/ai-chat/${id}/timeline`)
  if (!response.ok) throw new Error('Failed to fetch conversation timeline')
  return response.json()
}

export async function matchAIConversation(id: number): Promise<{ status: string; matched_events: number }> {
  const response = await fetch(`${API_BASE}/ai-chat/${id}/match`, {
    method: 'POST',
  })
  if (!response.ok) throw new Error('Failed to match conversation')
  return response.json()
}

export async function fetchAIStats(projectId?: number): Promise<AIStats> {
  const url = new URL(`${API_BASE}/ai-chat/stats`)
  if (projectId) url.searchParams.set('project_id', String(projectId))

  const response = await fetch(url)
  if (!response.ok) throw new Error('Failed to fetch AI stats')
  return response.json()
}

export async function logAIConversation(data: {
  project_id?: number
  session_id?: string
  ai_provider: string
  ai_model?: string
  conversation_type?: string
  user_prompt: string
  ai_response: string
  context_files?: string[]
  code_snippets?: Array<{ language: string; code: string; lines: number }>
  metadata?: Record<string, any>
}): Promise<{ id: number; status: string; session_id: string }> {
  const response = await fetch(`${API_BASE}/ai-chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!response.ok) throw new Error('Failed to log AI conversation')
  return response.json()
}
