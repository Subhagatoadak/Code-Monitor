import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Toaster, toast } from 'sonner'
import {
  FolderOpen,
  FolderPlus,
  FolderMinus,
  Plus,
  Search,
  ChevronDown,
  ChevronRight,
  FileText,
  Trash2,
  MessageSquare,
  AlertCircle,
  Sparkles,
  Brain,
  Calendar,
  Clock,
  Activity,
  Settings,
  X,
  Download,
  FileCode,
  Server,
  Layout,
  TestTube,
  Package,
  FileCog,
  Bot,
  Link2,
  TrendingUp,
  Code,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { createEventStream } from './lib/eventStream'
import { formatRelativeTime, cn } from './lib/utils'
import type { Event, AIConversation } from './types/events'
import { fetchAIConversations, fetchAIConversationTimeline, matchAIConversation, fetchAIStats } from './lib/api'

// API functions
const API_BASE = import.meta.env.PROD ? '' : 'http://localhost:4381'

interface Project {
  id: number
  name: string
  path: string
  description: string
  created_at: string
  active: boolean
  event_count: number
  monitoring: boolean
  ignore_patterns?: string[]
  has_technical_doc?: boolean
  feature_doc_path?: string
  technical_doc_changes?: number
  technical_doc_last_updated?: string
}

async function fetchProjects(): Promise<{ projects: Project[] }> {
  const res = await fetch(`${API_BASE}/projects`)
  const data = await res.json()
  // Backend returns a plain array; wrap it
  return { projects: Array.isArray(data) ? data : data.projects ?? [] }
}

async function createProject(data: { name: string; path: string; description: string; ignore_patterns: string[]; feature_doc_path?: string }) {
  const res = await fetch(`${API_BASE}/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: data.name,
      path: data.path,
      description: data.description,
      ignore_patterns: data.ignore_patterns.length > 0 ? JSON.stringify(data.ignore_patterns) : null,
    }),
  })
  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.detail || 'Failed to create project')
  }
  return res.json()
}

async function deleteProject(id: number) {
  const res = await fetch(`${API_BASE}/projects/${id}`, { method: 'DELETE' })
  return res.json()
}

async function fetchEvents(projectId?: number, limit = 100, offset = 0) {
  const url = new URL(`${API_BASE}/events`)
  url.searchParams.set('limit', String(limit))
  url.searchParams.set('offset', String(offset))
  if (projectId) url.searchParams.set('project_id', String(projectId))
  const res = await fetch(url)
  return res.json()
}

async function fetchProjectConfig(projectId: number) {
  const res = await fetch(`${API_BASE}/projects/${projectId}/config`)
  return res.json()
}

async function updateProjectConfig(projectId: number, config: { ignore_patterns?: string[], feature_doc_path?: string }) {
  const res = await fetch(`${API_BASE}/projects/${projectId}/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  })
  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.detail || 'Failed to update config')
  }
  return res.json()
}

async function analyzeImplications(projectId?: number, hours = 24) {
  const url = new URL(`${API_BASE}/implications`)
  if (projectId) url.searchParams.set('project_id', String(projectId))
  url.searchParams.set('hours', String(hours))
  const res = await fetch(url, { method: 'POST' })
  return res.json()
}

async function analyzeChange(eventId: number) {
  const res = await fetch(`${API_BASE}/analyze-change`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event_id: eventId }),
  })
  return res.json()
}


// Sophisticated color palette - professional grays and blues
const EVENT_CONFIG: Record<string, { icon: any; color: string; label: string; category?: string }> = {
  file_change: { icon: FileText, color: 'text-slate-400', label: 'Modified' },
  file_deleted: { icon: Trash2, color: 'text-slate-500', label: 'Deleted' },
  folder_created: { icon: FolderPlus, color: 'text-slate-400', label: 'Folder Created' },
  folder_deleted: { icon: FolderMinus, color: 'text-slate-500', label: 'Folder Deleted' },
  prompt: { icon: Sparkles, color: 'text-blue-400', label: 'Prompt' },
  copilot_chat: { icon: MessageSquare, color: 'text-blue-400', label: 'Chat' },
  error: { icon: AlertCircle, color: 'text-red-400', label: 'Error' },
  summary: { icon: Activity, color: 'text-slate-400', label: 'Summary' },
  ai_match: { icon: Brain, color: 'text-indigo-400', label: 'AI Match' },
  implications_analysis: { icon: Brain, color: 'text-indigo-400', label: 'AI Analysis' },
}

// File categorization helper
function categorizeFile(path: string): { category: string; icon: any; color: string } {
  const lower = path.toLowerCase()

  if (lower.includes('frontend') || lower.includes('ui') || lower.includes('components') || lower.match(/\.(tsx|jsx|css|scss|html)$/)) {
    return { category: 'Frontend', icon: Layout, color: 'text-blue-400' }
  }
  if (lower.includes('backend') || lower.includes('api') || lower.includes('server') || lower.match(/\.(py|go|java|rb|php)$/)) {
    return { category: 'Backend', icon: Server, color: 'text-green-400' }
  }
  if (lower.includes('test') || lower.includes('spec') || lower.match(/\.(test|spec)\./)) {
    return { category: 'Tests', icon: TestTube, color: 'text-purple-400' }
  }
  if (lower.match(/\.(json|yaml|yml|toml|env|config)$/) || lower.includes('config')) {
    return { category: 'Config', icon: FileCog, color: 'text-amber-400' }
  }
  if (lower.includes('package') || lower.includes('requirements') || lower.includes('cargo') || lower.includes('go.mod')) {
    return { category: 'Dependencies', icon: Package, color: 'text-orange-400' }
  }
  if (lower.includes('docs') || lower.match(/\.(md|txt|pdf)$/)) {
    return { category: 'Docs', icon: FileText, color: 'text-cyan-400' }
  }

  return { category: 'Other', icon: FileCode, color: 'text-slate-400' }
}

function EventListItem({ event, onAnalyze }: { event: Event; onAnalyze: (id: number) => void }) {
  const [expanded, setExpanded] = useState(false)
  const config = EVENT_CONFIG[event.kind] || EVENT_CONFIG.file_change
  const Icon = config.icon
  const category = event.path ? categorizeFile(event.path) : null
  const CategoryIcon = category?.icon

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className="border-l-2 border-slate-700 hover:border-blue-500 transition-all duration-200 bg-slate-800/30 hover:bg-slate-800/50"
    >
      <div
        className="px-4 py-3 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start gap-3">
          <div className={cn('mt-1', config.color)}>
            <Icon className="w-4 h-4" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-medium text-slate-200">{config.label}</span>
              {category && (
                <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-slate-700/50 text-slate-300">
                  <CategoryIcon className="w-3 h-3" />
                  {category.category}
                </span>
              )}
              <span className="text-xs text-slate-500">
                <Clock className="w-3 h-3 inline mr-1" />
                {formatRelativeTime(event.ts)}
              </span>
            </div>

            {event.path && (
              <p className="text-sm text-slate-400 font-mono truncate">{event.path}</p>
            )}

            {!expanded && (
              <p className="text-xs text-slate-500 truncate mt-1">
                {event.kind === 'file_change' && `${event.payload.event} • ${event.payload.size} bytes`}
                {event.kind === 'folder_created' && 'Directory created'}
                {event.kind === 'folder_deleted' && 'Directory deleted'}
                {event.kind === 'prompt' && event.payload.text}
                {event.kind === 'copilot_chat' && `Q: ${event.payload.prompt?.substring(0, 50)}...`}
                {event.kind === 'error' && event.payload.message}
                {event.kind === 'implications_analysis' && `Analyzed ${event.payload.event_count ?? event.payload.changes_analyzed} changes`}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            {event.id && (event.kind === 'file_change' || event.kind === 'folder_created' || event.kind === 'folder_deleted') && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onAnalyze(event.id!)
                }}
                className="px-2 py-1 text-xs bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 rounded border border-indigo-500/30 transition-colors"
              >
                <Brain className="w-3 h-3 inline mr-1" />
                AI
              </button>
            )}
            {expanded ? (
              <ChevronDown className="w-4 h-4 text-slate-500" />
            ) : (
              <ChevronRight className="w-4 h-4 text-slate-500" />
            )}
          </div>
        </div>
      </div>

      {/* Expanded details */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden bg-slate-900/50 border-t border-slate-700"
          >
            <div className="px-4 py-4 space-y-3">
              <div className="text-xs text-slate-500">
                <Calendar className="w-3 h-3 inline mr-1" />
                {new Date(event.ts).toLocaleString()}
              </div>

              {event.kind === 'file_change' && event.payload.diff && (
                <div className="space-y-2">
                  <div className="flex items-center gap-4 text-xs text-slate-400">
                    <span>Size: <span className="text-slate-300">{event.payload.size} bytes</span></span>
                    <span>Baseline: <span className="text-slate-300">{event.payload.baseline}</span></span>
                  </div>
                  <div className="bg-slate-950 rounded border border-slate-800 p-3 overflow-x-auto max-h-96 overflow-y-auto">
                    <pre className="text-xs text-slate-300 font-mono">
                      <code>{event.payload.diff}</code>
                    </pre>
                  </div>
                </div>
              )}

              {event.kind === 'prompt' && (
                <div className="space-y-2">
                  <div className="bg-blue-500/5 border border-blue-500/20 rounded p-3">
                    <p className="text-sm text-slate-200 whitespace-pre-wrap">{event.payload.text}</p>
                  </div>
                  <div className="text-xs text-slate-500">
                    {event.payload.source} • {event.payload.model}
                  </div>
                </div>
              )}

              {event.kind === 'copilot_chat' && (
                <div className="space-y-2">
                  <div className="bg-blue-500/5 border border-blue-500/20 rounded p-3">
                    <p className="text-xs text-blue-300 font-semibold mb-1">Question:</p>
                    <p className="text-sm text-slate-200">{event.payload.prompt}</p>
                  </div>
                  <div className="bg-slate-800/50 border border-slate-700 rounded p-3">
                    <p className="text-xs text-slate-400 font-semibold mb-1">Answer:</p>
                    <p className="text-sm text-slate-200">{event.payload.response}</p>
                  </div>
                </div>
              )}

              {event.kind === 'implications_analysis' && event.payload.content && (
                <div className="prose prose-invert prose-sm max-w-none">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      h1: ({ ...props }) => <h1 className="text-base font-bold text-slate-200 mb-2" {...props} />,
                      h2: ({ ...props }) => <h2 className="text-sm font-bold text-slate-200 mb-2" {...props} />,
                      h3: ({ ...props }) => <h3 className="text-sm font-semibold text-slate-300 mb-1" {...props} />,
                      p: ({ ...props }) => <p className="text-sm text-slate-300 mb-2 leading-relaxed" {...props} />,
                      ul: ({ ...props }) => <ul className="list-disc list-inside text-slate-300 space-y-1 mb-2 text-sm" {...props} />,
                      ol: ({ ...props }) => <ol className="list-decimal list-inside text-slate-300 space-y-1 mb-2 text-sm" {...props} />,
                      li: ({ ...props }) => <li className="text-slate-300 text-sm" {...props} />,
                      code: ({ ...props }) => <code className="bg-slate-800 px-1 py-0.5 rounded text-blue-300 text-xs" {...props} />,
                      strong: ({ ...props }) => <strong className="text-slate-200 font-semibold" {...props} />,
                    }}
                  >
                    {event.payload.content}
                  </ReactMarkdown>
                </div>
              )}

              {event.kind === 'error' && (
                <div className="bg-red-500/5 border border-red-500/20 rounded p-3">
                  <p className="text-sm text-red-300">{event.payload.message}</p>
                  {event.payload.context && Object.keys(event.payload.context).length > 0 && (
                    <pre className="text-xs text-slate-400 mt-2">
                      {JSON.stringify(event.payload.context, null, 2)}
                    </pre>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function AddProjectModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('')
  const [path, setPath] = useState('')
  const [description, setDescription] = useState('')
  const [ignorePatterns, setIgnorePatterns] = useState('')
  const [featureDocPath, setFeatureDocPath] = useState('')
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: createProject,
    onSuccess: () => {
      toast.success('Project added successfully')
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      onClose()
    },
    onError: (error: any) => {
      toast.error('Failed to add project', {
        description: error.message || 'Please check the path and try again',
      })
    },
  })

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 20 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-slate-900 rounded-lg p-6 max-w-lg w-full border border-slate-700 shadow-2xl"
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-slate-100">Add New Project</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Project Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="My Project"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Folder Path (Inside Container)
            </label>
            <div className="mb-2 p-3 bg-blue-500/5 border border-blue-500/20 rounded text-xs text-blue-300">
              <div className="font-semibold mb-1">📦 Available paths:</div>
              <div className="font-mono space-y-1">
                <div>• <span className="text-blue-400">/projects/</span> → Your projects folder</div>
                <div>• <span className="text-blue-400">/workspace/</span> → This Code-Monitor project</div>
              </div>
            </div>
            <input
              type="text"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
              placeholder="/projects/myapp"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Description (Optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 h-20"
              placeholder="A brief description..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Ignore Patterns (Optional)
            </label>
            <textarea
              value={ignorePatterns}
              onChange={(e) => setIgnorePatterns(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 h-20 font-mono text-xs"
              placeholder="*.log&#10;node_modules/*&#10;*.tmp"
            />
            <p className="text-xs text-slate-500 mt-1">One pattern per line (e.g., *.log, build/*, etc.)</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Feature Document Path (Optional)
            </label>
            <input
              type="text"
              value={featureDocPath}
              onChange={(e) => setFeatureDocPath(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
              placeholder="/projects/myapp/ARCHITECTURE.md"
            />
            <p className="text-xs text-slate-500 mt-1">
              📄 Path to technical architecture document for living documentation & AI-powered impact analysis
            </p>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              onClick={() => {
                const patterns = ignorePatterns.split('\n').filter(p => p.trim()).map(p => p.trim())
                mutation.mutate({
                  name,
                  path,
                  description,
                  ignore_patterns: patterns,
                  feature_doc_path: featureDocPath.trim() || undefined
                })
              }}
              disabled={!name || !path || mutation.isPending}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {mutation.isPending ? 'Adding...' : 'Add Project'}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded font-medium transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

function ProjectSettingsModal({ projectId, projectName, onClose }: { projectId: number; projectName: string; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [ignorePatterns, setIgnorePatterns] = useState('')
  const [featureDocPath, setFeatureDocPath] = useState('')

  const { data: configData, isLoading } = useQuery({
    queryKey: ['projectConfig', projectId],
    queryFn: () => fetchProjectConfig(projectId),
  })

  useEffect(() => {
    if (configData) {
      setIgnorePatterns((configData.ignore_patterns || []).join('\n'))
      setFeatureDocPath(configData.feature_doc_path || '')
    }
  }, [configData])

  const mutation = useMutation({
    mutationFn: (config: { ignore_patterns?: string[], feature_doc_path?: string }) =>
      updateProjectConfig(projectId, config),
    onSuccess: () => {
      toast.success('Settings updated successfully')
      queryClient.invalidateQueries({ queryKey: ['projectConfig', projectId] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      onClose()
    },
    onError: (error: any) => {
      toast.error('Failed to update settings', {
        description: error.message || 'Please try again',
      })
    },
  })

  const handleSave = () => {
    const patterns = ignorePatterns.split('\n').filter(p => p.trim()).map(p => p.trim())
    mutation.mutate({
      ignore_patterns: patterns,
      feature_doc_path: featureDocPath.trim() || undefined
    })
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 20 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-slate-900 rounded-lg p-6 max-w-lg w-full border border-slate-700 shadow-2xl"
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-slate-100">Project Settings</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        {isLoading ? (
          <div className="text-center py-8 text-slate-400">Loading settings...</div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Project Name</label>
              <div className="px-3 py-2 bg-slate-800/50 border border-slate-700 rounded text-slate-400 text-sm">
                {projectName}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Ignore Patterns
              </label>
              <textarea
                value={ignorePatterns}
                onChange={(e) => setIgnorePatterns(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 h-32 font-mono text-xs"
                placeholder="*.log&#10;node_modules/*&#10;*.tmp&#10;build/*"
              />
              <p className="text-xs text-slate-500 mt-1">One pattern per line. Files matching these patterns will be ignored.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Feature Document Path (Optional)
              </label>
              <input
                type="text"
                value={featureDocPath}
                onChange={(e) => setFeatureDocPath(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                placeholder="/projects/myapp/ARCHITECTURE.md"
              />
              <p className="text-xs text-slate-500 mt-1">Path to technical documentation for living document system (coming soon)</p>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={handleSave}
                disabled={mutation.isPending}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {mutation.isPending ? 'Saving...' : 'Save Changes'}
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}

function AIAnalysisModal({
  projectId,
  onClose,
}: {
  projectId?: number
  onClose: () => void
}) {
  const [hours, setHours] = useState(24)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['implications', projectId, hours],
    queryFn: () => analyzeImplications(projectId, hours),
    enabled: false,
  })

  useEffect(() => {
    refetch()
  }, [])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 20 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-slate-900 rounded-lg p-6 max-w-3xl w-full border border-slate-700 shadow-2xl max-h-[80vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/30">
              <Brain className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-slate-100">AI Project Analysis</h2>
              <p className="text-sm text-slate-400">Understanding recent changes</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        {isLoading && (
          <div className="flex flex-col items-center justify-center py-12">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
              className="mb-4"
            >
              <Brain className="w-10 h-10 text-indigo-400" />
            </motion.div>
            <p className="text-slate-400">AI is analyzing your project changes...</p>
          </div>
        )}

        {data && !isLoading && (
          <div className="space-y-4">
            <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-lg p-3">
              <div className="text-xs text-indigo-300">
                Analyzed {data.event_count} changes from the last {hours} hours
              </div>
            </div>

            <div className="prose prose-invert prose-sm max-w-none bg-slate-950 rounded-lg p-6 border border-slate-800">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  h1: ({ ...props }) => <h1 className="text-xl font-bold text-slate-100 mb-4" {...props} />,
                  h2: ({ ...props }) => <h2 className="text-lg font-bold text-slate-200 mb-3 mt-6" {...props} />,
                  h3: ({ ...props }) => <h3 className="text-base font-semibold text-slate-300 mb-2 mt-4" {...props} />,
                  p: ({ ...props }) => <p className="text-slate-300 mb-3 leading-relaxed" {...props} />,
                  ul: ({ ...props }) => <ul className="list-disc list-inside text-slate-300 space-y-2 mb-4" {...props} />,
                  ol: ({ ...props }) => <ol className="list-decimal list-inside text-slate-300 space-y-2 mb-4" {...props} />,
                  li: ({ ...props }) => <li className="text-slate-300" {...props} />,
                  code: ({ ...props }) => <code className="bg-slate-800 px-2 py-1 rounded text-blue-300 text-sm" {...props} />,
                  strong: ({ ...props }) => <strong className="text-slate-100 font-semibold" {...props} />,
                }}
              >
                {data.analysis}
              </ReactMarkdown>
            </div>

            <div className="flex gap-2">
              <select
                value={hours}
                onChange={(e) => setHours(Number(e.target.value))}
                className="px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value={1}>Last hour</option>
                <option value={6}>Last 6 hours</option>
                <option value={24}>Last 24 hours</option>
                <option value={168}>Last week</option>
              </select>
              <button
                onClick={() => refetch()}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-medium transition-colors"
              >
                Re-analyze
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}

function ChangeAnalysisModal({
  eventId,
  onClose,
}: {
  eventId: number
  onClose: () => void
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['change-analysis', eventId],
    queryFn: () => analyzeChange(eventId),
  })

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 20 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-slate-900 rounded-lg p-6 max-w-2xl w-full border border-slate-700 shadow-2xl"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/30">
              <Brain className="w-5 h-5 text-indigo-400" />
            </div>
            <h2 className="text-lg font-semibold text-slate-100">Change Analysis</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        {isLoading && (
          <div className="flex flex-col items-center justify-center py-8">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
              className="mb-4"
            >
              <Brain className="w-8 h-8 text-indigo-400" />
            </motion.div>
            <p className="text-slate-400 text-sm">Analyzing change...</p>
          </div>
        )}

        {data && !isLoading && (
          <div className="prose prose-invert prose-sm max-w-none bg-slate-950 rounded-lg p-4 border border-slate-800">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1: ({ ...props }) => <h1 className="text-lg font-bold text-slate-100 mb-3" {...props} />,
                h2: ({ ...props }) => <h2 className="text-base font-bold text-slate-200 mb-2" {...props} />,
                h3: ({ ...props }) => <h3 className="text-sm font-semibold text-slate-300 mb-2" {...props} />,
                p: ({ ...props }) => <p className="text-slate-300 mb-2 leading-relaxed text-sm" {...props} />,
                ul: ({ ...props }) => <ul className="list-disc list-inside text-slate-300 space-y-1 mb-3 text-sm" {...props} />,
                ol: ({ ...props }) => <ol className="list-decimal list-inside text-slate-300 space-y-1 mb-3 text-sm" {...props} />,
                li: ({ ...props }) => <li className="text-slate-300 text-sm" {...props} />,
                code: ({ ...props }) => <code className="bg-slate-800 px-1.5 py-0.5 rounded text-blue-300 text-xs" {...props} />,
                strong: ({ ...props }) => <strong className="text-slate-100 font-semibold" {...props} />,
              }}
            >
              {data.analysis}
            </ReactMarkdown>
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}

// AI Conversation Components
function AIConversationCard({
  conversation,
  onViewTimeline
}: {
  conversation: AIConversation
  onViewTimeline: (id: number) => void
}) {
  const [expanded, setExpanded] = useState(false)

  const providerColors: Record<string, string> = {
    claude: 'from-orange-500 to-amber-500',
    copilot: 'from-blue-500 to-cyan-500',
    cursor: 'from-purple-500 to-pink-500',
    aider: 'from-green-500 to-emerald-500',
  }

  const gradient = providerColors[conversation.ai_provider.toLowerCase()] || 'from-slate-500 to-slate-600'

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className="border-l-2 border-slate-700 hover:border-purple-500 transition-all duration-200 bg-slate-800/30 hover:bg-slate-800/50"
    >
      <div
        className="px-4 py-3 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start gap-3">
          <div className={cn('p-2 rounded-lg bg-gradient-to-br', gradient)}>
            <Bot className="w-4 h-4 text-white" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-medium text-slate-200">{conversation.ai_provider}</span>
              {conversation.ai_model && (
                <span className="text-xs px-2 py-0.5 rounded bg-slate-700/50 text-slate-400">
                  {conversation.ai_model}
                </span>
              )}
              {conversation.matched_to_events && conversation.matched_to_events.length > 0 && (
                <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/30">
                  <Link2 className="w-3 h-3" />
                  {conversation.matched_to_events.length} matches
                </span>
              )}
              <span className="text-xs text-slate-500">
                <Clock className="w-3 h-3 inline mr-1" />
                {formatRelativeTime(conversation.timestamp)}
              </span>
            </div>

            <p className="text-sm text-slate-400 truncate">
              {conversation.user_prompt}
            </p>

            {conversation.context_files && conversation.context_files.length > 0 && (
              <div className="flex items-center gap-1 mt-2">
                <FileText className="w-3 h-3 text-slate-500" />
                <span className="text-xs text-slate-500">
                  {conversation.context_files.length} file{conversation.context_files.length !== 1 ? 's' : ''}
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation()
                onViewTimeline(conversation.id)
              }}
              className="px-2 py-1 text-xs bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 rounded border border-purple-500/30 transition-colors flex items-center gap-1"
            >
              <TrendingUp className="w-3 h-3" />
              Timeline
            </button>
            {expanded ? (
              <ChevronDown className="w-4 h-4 text-slate-500" />
            ) : (
              <ChevronRight className="w-4 h-4 text-slate-500" />
            )}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden bg-slate-900/50 border-t border-slate-700"
          >
            <div className="px-4 py-4 space-y-3">
              <div>
                <p className="text-xs text-purple-300 font-semibold mb-1">Prompt:</p>
                <div className="bg-purple-500/5 border border-purple-500/20 rounded p-3">
                  <p className="text-sm text-slate-200 whitespace-pre-wrap">{conversation.user_prompt}</p>
                </div>
              </div>

              <div>
                <p className="text-xs text-slate-400 font-semibold mb-1">Response:</p>
                <div className="bg-slate-800/50 border border-slate-700 rounded p-3 max-h-64 overflow-y-auto">
                  <div className="text-sm text-slate-200 prose prose-invert prose-sm max-w-none">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        code: ({ ...props }) => <code className="bg-slate-900 px-1 py-0.5 rounded text-blue-300 text-xs" {...props} />,
                        pre: ({ ...props }) => <pre className="bg-slate-900 p-2 rounded overflow-x-auto text-xs" {...props} />,
                      }}
                    >
                      {conversation.ai_response}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>

              {conversation.code_snippets && conversation.code_snippets.length > 0 && (
                <div>
                  <p className="text-xs text-slate-400 font-semibold mb-2 flex items-center gap-1">
                    <Code className="w-3 h-3" />
                    Code Snippets ({conversation.code_snippets.length})
                  </p>
                  <div className="space-y-2">
                    {conversation.code_snippets.map((snippet, idx) => (
                      <div key={idx} className="bg-slate-950 rounded border border-slate-800 overflow-hidden">
                        <div className="px-2 py-1 bg-slate-900/50 text-xs text-slate-400 border-b border-slate-800">
                          {snippet.language} ({snippet.lines} lines)
                        </div>
                        <pre className="p-2 overflow-x-auto text-xs text-slate-300">
                          <code>{snippet.code}</code>
                        </pre>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {conversation.context_files && conversation.context_files.length > 0 && (
                <div>
                  <p className="text-xs text-slate-400 font-semibold mb-1">Context Files:</p>
                  <div className="flex flex-wrap gap-1">
                    {conversation.context_files.map((file, idx) => (
                      <span key={idx} className="text-xs px-2 py-1 bg-slate-800 rounded border border-slate-700 text-slate-300 font-mono">
                        {file}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function AIConversationTimelineModal({
  conversationId,
  onClose,
}: {
  conversationId: number
  onClose: () => void
}) {
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['ai-conversation-timeline', conversationId],
    queryFn: () => fetchAIConversationTimeline(conversationId),
  })

  const matchMutation = useMutation({
    mutationFn: () => matchAIConversation(conversationId),
    onSuccess: () => {
      toast.success('Conversation matched successfully')
      queryClient.invalidateQueries({ queryKey: ['ai-conversation-timeline', conversationId] })
      queryClient.invalidateQueries({ queryKey: ['ai-conversations'] })
    },
    onError: () => {
      toast.error('Failed to match conversation')
    },
  })

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 20 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-slate-900 rounded-lg p-6 max-w-4xl w-full border border-slate-700 shadow-2xl max-h-[80vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-500/10 border border-purple-500/30">
              <TrendingUp className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-slate-100">Conversation Timeline</h2>
              <p className="text-sm text-slate-400">AI conversation and matched code changes</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        {isLoading && (
          <div className="flex flex-col items-center justify-center py-12">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
              className="mb-4"
            >
              <Brain className="w-10 h-10 text-purple-400" />
            </motion.div>
            <p className="text-slate-400">Loading timeline...</p>
          </div>
        )}

        {data && !isLoading && (
          <div className="space-y-6">
            {/* Conversation */}
            <div className="bg-purple-500/5 border border-purple-500/20 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Bot className="w-5 h-5 text-purple-400" />
                  <span className="font-semibold text-slate-200">{data.conversation.ai_provider}</span>
                  {data.conversation.ai_model && (
                    <span className="text-xs px-2 py-0.5 rounded bg-slate-700/50 text-slate-400">
                      {data.conversation.ai_model}
                    </span>
                  )}
                </div>
                <span className="text-xs text-slate-500">
                  {new Date(data.conversation.timestamp).toLocaleString()}
                </span>
              </div>

              <div className="space-y-2">
                <div>
                  <p className="text-xs text-purple-300 font-semibold mb-1">Prompt:</p>
                  <p className="text-sm text-slate-200">{data.conversation.user_prompt}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-semibold mb-1">Response:</p>
                  <div className="text-sm text-slate-300 max-h-32 overflow-y-auto">
                    {data.conversation.ai_response.substring(0, 300)}...
                  </div>
                </div>
              </div>
            </div>

            {/* Matched Changes */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-slate-200 flex items-center gap-2">
                  <Link2 className="w-5 h-5 text-green-400" />
                  Matched Code Changes ({data.matched_changes.length})
                </h3>
                <button
                  onClick={() => matchMutation.mutate()}
                  disabled={matchMutation.isPending}
                  className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {matchMutation.isPending ? 'Matching...' : 'Re-match'}
                </button>
              </div>

              {data.matched_changes.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <Link2 className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No code changes matched yet</p>
                  <p className="text-sm mt-1">Make code changes within 5 minutes of the conversation</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {data.matched_changes.map((match) => (
                    <motion.div
                      key={match.event_id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-slate-800/50 border border-slate-700 rounded-lg p-4"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <FileText className="w-4 h-4 text-blue-400" />
                            <span className="text-sm font-mono text-slate-200">{match.path}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs px-2 py-0.5 rounded bg-slate-700/50 text-slate-400">
                              {match.match_type}
                            </span>
                            <span className="text-xs text-slate-500">
                              {Math.floor(match.time_delta / 60)}m {match.time_delta % 60}s after conversation
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            'text-xs px-2 py-1 rounded font-medium',
                            match.confidence >= 0.8 ? 'bg-green-500/10 text-green-400 border border-green-500/30' :
                            match.confidence >= 0.6 ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/30' :
                            'bg-red-500/10 text-red-400 border border-red-500/30'
                          )}>
                            {Math.round(match.confidence * 100)}% confidence
                          </span>
                        </div>
                      </div>

                      <p className="text-sm text-slate-300 mb-2">{match.reasoning}</p>

                      {match.diff && (
                        <div className="bg-slate-950 rounded border border-slate-800 p-2 overflow-x-auto max-h-48 overflow-y-auto">
                          <pre className="text-xs text-slate-300 font-mono">
                            <code>{match.diff}</code>
                          </pre>
                        </div>
                      )}
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}

export default function App() {
  const [selectedProject, setSelectedProject] = useState<number | undefined>()
  const [showAddProject, setShowAddProject] = useState(false)
  const [showAnalysis, setShowAnalysis] = useState(false)
  const [showChangeAnalysis, setShowChangeAnalysis] = useState<number | null>(null)
  const [showSettings, setShowSettings] = useState<{ projectId: number; projectName: string } | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [activeTab, setActiveTab] = useState<'events' | 'ai-chat'>('events')
  const [showAITimeline, setShowAITimeline] = useState<number | null>(null)
  const eventsPerPage = 50
  const queryClient = useQueryClient()

  const { data: projectsData } = useQuery({
    queryKey: ['projects'],
    queryFn: fetchProjects,
    refetchInterval: 5000,
  })

  const { data: eventsData } = useQuery({
    queryKey: ['events', selectedProject, currentPage],
    queryFn: () => fetchEvents(selectedProject, eventsPerPage, (currentPage - 1) * eventsPerPage),
    refetchInterval: 2000,
    enabled: activeTab === 'events',
  })

  const { data: aiConversationsData } = useQuery({
    queryKey: ['ai-conversations', selectedProject, currentPage],
    queryFn: () => fetchAIConversations({
      project_id: selectedProject,
      limit: eventsPerPage,
      offset: (currentPage - 1) * eventsPerPage,
    }),
    refetchInterval: 5000,
    enabled: activeTab === 'ai-chat',
  })

  const { data: aiStatsData } = useQuery({
    queryKey: ['ai-stats', selectedProject],
    queryFn: () => fetchAIStats(selectedProject),
    refetchInterval: 10000,
    enabled: activeTab === 'ai-chat',
  })

  // Reset to page 1 when project or tab changes
  useEffect(() => {
    setCurrentPage(1)
  }, [selectedProject, activeTab])

  const deleteMutation = useMutation({
    mutationFn: deleteProject,
    onSuccess: () => {
      toast.success('Project deleted')
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      if (selectedProject) setSelectedProject(undefined)
    },
  })

  // Setup event stream
  useEffect(() => {
    const cleanup = createEventStream(() => {
      queryClient.invalidateQueries({ queryKey: ['events'] })
      queryClient.invalidateQueries({ queryKey: ['ai-conversations'] })
    })
    return cleanup
  }, [queryClient])

  const filteredEvents = eventsData?.items?.filter((event: Event) => {
    if (!searchQuery) return true
    const search = searchQuery.toLowerCase()
    return (
      event.path?.toLowerCase().includes(search) ||
      event.kind.toLowerCase().includes(search) ||
      JSON.stringify(event.payload).toLowerCase().includes(search)
    )
  }) || []

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      <Toaster position="top-right" theme="dark" />

      <header className="sticky top-0 z-40 bg-slate-900/80 backdrop-blur-xl border-b border-slate-800">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center">
                <Activity className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-slate-100">Code Monitor</h1>
                <p className="text-xs text-slate-400">Multi-Project Development Tracker</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {selectedProject ? (
                <>
                  <a
                    href={`${API_BASE}/events/export?project_id=${selectedProject}&format=markdown`}
                    download="code-monitor-log.md"
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded border border-slate-700 font-medium transition-colors flex items-center gap-2 text-sm"
                  >
                    <Download className="w-4 h-4" />
                    MD
                  </a>
                  <a
                    href={`${API_BASE}/events/export?project_id=${selectedProject}&format=json`}
                    download="code-monitor-log.json"
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded border border-slate-700 font-medium transition-colors flex items-center gap-2 text-sm"
                  >
                    <Download className="w-4 h-4" />
                    JSON
                  </a>
                </>
              ) : (
                <>
                  <button
                    disabled
                    className="px-3 py-2 bg-slate-800 text-slate-500 rounded border border-slate-700 font-medium flex items-center gap-2 text-sm opacity-50 cursor-not-allowed"
                  >
                    <Download className="w-4 h-4" />
                    MD
                  </button>
                  <button
                    disabled
                    className="px-3 py-2 bg-slate-800 text-slate-500 rounded border border-slate-700 font-medium flex items-center gap-2 text-sm opacity-50 cursor-not-allowed"
                  >
                    <Download className="w-4 h-4" />
                    JSON
                  </button>
                </>
              )}
              <button
                onClick={() => setShowAddProject(true)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium transition-colors flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Add Project
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-12 gap-6">
          {/* Sidebar - Projects */}
          <div className="col-span-12 lg:col-span-3">
            <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-800">
              <h2 className="text-sm font-semibold mb-4 flex items-center gap-2 text-slate-300">
                <FolderOpen className="w-4 h-4" />
                Projects
              </h2>

              <div className="space-y-2">
                {projectsData?.projects.map((project: Project) => (
                  <div
                    key={project.id}
                    onClick={() => setSelectedProject(project.id)}
                    className={cn(
                      'p-3 rounded cursor-pointer transition-all border',
                      selectedProject === project.id
                        ? 'bg-blue-600/10 border-blue-600/50'
                        : 'bg-slate-800/30 border-slate-700/50 hover:bg-slate-800/50'
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-medium text-slate-200 truncate">
                            {project.name}
                          </h3>
                          {project.monitoring && (
                            <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 font-mono truncate mt-1">
                          {project.path}
                        </p>
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <span className="text-xs text-slate-400">
                            {project.event_count} events
                          </span>
                          {project.has_technical_doc && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-500/10 border border-indigo-500/30 rounded text-xs text-indigo-400" title="Living technical document enabled">
                              <FileText className="w-3 h-3" />
                              Tech Doc
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setShowSettings({ projectId: project.id, projectName: project.name })
                          }}
                          className="text-slate-500 hover:text-blue-400 transition-colors"
                          title="Project Settings"
                        >
                          <Settings className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            if (confirm(`Delete ${project.name}?`)) {
                              deleteMutation.mutate(project.id)
                            }
                          }}
                          className="text-slate-500 hover:text-red-400 transition-colors"
                          title="Delete Project"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Main - Events & AI Chat */}
          <div className="col-span-12 lg:col-span-9">
            <div className="bg-slate-900/50 rounded-lg border border-slate-800 overflow-hidden">
              {/* Tabs */}
              <div className="border-b border-slate-800">
                <div className="flex items-center gap-2 px-4 pt-4">
                  <button
                    onClick={() => setActiveTab('events')}
                    className={cn(
                      'px-4 py-2 rounded-t font-medium transition-colors flex items-center gap-2',
                      activeTab === 'events'
                        ? 'bg-slate-800 text-slate-100 border border-b-0 border-slate-700'
                        : 'text-slate-400 hover:text-slate-200'
                    )}
                  >
                    <Activity className="w-4 h-4" />
                    Events
                  </button>
                  <button
                    onClick={() => setActiveTab('ai-chat')}
                    className={cn(
                      'px-4 py-2 rounded-t font-medium transition-colors flex items-center gap-2',
                      activeTab === 'ai-chat'
                        ? 'bg-slate-800 text-slate-100 border border-b-0 border-slate-700'
                        : 'text-slate-400 hover:text-slate-200'
                    )}
                  >
                    <Bot className="w-4 h-4" />
                    AI Conversations
                    {aiStatsData && (
                      <span className="px-2 py-0.5 bg-purple-500/20 text-purple-300 rounded text-xs">
                        {aiStatsData.total_conversations}
                      </span>
                    )}
                  </button>
                </div>
              </div>

              {activeTab === 'events' && (
                <>
                  <div className="p-4 border-b border-slate-800">
                    <div className="flex items-center justify-between gap-4 mb-4">
                      <div className="flex-1 relative">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Search events..."
                          className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        />
                      </div>
                      <button
                        onClick={() => setShowAnalysis(true)}
                        disabled={!selectedProject}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-medium transition-colors flex items-center gap-2 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Brain className="w-4 h-4" />
                        AI Analysis
                      </button>
                      {selectedProject && projectsData?.projects.find((p: Project) => p.id === selectedProject)?.has_technical_doc && (
                        <a
                          href={`${API_BASE}/projects/${selectedProject}/technical-doc/export`}
                          download
                          className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded font-medium transition-colors flex items-center gap-2 whitespace-nowrap"
                        >
                          <FileText className="w-4 h-4" />
                          Tech Doc PDF
                        </a>
                      )}
                    </div>
                    <div className="text-sm text-slate-400">
                      {filteredEvents.length} {filteredEvents.length === 1 ? 'event' : 'events'}
                      {selectedProject && ` for ${projectsData?.projects.find((p: Project) => p.id === selectedProject)?.name}`}
                    </div>
                  </div>

                  <div className="divide-y divide-slate-800 max-h-[calc(100vh-320px)] overflow-y-auto">
                    {!selectedProject ? (
                      <div className="p-12 text-center text-slate-500">
                        <FolderOpen className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p className="text-lg font-medium mb-2">No Project Selected</p>
                        <p className="text-sm">Select a project from the sidebar to view events</p>
                      </div>
                    ) : filteredEvents.length === 0 ? (
                      <div className="p-12 text-center text-slate-500">
                        <Activity className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p>No events yet. Start coding to see changes!</p>
                      </div>
                    ) : (
                      filteredEvents.map((event: Event) => (
                        <EventListItem
                          key={event.id}
                          event={event}
                          onAnalyze={(id) => setShowChangeAnalysis(id)}
                        />
                      ))
                    )}
                  </div>

                  {/* Pagination Controls */}
                  {selectedProject && eventsData && eventsData.total > 0 && (
                    <div className="p-4 border-t border-slate-800 bg-slate-900/30">
                      <div className="flex items-center justify-between text-sm">
                        <div className="text-slate-400">
                          Showing {eventsData.offset + 1}-{Math.min(eventsData.offset + eventsData.items.length, eventsData.total)} of {eventsData.total} events
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                          >
                            <ChevronDown className="w-4 h-4 rotate-90" />
                            Previous
                          </button>
                          <div className="px-3 py-1.5 bg-slate-800/50 text-slate-300 rounded border border-slate-700">
                            Page {currentPage} of {Math.ceil(eventsData.total / eventsPerPage)}
                          </div>
                          <button
                            onClick={() => setCurrentPage(p => Math.min(Math.ceil(eventsData.total / eventsPerPage), p + 1))}
                            disabled={currentPage >= Math.ceil(eventsData.total / eventsPerPage)}
                            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                          >
                            Next
                            <ChevronDown className="w-4 h-4 -rotate-90" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}

              {activeTab === 'ai-chat' && (
                <>
                  <div className="p-4 border-b border-slate-800">
                    {aiStatsData && (
                      <div className="grid grid-cols-4 gap-4 mb-4">
                        <div className="bg-purple-500/5 border border-purple-500/20 rounded-lg p-3">
                          <div className="text-xs text-purple-300 mb-1">Total Conversations</div>
                          <div className="text-2xl font-bold text-slate-100">{aiStatsData.total_conversations}</div>
                        </div>
                        <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-3">
                          <div className="text-xs text-green-300 mb-1">Matched</div>
                          <div className="text-2xl font-bold text-slate-100">{aiStatsData.matched_conversations}</div>
                        </div>
                        <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-3">
                          <div className="text-xs text-yellow-300 mb-1">Unmatched</div>
                          <div className="text-2xl font-bold text-slate-100">{aiStatsData.unmatched_conversations}</div>
                        </div>
                        <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-3">
                          <div className="text-xs text-blue-300 mb-1">Providers</div>
                          <div className="text-xs text-slate-300 space-y-1 mt-2">
                            {aiStatsData.by_provider.map((p) => (
                              <div key={p.provider} className="flex items-center justify-between">
                                <span className="capitalize">{p.provider}</span>
                                <span className="font-semibold">{p.count}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="text-sm text-slate-400">
                      {aiConversationsData?.total || 0} conversations
                      {selectedProject && ` for ${projectsData?.projects.find((p: Project) => p.id === selectedProject)?.name}`}
                    </div>
                  </div>

                  <div className="divide-y divide-slate-800 max-h-[calc(100vh-400px)] overflow-y-auto">
                    {!selectedProject ? (
                      <div className="p-12 text-center text-slate-500">
                        <FolderOpen className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p className="text-lg font-medium mb-2">No Project Selected</p>
                        <p className="text-sm">Select a project from the sidebar to view AI conversations</p>
                      </div>
                    ) : !aiConversationsData || aiConversationsData.conversations.length === 0 ? (
                      <div className="p-12 text-center text-slate-500">
                        <Bot className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p>No AI conversations yet.</p>
                        <p className="text-sm mt-1">Log conversations using the API or monitoring scripts</p>
                      </div>
                    ) : (
                      aiConversationsData.conversations.map((conversation: AIConversation) => (
                        <AIConversationCard
                          key={conversation.id}
                          conversation={conversation}
                          onViewTimeline={(id) => setShowAITimeline(id)}
                        />
                      ))
                    )}
                  </div>

                  {/* Pagination Controls */}
                  {selectedProject && aiConversationsData && aiConversationsData.total > 0 && (
                    <div className="p-4 border-t border-slate-800 bg-slate-900/30">
                      <div className="flex items-center justify-between text-sm">
                        <div className="text-slate-400">
                          Showing {((currentPage - 1) * eventsPerPage) + 1}-{Math.min(currentPage * eventsPerPage, aiConversationsData.total)} of {aiConversationsData.total} conversations
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                          >
                            <ChevronDown className="w-4 h-4 rotate-90" />
                            Previous
                          </button>
                          <div className="px-3 py-1.5 bg-slate-800/50 text-slate-300 rounded border border-slate-700">
                            Page {currentPage} of {Math.ceil(aiConversationsData.total / eventsPerPage)}
                          </div>
                          <button
                            onClick={() => setCurrentPage(p => Math.min(Math.ceil(aiConversationsData.total / eventsPerPage), p + 1))}
                            disabled={currentPage >= Math.ceil(aiConversationsData.total / eventsPerPage)}
                            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                          >
                            Next
                            <ChevronDown className="w-4 h-4 -rotate-90" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showAddProject && <AddProjectModal onClose={() => setShowAddProject(false)} />}
        {showSettings && (
          <ProjectSettingsModal
            projectId={showSettings.projectId}
            projectName={showSettings.projectName}
            onClose={() => setShowSettings(null)}
          />
        )}
        {showAnalysis && (
          <AIAnalysisModal projectId={selectedProject} onClose={() => setShowAnalysis(false)} />
        )}
        {showChangeAnalysis !== null && (
          <ChangeAnalysisModal
            eventId={showChangeAnalysis}
            onClose={() => setShowChangeAnalysis(null)}
          />
        )}
        {showAITimeline !== null && (
          <AIConversationTimelineModal
            conversationId={showAITimeline}
            onClose={() => setShowAITimeline(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
