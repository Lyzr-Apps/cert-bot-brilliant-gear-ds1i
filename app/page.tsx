'use client'

import React, { useState, useCallback, useRef, useEffect } from 'react'
import { callAIAgent, uploadFiles } from '@/lib/aiAgent'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Upload, File as FileIcon, Check, X, AlertCircle, Send, RefreshCw, Download, Mail, FileText, ArrowRight, ChevronRight, Award, Users, CheckCircle, XCircle, Clock, Info } from 'lucide-react'

// ─── Agent IDs ───────────────────────────────────────────────────────────────
const DATA_VALIDATION_AGENT_ID = '699ad39b085cc6c072ca8fc7'
const CERTIFICATE_GENERATION_AGENT_ID = '699ad39b06cd1ed2fd6cb5a0'
const EMAIL_DISPATCH_AGENT_ID = '699ad3aef71d07b7b0d9e82d'

// ─── TypeScript Interfaces ───────────────────────────────────────────────────
interface ValidationRow {
  row_number: number
  name: string
  email: string
  course: string
  date: string
  status: string
  issues: string[]
}

interface ValidationResult {
  total_rows: number
  valid_count: number
  invalid_count: number
  rows: ValidationRow[]
}

interface CertificateEntry {
  participant_name: string
  email: string
  course: string
  date: string
  status: string
  certificate_id: string
  error_message: string
  pdf_base64?: string
  filename?: string
}

interface GenerationResult {
  total: number
  generated: number
  failed: number
  certificates: CertificateEntry[]
}

interface DeliveryEntry {
  participant_name: string
  email: string
  status: string
  attempts: number
  timestamp: string
  error_message: string
}

interface DispatchResult {
  total_sent: number
  total_failed: number
  total_retried: number
  deliveries: DeliveryEntry[]
}

// ─── Agent Response Parser ───────────────────────────────────────────────────
function parseAgentResponse<T>(result: any): T {
  const rawResult = result?.response?.result
  if (!rawResult) throw new Error('No result in agent response')
  if (typeof rawResult === 'string') {
    try {
      return JSON.parse(rawResult) as T
    } catch {
      const match = rawResult.match(/\{[\s\S]*\}/)
      if (match) return JSON.parse(match[0]) as T
      throw new Error('Could not parse agent response')
    }
  }
  return rawResult as T
}

// ─── CSV Parser ──────────────────────────────────────────────────────────────
function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.split('\n').filter(line => line.trim())
  if (lines.length === 0) return { headers: [], rows: [] }
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
  const rows = lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''))
    const row: Record<string, string> = {}
    headers.forEach((h, i) => { row[h] = values[i] || '' })
    return row
  })
  return { headers, rows }
}

// ─── CSV Export ──────────────────────────────────────────────────────────────
function exportToCSV(data: Record<string, any>[], filename: string) {
  if (!Array.isArray(data) || data.length === 0) return
  const headers = Object.keys(data[0]).join(',')
  const rows = data.map(row => Object.values(row).map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
  const csv = [headers, ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Markdown Renderer ──────────────────────────────────────────────────────
function formatInline(text: string) {
  const parts = text.split(/\*\*(.*?)\*\*/g)
  if (parts.length === 1) return text
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="font-semibold">{part}</strong>
    ) : (
      part
    )
  )
}

function renderMarkdown(text: string) {
  if (!text) return null
  return (
    <div className="space-y-2">
      {text.split('\n').map((line, i) => {
        if (line.startsWith('### ')) return <h4 key={i} className="font-semibold text-sm mt-3 mb-1">{line.slice(4)}</h4>
        if (line.startsWith('## ')) return <h3 key={i} className="font-semibold text-base mt-3 mb-1">{line.slice(3)}</h3>
        if (line.startsWith('# ')) return <h2 key={i} className="font-bold text-lg mt-4 mb-2">{line.slice(2)}</h2>
        if (line.startsWith('- ') || line.startsWith('* ')) return <li key={i} className="ml-4 list-disc text-sm">{formatInline(line.slice(2))}</li>
        if (/^\d+\.\s/.test(line)) return <li key={i} className="ml-4 list-decimal text-sm">{formatInline(line.replace(/^\d+\.\s/, ''))}</li>
        if (!line.trim()) return <div key={i} className="h-1" />
        return <p key={i} className="text-sm">{formatInline(line)}</p>
      })}
    </div>
  )
}

// ─── Sample Data ─────────────────────────────────────────────────────────────
const SAMPLE_CSV_HEADERS = ['Name', 'Email', 'Course', 'Date']
const SAMPLE_CSV_ROWS: Record<string, string>[] = [
  { Name: 'Alice Johnson', Email: 'alice@example.com', Course: 'Advanced React', Date: '2025-01-15' },
  { Name: 'Bob Williams', Email: 'bob@example.com', Course: 'Advanced React', Date: '2025-01-15' },
  { Name: 'Carol Davis', Email: 'carol@example.com', Course: 'Data Science Fundamentals', Date: '2025-01-20' },
  { Name: 'David Chen', Email: 'david@example.com', Course: 'Data Science Fundamentals', Date: '2025-01-20' },
  { Name: 'Eve Martinez', Email: 'invalid-email', Course: 'Cloud Architecture', Date: '2025-01-25' },
]

const SAMPLE_VALIDATION: ValidationResult = {
  total_rows: 5,
  valid_count: 4,
  invalid_count: 1,
  rows: [
    { row_number: 1, name: 'Alice Johnson', email: 'alice@example.com', course: 'Advanced React', date: '2025-01-15', status: 'valid', issues: [] },
    { row_number: 2, name: 'Bob Williams', email: 'bob@example.com', course: 'Advanced React', date: '2025-01-15', status: 'valid', issues: [] },
    { row_number: 3, name: 'Carol Davis', email: 'carol@example.com', course: 'Data Science Fundamentals', date: '2025-01-20', status: 'valid', issues: [] },
    { row_number: 4, name: 'David Chen', email: 'david@example.com', course: 'Data Science Fundamentals', date: '2025-01-20', status: 'valid', issues: [] },
    { row_number: 5, name: 'Eve Martinez', email: 'invalid-email', course: 'Cloud Architecture', date: '2025-01-25', status: 'invalid', issues: ['Invalid email format'] },
  ],
}

const SAMPLE_GENERATION: GenerationResult = {
  total: 4,
  generated: 4,
  failed: 0,
  certificates: [
    { participant_name: 'Alice Johnson', email: 'alice@example.com', course: 'Advanced React', date: '2025-01-15', status: 'generated', certificate_id: 'CERT-AJ-2025-001', error_message: '' },
    { participant_name: 'Bob Williams', email: 'bob@example.com', course: 'Advanced React', date: '2025-01-15', status: 'generated', certificate_id: 'CERT-BW-2025-002', error_message: '' },
    { participant_name: 'Carol Davis', email: 'carol@example.com', course: 'Data Science Fundamentals', date: '2025-01-20', status: 'generated', certificate_id: 'CERT-CD-2025-003', error_message: '' },
    { participant_name: 'David Chen', email: 'david@example.com', course: 'Data Science Fundamentals', date: '2025-01-20', status: 'generated', certificate_id: 'CERT-DC-2025-004', error_message: '' },
  ],
}

const SAMPLE_DISPATCH: DispatchResult = {
  total_sent: 3,
  total_failed: 1,
  total_retried: 0,
  deliveries: [
    { participant_name: 'Alice Johnson', email: 'alice@example.com', status: 'sent', attempts: 1, timestamp: '2025-01-16T10:30:00Z', error_message: '' },
    { participant_name: 'Bob Williams', email: 'bob@example.com', status: 'sent', attempts: 1, timestamp: '2025-01-16T10:30:05Z', error_message: '' },
    { participant_name: 'Carol Davis', email: 'carol@example.com', status: 'sent', attempts: 1, timestamp: '2025-01-16T10:30:10Z', error_message: '' },
    { participant_name: 'David Chen', email: 'david@example.com', status: 'failed', attempts: 3, timestamp: '2025-01-16T10:31:30Z', error_message: 'SMTP timeout after 3 retries' },
  ],
}

// ─── Certificate Field Options ───────────────────────────────────────────────
const CERTIFICATE_FIELDS = ['Name', 'Email', 'Course', 'Date']

// ─── Error Boundary ──────────────────────────────────────────────────────────
class InlineErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: '' }
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
          <div className="text-center p-8 max-w-md">
            <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
            <p className="text-muted-foreground mb-4 text-sm">{this.state.error}</p>
            <button onClick={() => this.setState({ hasError: false, error: '' })} className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm">
              Try again
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// ─── Step Indicator ──────────────────────────────────────────────────────────
function StepIndicator({ currentStep, completedSteps }: { currentStep: number; completedSteps: number[] }) {
  const steps = [
    { label: 'Upload & Configure', icon: Upload },
    { label: 'Generate', icon: FileText },
    { label: 'Dispatch & Logs', icon: Send },
  ]
  return (
    <div className="flex items-center gap-1 sm:gap-2">
      {steps.map((step, idx) => {
        const isActive = currentStep === idx
        const isCompleted = completedSteps.includes(idx)
        const StepIcon = step.icon
        return (
          <React.Fragment key={idx}>
            <div className={`flex items-center gap-1.5 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg transition-all duration-200 ${isActive ? 'bg-primary text-primary-foreground shadow-md' : isCompleted ? 'bg-accent text-foreground' : 'text-muted-foreground'}`}>
              <div className={`flex items-center justify-center w-5 h-5 sm:w-6 sm:h-6 rounded-full text-xs font-medium ${isActive ? 'bg-primary-foreground text-primary' : isCompleted ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground'}`}>
                {isCompleted ? <Check className="w-3 h-3" /> : <StepIcon className="w-3 h-3" />}
              </div>
              <span className="text-xs sm:text-sm font-medium hidden md:inline">{step.label}</span>
            </div>
            {idx < steps.length - 1 && (
              <ChevronRight className={`w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0 ${isCompleted ? 'text-foreground' : 'text-muted-foreground/40'}`} />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}

// ─── Stat Card ───────────────────────────────────────────────────────────────
function StatCard({ label, value, icon, variant }: { label: string; value: number | string; icon: React.ReactNode; variant?: 'default' | 'success' | 'danger' | 'warning' }) {
  const variantClasses: Record<string, string> = {
    default: 'border-border',
    success: 'border-green-200 bg-green-50/50',
    danger: 'border-red-200 bg-red-50/50',
    warning: 'border-amber-200 bg-amber-50/50',
  }
  return (
    <Card className={`${variantClasses[variant ?? 'default']} backdrop-blur-md bg-white/75 shadow-md`}>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`p-2 rounded-lg ${variant === 'success' ? 'bg-green-100 text-green-700' : variant === 'danger' ? 'bg-red-100 text-red-700' : variant === 'warning' ? 'bg-amber-100 text-amber-700' : 'bg-muted text-muted-foreground'}`}>
          {icon}
        </div>
        <div>
          <p className="text-2xl font-semibold tracking-tight">{value}</p>
          <p className="text-xs text-muted-foreground font-medium">{label}</p>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Glass Card Wrapper ──────────────────────────────────────────────────────
function GlassCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <Card className={`backdrop-blur-md bg-white/75 border border-white/20 shadow-md ${className ?? ''}`}>
      {children}
    </Card>
  )
}

// ─── Status Badge ────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const s = (status ?? '').toLowerCase()
  if (s === 'valid' || s === 'generated' || s === 'sent') {
    return <Badge className="bg-green-100 text-green-800 hover:bg-green-100 border-green-200"><CheckCircle className="w-3 h-3 mr-1" />{status}</Badge>
  }
  if (s === 'invalid' || s === 'failed') {
    return <Badge className="bg-red-100 text-red-800 hover:bg-red-100 border-red-200"><XCircle className="w-3 h-3 mr-1" />{status}</Badge>
  }
  if (s === 'retrying' || s === 'pending') {
    return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 border-amber-200"><RefreshCw className="w-3 h-3 mr-1" />{status}</Badge>
  }
  return <Badge variant="outline">{status ?? 'Unknown'}</Badge>
}

// ─── Loading Table Skeleton ──────────────────────────────────────────────────
function TableSkeleton({ rows, cols }: { rows: number; cols: number }) {
  return (
    <div className="space-y-3 p-4">
      <div className="flex gap-4">
        {Array.from({ length: cols }).map((_, c) => (
          <Skeleton key={c} className="h-4 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className="h-6 flex-1" />
          ))}
        </div>
      ))}
    </div>
  )
}

// ─── Certificate Preview Card ────────────────────────────────────────────────
function CertificatePreview({ cert, onDownload }: { cert: CertificateEntry; onDownload?: (cert: CertificateEntry) => void }) {
  return (
    <div className="relative border border-border rounded-xl overflow-hidden bg-white shadow-md">
      {/* Certificate visual */}
      <div className="p-1">
        <div className="border-2 border-foreground/15 rounded-lg">
          <div className="border border-foreground/8 rounded-md m-1">
            {/* Header band */}
            <div className="bg-foreground text-primary-foreground py-3 px-4 text-center">
              <p className="text-[10px] font-semibold tracking-[3px] uppercase">Certificate of Completion</p>
            </div>
            {/* Body */}
            <div className="px-6 py-5 text-center space-y-2">
              <p className="text-[10px] text-muted-foreground">This is to certify that</p>
              <p className="text-base font-semibold tracking-tight">{cert?.participant_name ?? 'Participant'}</p>
              <div className="w-16 h-[1.5px] bg-foreground/20 mx-auto" />
              <p className="text-[10px] text-muted-foreground">has successfully completed</p>
              <p className="text-sm font-semibold">{cert?.course ?? 'Course'}</p>
              <p className="text-[10px] text-muted-foreground">Completed on: {cert?.date ?? '-'}</p>
              {/* Certificate ID box */}
              <div className="mt-3 bg-muted/50 rounded-md py-2 px-3 inline-block">
                <p className="text-[9px] text-muted-foreground">Certificate ID</p>
                <p className="text-[11px] font-mono font-medium">{cert?.certificate_id ?? ''}</p>
              </div>
            </div>
            {/* Footer */}
            <div className="border-t border-border/50 py-2 text-center">
              <p className="text-[8px] text-muted-foreground/60">Powered by CertifyFlow</p>
            </div>
          </div>
        </div>
      </div>
      {/* Download button overlay */}
      {cert?.pdf_base64 && onDownload && (
        <button
          onClick={() => onDownload(cert)}
          className="absolute top-2 right-2 p-1.5 bg-foreground text-primary-foreground rounded-md shadow-sm hover:bg-foreground/80 transition-colors"
          title="Download PDF"
        >
          <Download className="w-3.5 h-3.5" />
        </button>
      )}
      {cert?.pdf_base64 && (
        <div className="absolute bottom-1 right-2">
          <Badge className="bg-green-100 text-green-800 border-green-200 text-[9px] px-1.5 py-0">PDF Ready</Badge>
        </div>
      )}
    </div>
  )
}

// ─── Agent Info Panel ────────────────────────────────────────────────────────
function AgentInfoPanel({ activeAgentId }: { activeAgentId: string | null }) {
  const agents = [
    { id: DATA_VALIDATION_AGENT_ID, name: 'Data Validation Agent', purpose: 'Validates participant data and checks for errors' },
    { id: CERTIFICATE_GENERATION_AGENT_ID, name: 'Certificate Generation Agent', purpose: 'Creates personalized certificates from templates' },
    { id: EMAIL_DISPATCH_AGENT_ID, name: 'Email Dispatch Agent', purpose: 'Sends certificates via email to participants' },
  ]
  return (
    <GlassCard className="mt-8">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Info className="w-4 h-4 text-muted-foreground" />
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Agents Powering This App</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {agents.map(agent => {
            const isActive = activeAgentId === agent.id
            return (
              <div key={agent.id} className={`flex items-start gap-2 p-2.5 rounded-lg transition-all duration-200 ${isActive ? 'bg-primary/5 ring-1 ring-primary/20' : ''}`}>
                <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${isActive ? 'bg-green-500 animate-pulse' : 'bg-muted-foreground/30'}`} />
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate">{agent.name}</p>
                  <p className="text-[10px] text-muted-foreground leading-tight">{agent.purpose}</p>
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </GlassCard>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function Page() {
  // Step state
  const [currentStep, setCurrentStep] = useState(0)
  const [completedSteps, setCompletedSteps] = useState<number[]>([])

  // Sample data toggle
  const [showSampleData, setShowSampleData] = useState(false)

  // File state
  const [excelFile, setExcelFile] = useState<File | null>(null)
  const [excelHeaders, setExcelHeaders] = useState<string[]>([])
  const [excelData, setExcelData] = useState<Record<string, string>[]>([])
  const [isDragging, setIsDragging] = useState(false)

  // Column mapping
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({
    Name: '', Email: '', Course: '', Date: '',
  })

  // Canva template
  const [canvaTemplateUrl, setCanvaTemplateUrl] = useState('')

  // Agent results
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null)
  const [generationResult, setGenerationResult] = useState<GenerationResult | null>(null)
  const [dispatchResult, setDispatchResult] = useState<DispatchResult | null>(null)

  // Loading states
  const [isValidating, setIsValidating] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isDispatching, setIsDispatching] = useState(false)

  // Progress bar for generation
  const [generationProgress, setGenerationProgress] = useState(0)

  // Email template
  const [emailSubject, setEmailSubject] = useState('Your {{course}} Certificate of Completion')
  const [emailBody, setEmailBody] = useState('Dear {{name}},\n\nCongratulations on completing {{course}}!\n\nHere are your certificate details:\n\n-------------------------------\nCERTIFICATE OF COMPLETION\n-------------------------------\nRecipient: {{name}}\nCourse: {{course}}\nDate: {{date}}\nCertificate ID: {{certificate_id}}\n-------------------------------\n\nPlease keep this email for your records. Your Certificate ID can be used for verification purposes.\n\nBest regards,\nCertifyFlow')

  // Errors
  const [errorMessage, setErrorMessage] = useState('')

  // Active agent tracking
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null)

  // File input ref
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Progress interval ref
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Effective data based on sample toggle
  const effectiveHeaders = showSampleData && excelHeaders.length === 0 ? SAMPLE_CSV_HEADERS : excelHeaders
  const effectiveData = showSampleData && excelData.length === 0 ? SAMPLE_CSV_ROWS : excelData
  const effectiveValidation = showSampleData && !validationResult ? SAMPLE_VALIDATION : validationResult
  const effectiveGeneration = showSampleData && !generationResult ? SAMPLE_GENERATION : generationResult
  const effectiveDispatch = showSampleData && !dispatchResult ? SAMPLE_DISPATCH : dispatchResult
  const effectiveFile = showSampleData && !excelFile ? { name: 'sample_participants.csv' } as File : excelFile

  // Auto-map columns when sample data is shown
  useEffect(() => {
    if (showSampleData && excelHeaders.length === 0) {
      const autoMap: Record<string, string> = {}
      CERTIFICATE_FIELDS.forEach(field => {
        const match = SAMPLE_CSV_HEADERS.find(h => h.toLowerCase() === field.toLowerCase())
        if (match) autoMap[field] = match
      })
      setColumnMapping(autoMap)
    }
  }, [showSampleData, excelHeaders.length])

  // ─── File Handling ─────────────────────────────────────────────────────
  const handleFile = useCallback((file: File) => {
    setExcelFile(file)
    setErrorMessage('')
    setValidationResult(null)
    const extension = file.name.split('.').pop()?.toLowerCase()
    if (extension === 'csv') {
      const reader = new FileReader()
      reader.onload = (e) => {
        const text = e.target?.result as string
        if (!text) return
        const { headers, rows } = parseCSV(text)
        setExcelHeaders(headers)
        setExcelData(rows)
        const autoMap: Record<string, string> = {}
        CERTIFICATE_FIELDS.forEach(field => {
          const match = headers.find(h => h.toLowerCase().includes(field.toLowerCase()))
          if (match) autoMap[field] = match
        })
        setColumnMapping(prev => ({ ...prev, ...autoMap }))
      }
      reader.readAsText(file)
    } else if (extension === 'xlsx' || extension === 'xls') {
      setExcelHeaders([])
      setExcelData([])
      setErrorMessage('XLSX detected. The file will be sent directly to the validation agent for processing. For client-side preview, please use CSV format.')
    } else {
      setErrorMessage('Please upload a .csv or .xlsx file.')
    }
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }, [handleFile])

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const onDragLeave = useCallback(() => {
    setIsDragging(false)
  }, [])

  const onFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }, [handleFile])

  // ─── Validation Agent Call ─────────────────────────────────────────────
  const handleValidate = async () => {
    setIsValidating(true)
    setErrorMessage('')
    setActiveAgentId(DATA_VALIDATION_AGENT_ID)
    try {
      const dataToValidate = effectiveData.map(row => {
        const mapped: Record<string, string> = {}
        CERTIFICATE_FIELDS.forEach(field => {
          const col = columnMapping[field]
          if (col) mapped[field.toLowerCase()] = row[col] ?? ''
        })
        return mapped
      })

      let assetIds: string[] = []
      if (excelFile) {
        const uploadResult = await uploadFiles(excelFile)
        if (uploadResult?.success && Array.isArray(uploadResult.asset_ids)) {
          assetIds = uploadResult.asset_ids
        }
      }

      const message = JSON.stringify({
        action: 'validate',
        participants: dataToValidate,
        column_mapping: columnMapping,
      })

      const result = await callAIAgent(message, DATA_VALIDATION_AGENT_ID, assetIds.length > 0 ? { assets: assetIds } : undefined)

      if (result?.success) {
        const parsed = parseAgentResponse<ValidationResult>(result)
        setValidationResult(parsed)
      } else {
        setErrorMessage(result?.error ?? result?.response?.message ?? 'Validation failed. Please try again.')
      }
    } catch (err: any) {
      setErrorMessage(err?.message ?? 'An error occurred during validation.')
    } finally {
      setIsValidating(false)
      setActiveAgentId(null)
    }
  }

  // ─── Generation Agent Call ─────────────────────────────────────────────
  const handleGenerate = async () => {
    setIsGenerating(true)
    setErrorMessage('')
    setGenerationProgress(0)
    setActiveAgentId(CERTIFICATE_GENERATION_AGENT_ID)

    progressIntervalRef.current = setInterval(() => {
      setGenerationProgress(prev => {
        if (prev >= 90) return prev
        return prev + Math.random() * 12
      })
    }, 500)

    try {
      const validRows = Array.isArray(effectiveValidation?.rows) ? effectiveValidation.rows.filter(r => r?.status === 'valid') : []
      const message = JSON.stringify({
        action: 'generate_certificates',
        template_url: canvaTemplateUrl || 'default-template',
        participants: validRows.map(r => ({
          name: r?.name ?? '', email: r?.email ?? '', course: r?.course ?? '',
          date: r?.date ?? '',
        })),
      })

      const result = await callAIAgent(message, CERTIFICATE_GENERATION_AGENT_ID)

      if (result?.success) {
        const parsed = parseAgentResponse<GenerationResult>(result)
        setGenerationProgress(70)

        // Now generate actual PDFs via our API route
        const generatedCerts = Array.isArray(parsed?.certificates) ? parsed.certificates.filter(c => c?.status === 'generated') : []
        if (generatedCerts.length > 0) {
          try {
            const pdfRes = await fetch('/api/generate-certificate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                participants: generatedCerts.map(c => ({
                  name: c.participant_name,
                  email: c.email,
                  course: c.course,
                  date: c.date,
                  certificate_id: c.certificate_id,
                })),
              }),
            })
            const pdfData = await pdfRes.json()
            if (pdfData?.success && Array.isArray(pdfData.certificates)) {
              // Merge PDF data back into certificates
              const updatedCerts = parsed.certificates.map(cert => {
                const pdfMatch = pdfData.certificates.find((p: any) => p.certificate_id === cert.certificate_id || p.email === cert.email)
                if (pdfMatch) {
                  return { ...cert, pdf_base64: pdfMatch.pdf_base64, filename: pdfMatch.filename }
                }
                return cert
              })
              parsed.certificates = updatedCerts
            }
          } catch (pdfErr) {
            // PDF generation failed but certificates were still generated
            console.error('PDF generation error:', pdfErr)
          }
        }

        setGenerationResult(parsed)
        setGenerationProgress(100)
      } else {
        setErrorMessage(result?.error ?? result?.response?.message ?? 'Certificate generation failed.')
      }
    } catch (err: any) {
      setErrorMessage(err?.message ?? 'An error occurred during generation.')
    } finally {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current)
        progressIntervalRef.current = null
      }
      setIsGenerating(false)
      setActiveAgentId(null)
    }
  }

  // ─── Download PDF ──────────────────────────────────────────────────────
  const downloadPDF = (cert: CertificateEntry) => {
    if (!cert.pdf_base64) return
    const byteCharacters = atob(cert.pdf_base64)
    const byteNumbers = new Array(byteCharacters.length)
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i)
    }
    const byteArray = new Uint8Array(byteNumbers)
    const blob = new Blob([byteArray], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = cert.filename || `Certificate_${cert.participant_name}.pdf`
    a.click()
    URL.revokeObjectURL(url)
  }

  const downloadAllPDFs = () => {
    const certs = Array.isArray(effectiveGeneration?.certificates) ? effectiveGeneration.certificates : []
    certs.filter(c => c.pdf_base64).forEach((cert, idx) => {
      setTimeout(() => downloadPDF(cert), idx * 300)
    })
  }

  // ─── Dispatch Agent Call ───────────────────────────────────────────────
  const handleDispatch = async (retryOnly?: boolean) => {
    setIsDispatching(true)
    setErrorMessage('')
    setActiveAgentId(EMAIL_DISPATCH_AGENT_ID)
    try {
      const certs = Array.isArray(effectiveGeneration?.certificates) ? effectiveGeneration.certificates : []
      const mapCert = (c: CertificateEntry) => ({
        name: c?.participant_name ?? '',
        email: c?.email ?? '',
        course: c?.course ?? '',
        date: c?.date ?? '',
        certificate_id: c?.certificate_id ?? '',
      })

      let participants: ReturnType<typeof mapCert>[]

      if (retryOnly && effectiveDispatch) {
        const failedEmails = Array.isArray(effectiveDispatch?.deliveries)
          ? effectiveDispatch.deliveries.filter(d => d?.status === 'failed').map(d => d?.email)
          : []
        participants = certs
          .filter(c => c?.status === 'generated' && failedEmails.includes(c?.email))
          .map(mapCert)
      } else {
        participants = certs
          .filter(c => c?.status === 'generated')
          .map(mapCert)
      }

      const message = JSON.stringify({
        action: 'send_certificates',
        email_subject: emailSubject,
        email_body_template: emailBody,
        email_format_instructions: 'Send each email as HTML using GMAIL_SEND_EMAIL. The message_body MUST be a rich HTML email with inline CSS styling. Include: (1) A professional header banner with "Certificate of Completion" in white text on a dark background, (2) A greeting with the participant name, (3) A congratulations message about completing the course, (4) A visually styled certificate card section with a border showing: participant Name, Course name, Completion Date, and Certificate ID in a clean layout, (5) A note that this email serves as official certification, (6) A professional closing from CertifyFlow. Use inline CSS to make it look like a real certificate in the email. Do NOT attempt to attach any files or PDFs.',
        participants,
      })

      const result = await callAIAgent(message, EMAIL_DISPATCH_AGENT_ID)

      if (result?.success) {
        const parsed = parseAgentResponse<DispatchResult>(result)
        setDispatchResult(parsed)
      } else {
        setErrorMessage(result?.error ?? result?.response?.message ?? 'Email dispatch failed.')
      }
    } catch (err: any) {
      setErrorMessage(err?.message ?? 'An error occurred during dispatch.')
    } finally {
      setIsDispatching(false)
      setActiveAgentId(null)
    }
  }

  // ─── Step Navigation ───────────────────────────────────────────────────
  const goToStep = (step: number) => {
    setErrorMessage('')
    setCurrentStep(step)
  }

  const completeStepAndAdvance = (step: number) => {
    if (!completedSteps.includes(step)) {
      setCompletedSteps(prev => [...prev, step])
    }
    goToStep(step + 1)
  }

  // ─── Derived values ────────────────────────────────────────────────────
  const validCount = effectiveValidation?.valid_count ?? 0
  const invalidCount = effectiveValidation?.invalid_count ?? 0
  const totalRows = effectiveValidation?.total_rows ?? 0
  const generatedCount = effectiveGeneration?.generated ?? 0
  const failedGenCount = effectiveGeneration?.failed ?? 0
  const sentCount = effectiveDispatch?.total_sent ?? 0
  const failedDispCount = effectiveDispatch?.total_failed ?? 0
  const retriedCount = effectiveDispatch?.total_retried ?? 0
  const hasFailedDeliveries = failedDispCount > 0

  const validationRows = Array.isArray(effectiveValidation?.rows) ? effectiveValidation.rows : []
  const certRows = Array.isArray(effectiveGeneration?.certificates) ? effectiveGeneration.certificates : []
  const deliveryRows = Array.isArray(effectiveDispatch?.deliveries) ? effectiveDispatch.deliveries : []

  // ─── Render ────────────────────────────────────────────────────────────
  return (
    <InlineErrorBoundary>
      <div className="min-h-screen bg-gradient-to-br from-white via-slate-50/80 to-white text-foreground">
        {/* Header */}
        <header className="sticky top-0 z-50 backdrop-blur-xl bg-white/80 border-b border-border/50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 flex-shrink-0">
              <Award className="w-5 h-5 sm:w-6 sm:h-6 text-foreground" />
              <h1 className="text-lg sm:text-xl font-semibold tracking-tight">CertifyFlow</h1>
            </div>
            <StepIndicator currentStep={currentStep} completedSteps={completedSteps} />
            <div className="flex items-center gap-2 flex-shrink-0">
              <Label htmlFor="sample-toggle" className="text-xs text-muted-foreground hidden sm:inline">Sample Data</Label>
              <Switch id="sample-toggle" checked={showSampleData} onCheckedChange={setShowSampleData} />
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          {/* Error Banner */}
          {errorMessage && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-red-800 font-medium">Error</p>
                <p className="text-sm text-red-700 break-words">{errorMessage}</p>
              </div>
              <button onClick={() => setErrorMessage('')} className="text-red-400 hover:text-red-600 flex-shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* ═══ STEP 0: Upload & Configure ═══ */}
          {currentStep === 0 && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left Column */}
                <div className="space-y-6">
                  {/* File Upload Dropzone */}
                  <GlassCard>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Upload className="w-4 h-4" />
                        Upload Participant Data
                      </CardTitle>
                      <CardDescription className="text-xs">Drag and drop a .csv or .xlsx file, or click to browse</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div
                        onDrop={onDrop}
                        onDragOver={onDragOver}
                        onDragLeave={onDragLeave}
                        onClick={() => fileInputRef.current?.click()}
                        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200 ${isDragging ? 'border-primary bg-primary/5' : effectiveFile ? 'border-green-300 bg-green-50/50' : 'border-border hover:border-primary/40 hover:bg-muted/30'}`}
                      >
                        <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" onChange={onFileSelect} className="hidden" />
                        {effectiveFile ? (
                          <div className="space-y-2">
                            <FileIcon className="w-8 h-8 mx-auto text-green-600" />
                            <p className="text-sm font-medium">{effectiveFile?.name ?? 'File uploaded'}</p>
                            <p className="text-xs text-muted-foreground">{effectiveData.length} rows detected</p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <Upload className="w-8 h-8 mx-auto text-muted-foreground/50" />
                            <p className="text-sm text-muted-foreground">Drop your file here or click to browse</p>
                            <p className="text-xs text-muted-foreground/60">Supports .csv and .xlsx files</p>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </GlassCard>

                  {/* Canva Template Input */}
                  <GlassCard>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        Certificate Template
                      </CardTitle>
                      <CardDescription className="text-xs">Provide your Canva template URL or design ID</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <Label htmlFor="canva-url" className="text-xs font-medium">Template URL / ID</Label>
                        <Input
                          id="canva-url"
                          placeholder="https://www.canva.com/design/..."
                          value={canvaTemplateUrl}
                          onChange={(e) => setCanvaTemplateUrl(e.target.value)}
                        />
                      </div>
                    </CardContent>
                  </GlassCard>
                </div>

                {/* Right Column -- Column Mapping */}
                <GlassCard>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      Column Mapping
                    </CardTitle>
                    <CardDescription className="text-xs">Map your file columns to certificate fields</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {effectiveHeaders.length > 0 ? (
                      <div className="space-y-4">
                        {CERTIFICATE_FIELDS.map(field => (
                          <div key={field} className="flex items-center gap-3">
                            <Label className="text-sm w-24 flex-shrink-0 font-medium">{field}</Label>
                            <ArrowRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                            <Select
                              value={columnMapping[field] || '___none___'}
                              onValueChange={(val) => setColumnMapping(prev => ({ ...prev, [field]: val === '___none___' ? '' : val }))}
                            >
                              <SelectTrigger className="flex-1">
                                <SelectValue placeholder="Select column" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="___none___">-- Select column --</SelectItem>
                                {effectiveHeaders.map(header => (
                                  <SelectItem key={header} value={header}>{header}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <FileIcon className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        <p className="text-sm">Upload a file to see column headers</p>
                        <p className="text-xs mt-1 opacity-60">Or enable Sample Data to preview</p>
                      </div>
                    )}
                  </CardContent>
                </GlassCard>
              </div>

              {/* Data Preview Table */}
              {effectiveData.length > 0 && (
                <GlassCard>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Data Preview</CardTitle>
                    <CardDescription className="text-xs">First {Math.min(effectiveData.length, 5)} rows of your uploaded data</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="w-full">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs w-10">#</TableHead>
                            {effectiveHeaders.map(h => (
                              <TableHead key={h} className="text-xs">{h}</TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {effectiveData.slice(0, 5).map((row, idx) => (
                            <TableRow key={idx}>
                              <TableCell className="text-xs text-muted-foreground">{idx + 1}</TableCell>
                              {effectiveHeaders.map(h => (
                                <TableCell key={h} className="text-xs">{row[h] ?? ''}</TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  </CardContent>
                </GlassCard>
              )}

              {/* Validate Button */}
              <div className="flex justify-center">
                <Button
                  size="lg"
                  onClick={handleValidate}
                  disabled={isValidating || (effectiveData.length === 0 && !excelFile)}
                  className="px-8 gap-2 shadow-md"
                >
                  {isValidating ? (
                    <><RefreshCw className="w-4 h-4 animate-spin" /> Validating...</>
                  ) : (
                    <><Check className="w-4 h-4" /> Validate &amp; Preview</>
                  )}
                </Button>
              </div>

              {/* Validation Loading Skeleton */}
              {isValidating && (
                <GlassCard>
                  <CardContent className="p-0">
                    <TableSkeleton rows={5} cols={5} />
                  </CardContent>
                </GlassCard>
              )}

              {/* Validation Results */}
              {effectiveValidation && !isValidating && (
                <div className="space-y-6">
                  {/* Summary Stats */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <StatCard label="Total Rows" value={totalRows} icon={<Users className="w-5 h-5" />} />
                    <StatCard label="Valid" value={validCount} icon={<CheckCircle className="w-5 h-5" />} variant="success" />
                    <StatCard label="Invalid" value={invalidCount} icon={<XCircle className="w-5 h-5" />} variant={invalidCount > 0 ? 'danger' : 'default'} />
                  </div>

                  {/* Validation Table */}
                  <GlassCard>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Validation Report</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ScrollArea className="w-full">
                        <div className="max-h-[400px] overflow-y-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-xs">Row</TableHead>
                                <TableHead className="text-xs">Name</TableHead>
                                <TableHead className="text-xs">Email</TableHead>
                                <TableHead className="text-xs">Course</TableHead>
                                <TableHead className="text-xs">Date</TableHead>
                                <TableHead className="text-xs">Status</TableHead>
                                <TableHead className="text-xs">Issues</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {validationRows.map((row, idx) => (
                                <TableRow key={idx} className={row?.status === 'invalid' ? 'bg-red-50/50' : ''}>
                                  <TableCell className="text-xs text-muted-foreground">{row?.row_number ?? idx + 1}</TableCell>
                                  <TableCell className="text-xs font-medium">{row?.name ?? ''}</TableCell>
                                  <TableCell className="text-xs">{row?.email ?? ''}</TableCell>
                                  <TableCell className="text-xs">{row?.course ?? ''}</TableCell>
                                  <TableCell className="text-xs">{row?.date ?? ''}</TableCell>
                                  <TableCell><StatusBadge status={row?.status ?? 'unknown'} /></TableCell>
                                  <TableCell className="text-xs text-red-600 max-w-[200px]">
                                    {Array.isArray(row?.issues) && row.issues.length > 0 ? row.issues.join('; ') : '-'}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </ScrollArea>
                    </CardContent>
                  </GlassCard>

                  {/* Advance to Step 2 */}
                  {validCount > 0 && (
                    <div className="flex justify-center">
                      <Button
                        size="lg"
                        onClick={() => completeStepAndAdvance(0)}
                        className="px-8 gap-2 shadow-md"
                      >
                        <ArrowRight className="w-4 h-4" />
                        Proceed to Generate ({validCount} valid)
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ═══ STEP 1: Certificate Generation ═══ */}
          {currentStep === 1 && (
            <div className="space-y-6">
              {/* Summary Cards */}
              {effectiveGeneration ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <StatCard label="Total" value={effectiveGeneration?.total ?? 0} icon={<FileText className="w-5 h-5" />} />
                  <StatCard label="Generated" value={generatedCount} icon={<CheckCircle className="w-5 h-5" />} variant="success" />
                  <StatCard label="Failed" value={failedGenCount} icon={<XCircle className="w-5 h-5" />} variant={failedGenCount > 0 ? 'danger' : 'default'} />
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <StatCard label="Valid Participants" value={validCount} icon={<Users className="w-5 h-5" />} />
                  <StatCard label="Template" value={canvaTemplateUrl ? 'Custom' : 'Default'} icon={<FileText className="w-5 h-5" />} />
                  <StatCard label="Status" value="Ready" icon={<Clock className="w-5 h-5" />} variant="warning" />
                </div>
              )}

              {/* Generate Button & Progress */}
              {!effectiveGeneration && (
                <GlassCard>
                  <CardContent className="p-6 sm:p-8 text-center space-y-4">
                    <Award className="w-12 h-12 mx-auto text-muted-foreground/40" />
                    <div>
                      <h3 className="text-lg font-semibold mb-1">Ready to Generate Certificates</h3>
                      <p className="text-sm text-muted-foreground">{validCount} valid participants will receive personalized certificates</p>
                    </div>
                    <Button
                      size="lg"
                      onClick={handleGenerate}
                      disabled={isGenerating}
                      className="px-8 gap-2 shadow-md"
                    >
                      {isGenerating ? (
                        <><RefreshCw className="w-4 h-4 animate-spin" /> Generating...</>
                      ) : (
                        <><FileText className="w-4 h-4" /> Generate Certificates</>
                      )}
                    </Button>
                    {isGenerating && (
                      <div className="max-w-md mx-auto space-y-2">
                        <Progress value={generationProgress} className="h-2" />
                        <p className="text-xs text-muted-foreground">{Math.round(generationProgress)}% complete</p>
                      </div>
                    )}
                  </CardContent>
                </GlassCard>
              )}

              {/* Loading State */}
              {isGenerating && !effectiveGeneration && (
                <GlassCard>
                  <CardContent className="p-0">
                    <TableSkeleton rows={4} cols={5} />
                  </CardContent>
                </GlassCard>
              )}

              {/* Generation Results */}
              {effectiveGeneration && !isGenerating && (
                <div className="space-y-6">
                  {/* Certificate Preview Cards */}
                  <GlassCard>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-base">Certificate Previews</CardTitle>
                          <CardDescription className="text-xs">Generated PDF certificates -- click to download</CardDescription>
                        </div>
                        {certRows.some(c => c.pdf_base64) && (
                          <Button variant="outline" size="sm" onClick={downloadAllPDFs} className="gap-1 text-xs">
                            <Download className="w-3 h-3" />
                            Download All PDFs
                          </Button>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {certRows.slice(0, 3).map((cert, idx) => (
                          <CertificatePreview key={idx} cert={cert} onDownload={downloadPDF} />
                        ))}
                      </div>
                    </CardContent>
                  </GlassCard>

                  {/* Status Table */}
                  <GlassCard>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Generation Status</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ScrollArea className="w-full">
                        <div className="max-h-[400px] overflow-y-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-xs">Participant</TableHead>
                                <TableHead className="text-xs">Email</TableHead>
                                <TableHead className="text-xs">Course</TableHead>
                                <TableHead className="text-xs">Date</TableHead>
                                <TableHead className="text-xs">Certificate ID</TableHead>
                                <TableHead className="text-xs">Status</TableHead>
                                <TableHead className="text-xs">PDF</TableHead>
                                <TableHead className="text-xs">Error</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {certRows.map((cert, idx) => (
                                <TableRow key={idx} className={cert?.status === 'failed' ? 'bg-red-50/50' : ''}>
                                  <TableCell className="text-xs font-medium">{cert?.participant_name ?? ''}</TableCell>
                                  <TableCell className="text-xs">{cert?.email ?? ''}</TableCell>
                                  <TableCell className="text-xs">{cert?.course ?? ''}</TableCell>
                                  <TableCell className="text-xs">{cert?.date ?? ''}</TableCell>
                                  <TableCell className="text-xs font-mono text-muted-foreground">{cert?.certificate_id ?? '-'}</TableCell>
                                  <TableCell><StatusBadge status={cert?.status ?? 'unknown'} /></TableCell>
                                  <TableCell>
                                    {cert?.pdf_base64 ? (
                                      <button onClick={() => downloadPDF(cert)} className="text-xs text-primary hover:underline flex items-center gap-1">
                                        <Download className="w-3 h-3" /> PDF
                                      </button>
                                    ) : (
                                      <span className="text-xs text-muted-foreground">-</span>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-xs text-red-600 max-w-[200px]">{cert?.error_message || '-'}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </ScrollArea>
                    </CardContent>
                  </GlassCard>

                  {/* Advance to Step 3 */}
                  {generatedCount > 0 && (
                    <div className="flex justify-center">
                      <Button
                        size="lg"
                        onClick={() => completeStepAndAdvance(1)}
                        className="px-8 gap-2 shadow-md"
                      >
                        <Send className="w-4 h-4" />
                        Send Certificates ({generatedCount})
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* Back button */}
              <div className="flex justify-start">
                <Button variant="outline" onClick={() => goToStep(0)} className="gap-2 text-sm">
                  Back to Upload
                </Button>
              </div>
            </div>
          )}

          {/* ═══ STEP 2: Dispatch & Logs ═══ */}
          {currentStep === 2 && (
            <div className="space-y-6">
              {/* Summary Cards */}
              {effectiveDispatch ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <StatCard label="Sent" value={sentCount} icon={<CheckCircle className="w-5 h-5" />} variant="success" />
                  <StatCard label="Failed" value={failedDispCount} icon={<XCircle className="w-5 h-5" />} variant={failedDispCount > 0 ? 'danger' : 'default'} />
                  <StatCard label="Retried" value={retriedCount} icon={<RefreshCw className="w-5 h-5" />} variant={retriedCount > 0 ? 'warning' : 'default'} />
                  <StatCard label="Pending" value={Math.max(0, generatedCount - sentCount - failedDispCount)} icon={<Clock className="w-5 h-5" />} />
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <StatCard label="Certificates Ready" value={generatedCount} icon={<Award className="w-5 h-5" />} variant="success" />
                  <StatCard label="Recipients" value={generatedCount} icon={<Mail className="w-5 h-5" />} />
                  <StatCard label="Status" value="Ready" icon={<Clock className="w-5 h-5" />} variant="warning" />
                </div>
              )}

              {/* Email Template Form */}
              <GlassCard>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Mail className="w-4 h-4" />
                    Email Template
                  </CardTitle>
                  <CardDescription className="text-xs">Configure the email content for certificate delivery. Use placeholders: {'{{name}}'}, {'{{course}}'}, {'{{date}}'}, {'{{certificate_id}}'}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email-subject" className="text-xs font-medium">Subject Line *</Label>
                    <Input
                      id="email-subject"
                      placeholder="Your {{course}} Certificate is Ready"
                      value={emailSubject}
                      onChange={(e) => setEmailSubject(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email-body" className="text-xs font-medium">Email Body *</Label>
                    <Textarea
                      id="email-body"
                      value={emailBody}
                      onChange={(e) => setEmailBody(e.target.value)}
                      rows={6}
                      className="font-mono text-xs"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="text-xs font-mono">{'{{name}}'}</Badge>
                    <Badge variant="outline" className="text-xs font-mono">{'{{course}}'}</Badge>
                    <Badge variant="outline" className="text-xs font-mono">{'{{date}}'}</Badge>
                    <Badge variant="outline" className="text-xs font-mono">{'{{certificate_id}}'}</Badge>
                  </div>
                </CardContent>
              </GlassCard>

              {/* Send Button */}
              {!effectiveDispatch && (
                <div className="flex justify-center">
                  <Button
                    size="lg"
                    onClick={() => handleDispatch(false)}
                    disabled={isDispatching || !emailSubject.trim() || !emailBody.trim()}
                    className="px-8 gap-2 shadow-md"
                  >
                    {isDispatching ? (
                      <><RefreshCw className="w-4 h-4 animate-spin" /> Sending...</>
                    ) : (
                      <><Send className="w-4 h-4" /> Send All Certificates</>
                    )}
                  </Button>
                </div>
              )}

              {/* Loading State */}
              {isDispatching && (
                <GlassCard>
                  <CardContent className="p-0">
                    <TableSkeleton rows={4} cols={5} />
                  </CardContent>
                </GlassCard>
              )}

              {/* Dispatch Results */}
              {effectiveDispatch && !isDispatching && (
                <div className="space-y-6">
                  {/* Completion Banner */}
                  <div className="p-4 bg-green-50/80 border border-green-200 rounded-xl flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-green-800">Dispatch Complete</p>
                      <p className="text-xs text-green-700">{sentCount} emails sent successfully{failedDispCount > 0 ? `, ${failedDispCount} failed` : ''}</p>
                    </div>
                  </div>

                  {/* Dispatch Log Table */}
                  <GlassCard>
                    <CardHeader className="pb-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <CardTitle className="text-base">Dispatch Log</CardTitle>
                          <CardDescription className="text-xs">Detailed delivery status for each participant</CardDescription>
                        </div>
                        <div className="flex gap-2">
                          {hasFailedDeliveries && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDispatch(true)}
                              disabled={isDispatching}
                              className="gap-1 text-xs"
                            >
                              <RefreshCw className="w-3 h-3" />
                              Retry Failed
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => exportToCSV(deliveryRows.map(d => ({
                              Name: d?.participant_name ?? '',
                              Email: d?.email ?? '',
                              Status: d?.status ?? '',
                              Attempts: d?.attempts ?? 0,
                              Timestamp: d?.timestamp ?? '',
                              Error: d?.error_message ?? '',
                            })), 'certifyflow_dispatch_log.csv')}
                            className="gap-1 text-xs"
                          >
                            <Download className="w-3 h-3" />
                            Export Log
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <ScrollArea className="w-full">
                        <div className="max-h-[400px] overflow-y-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-xs">Name</TableHead>
                                <TableHead className="text-xs">Email</TableHead>
                                <TableHead className="text-xs">Status</TableHead>
                                <TableHead className="text-xs">Attempts</TableHead>
                                <TableHead className="text-xs">Timestamp</TableHead>
                                <TableHead className="text-xs">Error</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {deliveryRows.map((delivery, idx) => (
                                <TableRow key={idx} className={delivery?.status === 'failed' ? 'bg-red-50/50' : ''}>
                                  <TableCell className="text-xs font-medium">{delivery?.participant_name ?? ''}</TableCell>
                                  <TableCell className="text-xs">{delivery?.email ?? ''}</TableCell>
                                  <TableCell><StatusBadge status={delivery?.status ?? 'unknown'} /></TableCell>
                                  <TableCell className="text-xs text-center">{delivery?.attempts ?? 0}</TableCell>
                                  <TableCell className="text-xs text-muted-foreground">
                                    {delivery?.timestamp ? new Date(delivery.timestamp).toLocaleString() : '-'}
                                  </TableCell>
                                  <TableCell className="text-xs text-red-600 max-w-[200px]">{delivery?.error_message || '-'}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </ScrollArea>
                    </CardContent>
                  </GlassCard>
                </div>
              )}

              {/* Back button */}
              <div className="flex justify-start">
                <Button variant="outline" onClick={() => goToStep(1)} className="gap-2 text-sm">
                  Back to Generation
                </Button>
              </div>
            </div>
          )}

          {/* Agent Info Panel */}
          <AgentInfoPanel activeAgentId={activeAgentId} />
        </main>
      </div>
    </InlineErrorBoundary>
  )
}
