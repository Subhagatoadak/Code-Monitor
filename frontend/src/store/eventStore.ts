import { create } from 'zustand'
import type { Event, EventFilters } from '@/types/events'

interface EventStore {
  events: Event[]
  filters: EventFilters
  selectedEvent: Event | null

  addEvent: (event: Event) => void
  setEvents: (events: Event[]) => void
  setFilters: (filters: Partial<EventFilters>) => void
  setSelectedEvent: (event: Event | null) => void

  // Computed values
  filteredEvents: () => Event[]
}

export const useEventStore = create<EventStore>((set, get) => ({
  events: [],
  filters: {
    kinds: [],
    searchQuery: '',
    startDate: null,
    endDate: null,
    pathFilter: '',
  },
  selectedEvent: null,

  addEvent: (event) =>
    set((state) => ({
      events: [event, ...state.events],
    })),

  setEvents: (events) => set({ events }),

  setFilters: (filters) =>
    set((state) => ({
      filters: { ...state.filters, ...filters },
    })),

  setSelectedEvent: (event) => set({ selectedEvent: event }),

  filteredEvents: () => {
    const { events, filters } = get()

    return events.filter((event) => {
      // Kind filter
      if (filters.kinds.length > 0 && !filters.kinds.includes(event.kind)) {
        return false
      }

      // Search query
      if (filters.searchQuery) {
        const query = filters.searchQuery.toLowerCase()
        const searchableText = JSON.stringify(event).toLowerCase()
        if (!searchableText.includes(query)) {
          return false
        }
      }

      // Path filter
      if (filters.pathFilter && !event.path.includes(filters.pathFilter)) {
        return false
      }

      // Date filters
      const eventDate = new Date(event.ts)
      if (filters.startDate && eventDate < filters.startDate) {
        return false
      }
      if (filters.endDate && eventDate > filters.endDate) {
        return false
      }

      return true
    })
  },
}))
