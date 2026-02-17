import type { Event } from '@/types/events'

export function createEventStream(
  onEvent: (event: Event) => void,
  onError?: (error: Error) => void
) {
  const API_BASE = import.meta.env.PROD ? '' : 'http://localhost:4381'
  const eventSource = new EventSource(`${API_BASE}/events/stream`)

  eventSource.onmessage = (e) => {
    try {
      const event: Event = JSON.parse(e.data)
      onEvent(event)
    } catch (error) {
      console.error('Failed to parse SSE event:', error)
      onError?.(error as Error)
    }
  }

  eventSource.onerror = (error) => {
    console.error('SSE connection error:', error)
    onError?.(new Error('SSE connection failed'))
  }

  return () => {
    eventSource.close()
  }
}
