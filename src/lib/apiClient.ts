import {
  HealthResponse,
  DocumentListResponse,
  DocumentDetailResponse,
  DocumentItem,
  RouteResponse,
  AskRequest,
  AskResponse,
  SummarizeRequest,
  SummarizeResponse,
  SimplifySummaryRequest,
  SimplifySummaryResponse,
  ExplainRequest,
  ExplainResponse,
  CompareRequest,
  CompareResponse,
  ConversationSession,
  sanitizeRawDocumentText,
} from './ragCore';
import {
  RadarAuditResponse,
  KnowledgeGraphResponse,
  StudyModuleResponse,
  DataExtractorResponse,
  PodcastEpisodeResponse,
  PodcastStyle,
  IndianVoicePreset,
  PodcastTurn,
} from './intelligenceSuite';

const rawEnvUrl =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) || '';

// Default to `/api` on same origin so both local dev and Cloud Run preview work out of the box
// with zero external backend deployment required.
let runtimeApiBaseUrl: string = rawEnvUrl ? rawEnvUrl.replace(/\/+$/, '') : '/api';

export function getActiveApiBaseUrl(): string {
  return runtimeApiBaseUrl;
}

export function setCustomApiBaseUrl(newUrl: string): void {
  const cleaned = newUrl.trim().replace(/\/+$/, '');
  runtimeApiBaseUrl = cleaned || '/api';
}

export function getResolvedApiOriginUrl(): string {
  if (runtimeApiBaseUrl.startsWith('http://') || runtimeApiBaseUrl.startsWith('https://')) {
    return runtimeApiBaseUrl;
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}${runtimeApiBaseUrl.startsWith('/') ? runtimeApiBaseUrl : `/${runtimeApiBaseUrl}`}`;
  }
  return runtimeApiBaseUrl;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function requestJson<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${runtimeApiBaseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.body instanceof FormData || options.body instanceof Blob
        ? {}
        : { 'Content-Type': 'application/json' }),
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    let errMsg = `Request failed with status ${response.status}`;
    try {
      const errData = await response.json();
      if (errData?.error) errMsg = errData.error;
      else if (errData?.detail) errMsg = String(errData.detail);
    } catch {
      // ignore JSON parse error on error body
    }
    throw new ApiError(errMsg, response.status);
  }

  return response.json() as Promise<T>;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return typeof btoa === 'function' ? btoa(binary) : '';
}

export const workspaceApi = {
  getHealth(signal?: AbortSignal): Promise<HealthResponse> {
    return requestJson<HealthResponse>('/health', { method: 'GET', signal });
  },

  routeQuery(query: string, signal?: AbortSignal): Promise<RouteResponse> {
    return requestJson<RouteResponse>('/route', {
      method: 'POST',
      body: JSON.stringify({ query }),
      signal,
    });
  },

  getDocuments(signal?: AbortSignal): Promise<DocumentListResponse> {
    return requestJson<DocumentListResponse>('/documents', { method: 'GET', signal });
  },

  getDocumentDetail(docId: string, signal?: AbortSignal): Promise<DocumentDetailResponse> {
    return requestJson<DocumentDetailResponse>(`/documents/${encodeURIComponent(docId)}`, {
      method: 'GET',
      signal,
    });
  },

  async uploadDocument(
    file: File,
    onProgress?: (percent: number) => void
  ): Promise<{
    status: string;
    message: string;
    document: DocumentItem;
    chunks_created: number;
  }> {
    onProgress?.(18);
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    let textContent = '';
    let fileBase64 = '';
    try {
      if (ext === 'txt' || ext === 'csv') {
        textContent = await file.text();
      } else {
        const buffer = await file.arrayBuffer();
        fileBase64 = arrayBufferToBase64(buffer);
        const decoder = new TextDecoder('latin1', { fatal: false });
        const rawText = decoder.decode(buffer);
        const sanitized = sanitizeRawDocumentText(rawText, file.name);
        textContent = sanitized;
      }
    } catch {
      textContent = `[Page 1]\n# 1.1 Indexed Document (${file.name})\nStructured document (${file.size} bytes).`;
    }

    onProgress?.(65);
    const result = await requestJson<{
      status: string;
      message: string;
      document: DocumentItem;
      chunks_created: number;
    }>('/index', {
      method: 'POST',
      body: JSON.stringify({
        filename: file.name,
        content: textContent,
        file_base64: fileBase64 || undefined,
        file_size_bytes: file.size,
      }),
    });
    onProgress?.(100);
    return result;
  },

  deleteDocument(docId: string): Promise<{
    status: string;
    doc_id: string;
    filename: string;
    chunks_removed: number;
  }> {
    return requestJson(`/documents/${encodeURIComponent(docId)}`, {
      method: 'DELETE',
    });
  },

  askQuestion(payload: AskRequest, signal?: AbortSignal): Promise<AskResponse> {
    return requestJson<AskResponse>('/ask', {
      method: 'POST',
      body: JSON.stringify(payload),
      signal,
    });
  },

  summarizeDocument(payload: SummarizeRequest, signal?: AbortSignal): Promise<SummarizeResponse> {
    return requestJson<SummarizeResponse>('/summarize', {
      method: 'POST',
      body: JSON.stringify(payload),
      signal,
    });
  },

  simplifySummary(
    payload: SimplifySummaryRequest,
    signal?: AbortSignal
  ): Promise<SimplifySummaryResponse> {
    return requestJson<SimplifySummaryResponse>('/summarize/simplify', {
      method: 'POST',
      body: JSON.stringify(payload),
      signal,
    });
  },

  explainConcept(payload: ExplainRequest, signal?: AbortSignal): Promise<ExplainResponse> {
    return requestJson<ExplainResponse>('/explain', {
      method: 'POST',
      body: JSON.stringify(payload),
      signal,
    });
  },

  compareDocuments(payload: CompareRequest, signal?: AbortSignal): Promise<CompareResponse> {
    return requestJson<CompareResponse>('/compare', {
      method: 'POST',
      body: JSON.stringify(payload),
      signal,
    });
  },

  getSessions(signal?: AbortSignal): Promise<{ sessions: ConversationSession[] }> {
    return requestJson<{ sessions: ConversationSession[] }>('/sessions', {
      method: 'GET',
      signal,
    });
  },

  deleteSession(sessionId: string): Promise<{ status: string; session_id: string }> {
    return requestJson(`/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
    });
  },

  generateNanoBananaImage(payload: {
    prompt: string;
    aspect_ratio?: string;
  }): Promise<{
    status: string;
    model: string;
    prompt: string;
    image_url: string;
    latency_ms: number;
  }> {
    return requestJson('/media/nano-banana', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  generateOmniMotionLoop(payload: {
    prompt: string;
    preset?: string;
  }): Promise<{
    status: string;
    model: string;
    prompt: string;
    video_url: string | null;
    preset: string;
    latency_ms: number;
  }> {
    return requestJson('/media/omni-video', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  getRadarAudit(docId?: string | null): Promise<RadarAuditResponse> {
    const q = docId ? `?document_id=${encodeURIComponent(docId)}` : '';
    return requestJson<RadarAuditResponse>(`/intelligence/radar${q}`, { method: 'GET' });
  },

  getKnowledgeGraph(docId?: string | null): Promise<KnowledgeGraphResponse> {
    const q = docId ? `?document_id=${encodeURIComponent(docId)}` : '';
    return requestJson<KnowledgeGraphResponse>(`/intelligence/graph${q}`, { method: 'GET' });
  },

  getStudyModule(docId?: string | null): Promise<StudyModuleResponse> {
    const q = docId ? `?document_id=${encodeURIComponent(docId)}` : '';
    return requestJson<StudyModuleResponse>(`/intelligence/study${q}`, { method: 'GET' });
  },

  getDataExtractor(docId?: string | null): Promise<DataExtractorResponse> {
    const q = docId ? `?document_id=${encodeURIComponent(docId)}` : '';
    return requestJson<DataExtractorResponse>(`/intelligence/extractor${q}`, { method: 'GET' });
  },

  generatePodcastEpisode(payload: {
    document_id?: string | null;
    style?: PodcastStyle;
    voice_preset?: IndianVoicePreset;
  }): Promise<PodcastEpisodeResponse> {
    return requestJson<PodcastEpisodeResponse>('/intelligence/podcast', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  synthesizePodcastAudio(payload: {
    turns: PodcastTurn[];
    voice_preset?: IndianVoicePreset;
    host_a_name?: string;
    host_b_name?: string;
  }): Promise<{
    status: string;
    model: string;
    voice_locale: string;
    audio_data_url: string | null;
    latency_ms: number;
  }> {
    return requestJson('/intelligence/podcast-tts', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
};

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function formatRelativeTime(isoDate: string): string {
  const date = new Date(isoDate);
  if (isNaN(date.getTime())) return isoDate;
  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
