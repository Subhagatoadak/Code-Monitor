export type EventKind =
  | 'file_change'
  | 'file_deleted'
  | 'folder_created'
  | 'folder_deleted'
  | 'prompt'
  | 'copilot_chat'
  | 'error'
  | 'summary'
  | 'ai_match'
  | 'implications_analysis'

export interface EventPayload {
  // file_change
  event?: string
  diff?: string
  sha?: string
  size?: number
  baseline?: string

  // prompt
  text?: string
  source?: string
  model?: string

  // copilot_chat
  prompt?: string
  response?: string
  conversation_id?: string

  // error
  message?: string
  context?: Record<string, any>

  // summary
  content?: string

  // ai_match
  prompt_count?: number
  code_change_count?: number
  match_count?: number

  [key: string]: any
}

export interface Event {
  id?: number
  ts: string
  kind: EventKind
  path: string
  payload: EventPayload
}

export interface Match {
  prompt_id: number
  code_change_ids: number[]
  confidence: number
  reasoning: string
}

export interface MatchResponse {
  matches: Match[]
  metadata: {
    model: string
    prompt_count: number
    code_change_count: number
  }
}

export interface EventFilters {
  kinds: EventKind[]
  searchQuery: string
  startDate: Date | null
  endDate: Date | null
  pathFilter: string
}

// AI Chat types
export interface CodeSnippet {
  language: string
  code: string
  lines: number
}

export interface AIConversation {
  id: number
  project_id?: number
  session_id: string
  ai_provider: string
  ai_model?: string
  timestamp: string
  conversation_type?: string
  user_prompt: string
  ai_response: string
  context_files: string[]
  code_snippets: CodeSnippet[]
  metadata?: Record<string, any>
  matched_to_events?: number[]
  confidence_score?: number
}

export interface AICodeMatch {
  id: number
  conversation_id: number
  event_id: number
  match_type: string
  confidence: number
  reasoning: string
  file_overlap: number
  time_delta: number
  created_at: string
}

export interface AIConversationTimeline {
  conversation: AIConversation
  matched_changes: Array<{
    event_id: number
    path: string
    confidence: number
    reasoning: string
    match_type: string
    time_delta: number
    diff?: string
  }>
}

export interface AIStats {
  total_conversations: number
  matched_conversations: number
  unmatched_conversations: number
  by_provider: Array<{
    provider: string
    count: number
  }>
}
