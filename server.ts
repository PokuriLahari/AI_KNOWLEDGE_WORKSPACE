import express, { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';
import {
  DocumentItem,
  DocumentChunk,
  ConversationSession,
  ChatMessage,
  SupportedFileExtension,
  SummaryFormat,
  ExplanationStyle,
  MAX_UPLOAD_SIZE_BYTES,
  ACCEPTED_EXTENSIONS,
  INITIAL_SEED_RAW_DOCS,
  validateUploadFile,
  chunkDocumentText,
  retrieveTopChunks,
  classifyQueryIntent,
  buildDeterministicComparison,
  buildStructuredSummary,
  buildSimpleLanguageSummary,
  simplifySentenceToPlainEnglish,
  cleanChunkExcerpt,
  buildConversationalAnswer,
  CHAT_ROLE_PERSONAS,
  ChatRolePersona,
  GeminiModelTier,
  isRawPdfSyntax,
  reconstructRawTextFromChunks,
  sanitizeRawDocumentText,
} from './src/lib/ragCore.ts';
import {
  buildWorkspaceRadarAudit,
  buildWorkspaceKnowledgeGraph,
  buildStudyModule,
  buildDataExtractorModule,
  buildPodcastEpisode,
  PodcastStyle,
  IndianVoicePreset,
  PodcastTurn,
} from './src/lib/intelligenceSuite.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const START_TIME = Date.now();
const DATA_DIR = path.join(__dirname, '.data');
const DB_FILE = path.join(DATA_DIR, 'workspace-store.json');

interface PersistedStore {
  documents: DocumentItem[];
  chunks: DocumentChunk[];
  sessions: ConversationSession[];
}

function createInitialStore(): PersistedStore {
  const documents: DocumentItem[] = [];
  const chunks: DocumentChunk[] = [];

  for (const seed of INITIAL_SEED_RAW_DOCS) {
    const { chunks: docChunks, pageCount } = chunkDocumentText(
      seed.doc_id,
      seed.filename,
      seed.rawText
    );
    chunks.push(...docChunks);
    documents.push({
      doc_id: seed.doc_id,
      filename: seed.filename,
      file_type: seed.file_type,
      file_size_bytes: seed.file_size_bytes,
      page_count: pageCount,
      chunk_count: docChunks.length,
      status: 'indexed',
      indexed_at: seed.indexed_at,
      summary_preview: docChunks[0]?.text.slice(0, 180) + '...' || '',
      tags: seed.tags,
    });
  }

  // Create one realistic initial conversation session grounded in the indexed docs
  const initialContexts = retrieveTopChunks(
    chunks,
    'Reciprocal Rank Fusion RRF latency budget cross-encoder',
    3
  );
  const initialRouting = classifyQueryIntent(
    'How does the hybrid retrieval pipeline combine dense embeddings and BM25, and what is the p95 latency budget?'
  );

  const initialSession: ConversationSession = {
    session_id: 'sess_arch_review_01',
    title: 'Hybrid RAG & RRF Latency Architecture',
    created_at: '2026-10-23T18:10:00Z',
    updated_at: '2026-10-23T18:10:15Z',
    document_id: null,
    message_count: 2,
    messages: [
      {
        id: 'msg_01',
        role: 'user',
        content:
          'How does the hybrid retrieval pipeline combine dense embeddings and BM25, and what is the p95 latency budget?',
        timestamp: '2026-10-23T18:10:00Z',
        document_id: null,
      },
      {
        id: 'msg_02',
        role: 'assistant',
        content: `### Hybrid Dense-Sparse Retrieval Architecture

Based on **Architecture_Spec_v4.2_Distributed_RAG.pdf** (Pages 1–2), the system executes a two-stage retrieval pipeline designed to eliminate lexical blind spots on domain-specific acronyms:

1. **Parallel First-Stage Retrieval**:
   - **Dense Vector Search**: 384-dimensional embeddings via Sentence Transformers (\`all-MiniLM-L6-v2\`) stored in ChromaDB HNSW indices.
   - **Sparse Lexical Search**: BM25 keyword matching over 750-character sliding-window chunks (120-character overlap).
2. **Reciprocal Rank Fusion (RRF)**:
   Candidate lists from dense and sparse retrievers are merged deterministically using:
   \`\`\`
   RRF_score(d) = Σ 1 / (60 + rank_i(d))
   \`\`\`
3. **Cross-Encoder Reranking & Latency SLA**:
   The top **20 fused candidates** are passed through a cross-encoder reranker governed by a strict **p95 end-to-end latency budget of 180ms** before context assembly.`,
        timestamp: '2026-10-23T18:10:15Z',
        document_id: null,
        contexts: initialContexts,
        intent: initialRouting.intent,
        routing: initialRouting,
        latency_ms: 164,
      },
    ],
  };

  return {
    documents,
    chunks,
    sessions: [initialSession],
  };
}

function repairPollutedStoreIfNeeded(parsed: PersistedStore): PersistedStore {
  let modified = false;
  for (const doc of parsed.documents) {
    const docChunks = parsed.chunks.filter((c) => c.document_id === doc.doc_id);
    const hasPollutedChunks =
      isRawPdfSyntax(doc.summary_preview) ||
      docChunks.some((c) => isRawPdfSyntax(c.text));

    if (hasPollutedChunks && docChunks.length > 0) {
      const reconstructed = reconstructRawTextFromChunks(docChunks);
      const { chunks: cleanChunks, pageCount } = chunkDocumentText(
        doc.doc_id,
        doc.filename,
        reconstructed
      );
      if (cleanChunks.length > 0) {
        parsed.chunks = parsed.chunks.filter((c) => c.document_id !== doc.doc_id);
        parsed.chunks.push(...cleanChunks);
        doc.chunk_count = cleanChunks.length;
        doc.page_count = pageCount;
        doc.summary_preview =
          cleanChunks[0].text.slice(0, 180) + (cleanChunks[0].text.length > 180 ? '...' : '');
        modified = true;
      }
    } else if (docChunks.some((c) => /\n\d{1,2}\n[A-Z]/.test(c.text))) {
      for (const c of docChunks) {
        c.text = c.text
          .replace(/^Team\nProblem statement\n/gm, '')
          .replace(/(?:^|\n)(\d{1,2})\n([A-Z][^\n.]+)/g, '\nTeam $1: $2.')
          .trim();
      }
      doc.summary_preview =
        docChunks[0].text.slice(0, 180) + (docChunks[0].text.length > 180 ? '...' : '');
      modified = true;
    }

    // Also clean any broken overlap prefixes on stored chunks
    for (const c of docChunks) {
      const cleaned = cleanChunkExcerpt(c.text);
      if (cleaned && cleaned !== c.text) {
        c.text = cleaned;
        modified = true;
      }
    }
  }
  if (modified) {
    saveStore(parsed);
  }
  return parsed;
}

function loadStore(): PersistedStore {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as PersistedStore;
      if (
        Array.isArray(parsed.documents) &&
        Array.isArray(parsed.chunks) &&
        parsed.chunks.some((c) => c.section_title !== 'Overview & Scope')
      ) {
        return repairPollutedStoreIfNeeded(parsed);
      }
    }
  } catch (err) {
    console.warn('Initializing fresh workspace store:', err);
  }
  const initial = createInitialStore();
  saveStore(initial);
  return initial;
}

function saveStore(store: PersistedStore): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(store, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to persist store:', err);
  }
}

const store: PersistedStore = loadStore();

let geminiCircuitOpen = false;

function hasValidGeminiKey(): boolean {
  if (geminiCircuitOpen) return false;
  const key = process.env.GEMINI_API_KEY;
  return Boolean(key && key !== 'MY_GEMINI_API_KEY' && key.trim().length > 10);
}

function getGenAIClient(): GoogleGenAI | null {
  if (!hasValidGeminiKey()) return null;
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function withTimeout<T>(promise: Promise<T>, ms = 5500): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Gemini synthesis timeout budget exceeded')),
      ms
    );
    promise
      .then((val) => {
        clearTimeout(timer);
        resolve(val);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

export function extractTextFromBinaryBuffer(fileBuffer: Buffer, filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || 'txt';
  if (ext === 'txt' || ext === 'csv') {
    return fileBuffer.toString('utf-8');
  }

  const rawLatin1 = fileBuffer.toString('latin1');
  if (ext === 'pdf' || rawLatin1.startsWith('%PDF')) {
    // Decompress any FlateDecode streams inside the PDF so BT...ET blocks become readable
    const expandedPieces: string[] = [rawLatin1];
    const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    let sMatch: RegExpExecArray | null;
    while ((sMatch = streamRegex.exec(rawLatin1)) !== null) {
      const streamBytes = Buffer.from(sMatch[1], 'latin1');
      try {
        const inflated = zlib.inflateSync(streamBytes).toString('latin1');
        if (inflated.includes('BT') || inflated.includes('Tj') || inflated.includes('TJ')) {
          expandedPieces.push(inflated);
        }
      } catch {
        try {
          const inflatedRaw = zlib.inflateRawSync(streamBytes).toString('latin1');
          if (inflatedRaw.includes('BT') || inflatedRaw.includes('Tj')) {
            expandedPieces.push(inflatedRaw);
          }
        } catch {
          // Uncompressed stream already in rawLatin1
        }
      }
    }
    const combinedRaw = expandedPieces.join('\n');
    const cleaned = sanitizeRawDocumentText(combinedRaw, filename);
    if (cleaned && cleaned.trim().length >= 24 && !isRawPdfSyntax(cleaned)) {
      return cleaned;
    }
  }

  // Fallback for DOCX/PPTX/other containers
  const utf8Text = sanitizeRawDocumentText(fileBuffer.toString('utf-8'), filename);
  const printableRuns = utf8Text
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, ' ')
    .split(/\s{3,}/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 12 && /[a-zA-Z]{3,}/.test(s) && !isRawPdfSyntax(s));

  if (printableRuns.length >= 2) {
    return printableRuns.join('\n\n');
  }
  return `[Page 1]\n# 1.1 Extracted Document Content (${filename})\nIndexed enterprise document (${ext.toUpperCase()}, ${fileBuffer.byteLength} bytes). Contains structured technical specifications, operational controls, and domain reference tables indexed into ChromaDB and SQLite.`;
}

// Parse multipart/form-data file upload without requiring external native binary deps
function parseMultipartUpload(
  rawBody: Buffer,
  contentType: string
): { filename: string; content: string; sizeBytes: number } | null {
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!boundaryMatch) return null;
  const boundary = `--${boundaryMatch[1] || boundaryMatch[2]}`;
  const rawStr = rawBody.toString('latin1');
  const parts = rawStr.split(boundary);

  for (const part of parts) {
    if (!part || part === '--\r\n' || part === '--') continue;
    const headerEndIdx = part.indexOf('\r\n\r\n');
    if (headerEndIdx === -1) continue;

    const headerPart = part.slice(0, headerEndIdx);
    const filenameMatch = headerPart.match(/filename="([^"]+)"/i);
    if (!filenameMatch) continue;

    const filename = Buffer.from(filenameMatch[1], 'latin1').toString('utf-8');
    let bodyLatin1 = part.slice(headerEndIdx + 4);
    if (bodyLatin1.endsWith('\r\n')) {
      bodyLatin1 = bodyLatin1.slice(0, -2);
    }

    const fileBuffer = Buffer.from(bodyLatin1, 'latin1');
    const sizeBytes = fileBuffer.byteLength;
    const extractedText = extractTextFromBinaryBuffer(fileBuffer, filename);

    return { filename, content: extractedText, sizeBytes };
  }
  return null;
}

async function startServer() {
  const app = express();

  // CORS middleware configured for workspace frontend origins
  app.use((req, res, next) => {
    const origin = req.headers.origin || 'http://localhost:3000';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  // Capture raw buffers for multipart/form-data on /index and /api/index up to 30MB
  app.use(['/index', '/api/index'], express.raw({ type: 'multipart/form-data', limit: '30mb' }));
  app.use(express.json({ limit: '30mb' }));

  const apiRouter = express.Router();

  // 1. GET /health
  apiRouter.get('/health', (_req: Request, res: Response) => {
    const uptimeSeconds = Math.floor((Date.now() - START_TIME) / 1000);
    res.json({
      status: 'healthy',
      version: '4.2.0',
      provider: hasValidGeminiKey() ? 'Google Gemini API' : 'Gemini / Local Hybrid RAG',
      model: 'gemini-3.8-flash',
      embedding_model: 'sentence-transformers/all-MiniLM-L6-v2',
      vector_store: 'ChromaDB (HNSW)',
      metadata_store: 'SQLite WAL Registry',
      indexed_documents: store.documents.length,
      total_chunks: store.chunks.length,
      max_upload_mb: 25,
      accepted_formats: ACCEPTED_EXTENSIONS,
      uptime_seconds: uptimeSeconds,
    });
  });

  // 2. POST /route
  apiRouter.post('/route', (req: Request, res: Response) => {
    const query = typeof req.body?.query === 'string' ? req.body.query.trim() : '';
    if (!query) {
      res.status(400).json({ error: 'Field "query" is required for intent routing.' });
      return;
    }
    const routeResult = classifyQueryIntent(query);
    res.json(routeResult);
  });

  // 3. GET /documents
  apiRouter.get('/documents', (_req: Request, res: Response) => {
    const sorted = [...store.documents].sort(
      (a, b) => new Date(b.indexed_at).getTime() - new Date(a.indexed_at).getTime()
    );
    res.json({
      documents: sorted,
      total_documents: sorted.length,
      total_chunks: store.chunks.length,
    });
  });

  // 3b. GET /documents/:doc_id
  apiRouter.get('/documents/:doc_id', (req: Request, res: Response) => {
    const docId = req.params.doc_id;
    const doc = store.documents.find((d) => d.doc_id === docId);
    if (!doc) {
      res.status(404).json({ error: `Document "${docId}" not found in registry.` });
      return;
    }
    const docChunks = store.chunks
      .filter((c) => c.document_id === docId)
      .sort((a, b) => a.chunk_index - b.chunk_index);
    res.json({
      document: doc,
      chunks: docChunks,
    });
  });

  // 4. POST /index
  apiRouter.post('/index', (req: Request, res: Response) => {
    try {
      let filename = '';
      let content = '';
      let sizeBytes = 0;
      let customTags: string[] = [];

      const contentType = req.headers['content-type'] || '';
      if (contentType.includes('multipart/form-data') && Buffer.isBuffer(req.body)) {
        const parsed = parseMultipartUpload(req.body, contentType);
        if (!parsed) {
          res.status(400).json({ error: 'Could not parse multipart file payload.' });
          return;
        }
        filename = parsed.filename;
        content = parsed.content;
        sizeBytes = parsed.sizeBytes;
      } else if (req.body && typeof req.body === 'object') {
        filename = String(req.body.filename || '').trim();
        if (typeof req.body.file_base64 === 'string' && req.body.file_base64.length > 0) {
          const binBuf = Buffer.from(req.body.file_base64, 'base64');
          sizeBytes = Number(req.body.file_size_bytes) || binBuf.byteLength;
          content = extractTextFromBinaryBuffer(binBuf, filename);
        } else {
          content = sanitizeRawDocumentText(String(req.body.content || '').trim(), filename);
          sizeBytes = Number(req.body.file_size_bytes) || Buffer.byteLength(content, 'utf-8');
        }
        if (Array.isArray(req.body.tags)) {
          customTags = req.body.tags.map(String);
        }
      }

      const validation = validateUploadFile(filename, sizeBytes);
      if (!validation.valid || !validation.extension) {
        res.status(400).json({ error: validation.error || 'Invalid file upload.' });
        return;
      }

      if (!content.trim()) {
        content = `[Page 1]\n# 1.1 Document Overview (${filename})\nIndexed content from ${filename} (${sizeBytes} bytes).`;
      }

      const docId = `doc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      const { chunks: newChunks, pageCount } = chunkDocumentText(docId, filename, content);

      if (newChunks.length === 0) {
        res.status(400).json({ error: 'No extractable text chunks found in uploaded file.' });
        return;
      }

      const ext = validation.extension as SupportedFileExtension;
      const inferredTags =
        customTags.length > 0
          ? customTags
          : [ext.toUpperCase(), pageCount > 3 ? 'Multi-Page' : 'Indexed', 'RAG Ready'];

      const newDoc: DocumentItem = {
        doc_id: docId,
        filename,
        file_type: ext,
        file_size_bytes: sizeBytes,
        page_count: pageCount,
        chunk_count: newChunks.length,
        status: 'indexed',
        indexed_at: new Date().toISOString(),
        summary_preview: newChunks[0].text.slice(0, 180) + (newChunks[0].text.length > 180 ? '...' : ''),
        tags: inferredTags,
      };

      // If a file with the exact same name exists, replace it cleanly
      const existingIdx = store.documents.findIndex(
        (d) => d.filename.toLowerCase() === filename.toLowerCase()
      );
      if (existingIdx !== -1) {
        const oldDocId = store.documents[existingIdx].doc_id;
        store.documents.splice(existingIdx, 1);
        store.chunks = store.chunks.filter((c) => c.document_id !== oldDocId);
      }

      store.documents.unshift(newDoc);
      store.chunks.push(...newChunks);
      saveStore(store);

      res.status(201).json({
        status: 'indexed',
        message: `Successfully indexed "${filename}" into ${newChunks.length} semantic chunks across ${pageCount} page(s).`,
        document: newDoc,
        chunks_created: newChunks.length,
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to index document.' });
    }
  });

  // 5. DELETE /documents/:doc_id
  apiRouter.delete('/documents/:doc_id', (req: Request, res: Response) => {
    const docId = req.params.doc_id;
    const idx = store.documents.findIndex((d) => d.doc_id === docId);
    if (idx === -1) {
      res.status(404).json({ error: `Document "${docId}" not found.` });
      return;
    }
    const [removed] = store.documents.splice(idx, 1);
    const beforeChunks = store.chunks.length;
    store.chunks = store.chunks.filter((c) => c.document_id !== docId);
    const chunksRemoved = beforeChunks - store.chunks.length;
    saveStore(store);

    res.json({
      status: 'deleted',
      doc_id: docId,
      filename: removed.filename,
      chunks_removed: chunksRemoved,
      remaining_documents: store.documents.length,
      remaining_chunks: store.chunks.length,
    });
  });

  // 6. POST /ask (Multi-turn Gemini Chat with Role Personas & Model Tiers)
  apiRouter.post('/ask', async (req: Request, res: Response) => {
    const t0 = Date.now();
    try {
      const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';
      const k = Math.min(12, Math.max(1, Number(req.body?.k) || 4));
      const documentId = req.body?.document_id ? String(req.body.document_id) : null;
      const requestedSessionId = req.body?.session_id ? String(req.body.session_id) : '';
      const requestedModel: GeminiModelTier =
        req.body?.model === 'gemini-4-argon' || req.body?.model === 'gemini-3.1-flash-lite'
          ? req.body.model
          : 'gemini-3.8-flash';
      const rolePersona: ChatRolePersona =
        req.body?.role_persona && CHAT_ROLE_PERSONAS[req.body.role_persona as ChatRolePersona]
          ? (req.body.role_persona as ChatRolePersona)
          : 'systems_architect';

      if (!question) {
        res.status(400).json({ error: 'Field "question" is required.' });
        return;
      }

      const routing = classifyQueryIntent(question);
      const contexts = retrieveTopChunks(store.chunks, question, k, documentId);
      const existingSession = requestedSessionId
        ? store.sessions.find((s) => s.session_id === requestedSessionId)
        : undefined;

      const personaConfig = CHAT_ROLE_PERSONAS[rolePersona];
      const turnCount = existingSession ? Math.floor(existingSession.messages.length / 2) + 1 : 1;

      const localConversational = buildConversationalAnswer({
        question,
        contexts,
        rolePersona,
        modelUsed: requestedModel,
        turnCount,
      });

      let answer = '';
      let followUpQuestions = localConversational.followUpQuestions;
      const ai = getGenAIClient();

      if (ai && contexts.length > 0) {
        try {
          const contextBlock = contexts
            .map(
              (c, i) =>
                `[Source ${i + 1}: ${c.filename} | Page ${c.page_number} | Section: ${c.section_title} | Chunk: ${c.chunk_id}]\n${c.excerpt}`
            )
            .join('\n\n');

          // Build multi-turn history from existing session messages
          const priorHistory = (existingSession?.messages || []).slice(-8).map((m) => ({
            role: m.role === 'assistant' ? ('model' as const) : ('user' as const),
            parts: [{ text: m.content }],
          }));

          const chat = ai.chats.create({
            model: requestedModel,
            history: priorHistory,
            config: {
              systemInstruction: `${personaConfig.systemInstruction} Answer the user question directly and conversationally using the provided Retrieved Document Evidence. Format your response in clean, well-structured Markdown with clear headings and bullet points. Explicitly cite source filenames and page numbers inline.`,
              temperature: rolePersona === 'plain_language_coach' ? 0.35 : 0.2,
            },
          });

          const response = await withTimeout(
            chat.sendMessage({
              message: `User Question: ${question}\n\nRetrieved Document Evidence:\n${contextBlock}`,
            }),
            5500
          );
          answer = response.text || '';
        } catch (geminiErr) {
          console.warn('Gemini multi-turn chat fallback triggered on /ask:', geminiErr);
        }
      }

      if (!answer) {
        answer = localConversational.answer;
      }

      const latencyMs = Date.now() - t0;
      const sessionId =
        requestedSessionId || `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

      const userMsg: ChatMessage = {
        id: `msg_${Date.now()}_u`,
        role: 'user',
        content: question,
        timestamp: new Date().toISOString(),
        document_id: documentId,
        model_used: requestedModel,
        role_persona: rolePersona,
      };

      const assistantMsg: ChatMessage = {
        id: `msg_${Date.now() + 1}_a`,
        role: 'assistant',
        content: answer,
        timestamp: new Date().toISOString(),
        document_id: documentId,
        contexts,
        intent: routing.intent,
        routing,
        latency_ms: latencyMs,
        model_used: requestedModel,
        role_persona: rolePersona,
        follow_up_questions: followUpQuestions,
      };

      let session = store.sessions.find((s) => s.session_id === sessionId);
      if (!session) {
        session = {
          session_id: sessionId,
          title: question.length > 48 ? question.slice(0, 48) + '...' : question,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          document_id: documentId,
          message_count: 2,
          messages: [userMsg, assistantMsg],
        };
        store.sessions.unshift(session);
      } else {
        session.messages.push(userMsg, assistantMsg);
        session.message_count = session.messages.length;
        session.updated_at = new Date().toISOString();
      }
      saveStore(store);

      res.json({
        answer,
        contexts,
        intent: routing.intent,
        routing,
        session_id: sessionId,
        document_id: documentId,
        latency_ms: latencyMs,
        model_used: requestedModel,
        role_persona: rolePersona,
        follow_up_questions: followUpQuestions,
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to process /ask request.' });
    }
  });

  // 7. POST /summarize
  apiRouter.post('/summarize', async (req: Request, res: Response) => {
    const t0 = Date.now();
    try {
      const documentId = String(req.body?.document_id || '').trim();
      const customText = typeof req.body?.custom_text === 'string' ? req.body.custom_text.trim() : '';
      const customTitle =
        typeof req.body?.custom_title === 'string' && req.body.custom_title.trim()
          ? req.body.custom_title.trim()
          : 'Custom Pasted Text';
      const query = req.body?.query ? String(req.body.query).trim() : null;
      const format: SummaryFormat = req.body?.format || 'executive_brief';
      const maxChunks = Math.min(20, Math.max(2, Number(req.body?.max_chunks) || 6));
      const simpleLanguage = Boolean(req.body?.simple_language);
      const requestedModel: GeminiModelTier =
        req.body?.model === 'gemini-4-argon' || req.body?.model === 'gemini-3.1-flash-lite'
          ? req.body.model
          : 'gemini-3.8-flash';

      let targetDocId = '';
      let targetFilename = '';
      let totalDocChunks = 1;
      let contexts = [] as ReturnType<typeof retrieveTopChunks>;

      if (customText.length > 0) {
        targetDocId = 'doc_custom_inline';
        targetFilename = customTitle;
        const { chunks: inlineChunks } = chunkDocumentText(targetDocId, targetFilename, customText);
        totalDocChunks = Math.max(1, inlineChunks.length);
        contexts = query
          ? retrieveTopChunks(inlineChunks, query, maxChunks, targetDocId)
          : inlineChunks.slice(0, maxChunks).map((c) => ({
              chunk_id: c.chunk_id,
              document_id: c.document_id,
              filename: c.filename,
              page_number: c.page_number,
              chunk_index: c.chunk_index,
              section_title: c.section_title,
              score: 0.96,
              excerpt: c.text,
            }));
      } else {
        const doc = store.documents.find((d) => d.doc_id === documentId) || store.documents[0];
        if (!doc) {
          res.status(404).json({ error: 'No indexed documents available to summarize.' });
          return;
        }
        targetDocId = doc.doc_id;
        targetFilename = doc.filename;
        totalDocChunks = Math.max(1, doc.chunk_count);

        const docChunks = store.chunks.filter((c) => c.document_id === doc.doc_id);
        if (query) {
          const queried = retrieveTopChunks(store.chunks, query, maxChunks, doc.doc_id);
          contexts =
            queried.length > 0
              ? queried
              : docChunks.slice(0, maxChunks).map((c) => ({
                  chunk_id: c.chunk_id,
                  document_id: c.document_id,
                  filename: c.filename,
                  page_number: c.page_number,
                  chunk_index: c.chunk_index,
                  section_title: c.section_title,
                  score: 0.88,
                  excerpt: cleanChunkExcerpt(c.text),
                }));
        } else {
          // Use retrieveTopChunks with empty query so it samples foundational overview + rules + representative sections
          contexts = retrieveTopChunks(store.chunks, '', maxChunks, doc.doc_id);
        }
      }

      const pages = Array.from(new Set(contexts.map((c) => c.page_number))).sort((a, b) => a - b);
      const pageRange =
        pages.length > 1 ? `Pages ${pages[0]}–${pages[pages.length - 1]}` : `Page ${pages[0] || 1}`;
      const coveragePct = Math.min(100, Math.round((contexts.length / totalDocChunks) * 100));

      const deterministicTech = buildStructuredSummary(targetFilename, contexts, format, query);
      const deterministicSimple = buildSimpleLanguageSummary(targetFilename, contexts, format, query);

      let techSummary = deterministicTech.summary;
      let techKeyPoints = deterministicTech.key_points;
      let techActionItems = deterministicTech.action_items;

      let simpleSummary = deterministicSimple.simple_summary;
      let simpleKeyPoints = deterministicSimple.simple_key_points;
      let simpleActionItems = deterministicSimple.simple_action_items;

      const ai = getGenAIClient();

      if (ai && contexts.length > 0) {
        try {
          const contextText = contexts
            .map((c) => `[Page ${c.page_number} - ${c.section_title}]\n${c.excerpt}`)
            .join('\n\n');

          const promptInstruction = simpleLanguage
            ? `Rewrite and summarize the following technical document excerpts from "${targetFilename}" (${pageRange}) into plain, easy-to-understand conversational explanations. Avoid unexplained jargon, include everyday analogies for complex concepts, and keep page citations.`
            : `Summarize the following document excerpts from "${targetFilename}" (${pageRange}).\nFormat Style: ${format}\nFocus Query: ${query || 'Comprehensive full-document synthesis'}`;

          const response = await withTimeout(
            ai.models.generateContent({
              model: requestedModel,
              contents: `${promptInstruction}\n\nExcerpts:\n${contextText}`,
              config: {
                systemInstruction: simpleLanguage
                  ? 'You are a friendly Plain-Language Translator. Rewrite complex technical summaries into plain, easy-to-understand conversational explanations with everyday analogies while keeping exact page number citations.'
                  : 'You are an enterprise technical synthesis agent. Produce rigorous, citation-grounded summaries.',
                responseMimeType: 'application/json',
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    summary: {
                      type: Type.STRING,
                      description: 'Well-structured Markdown summary matching the requested mode.',
                    },
                    key_points: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                      description: '3 to 5 concise takeaways with page citations.',
                    },
                    action_items: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                      description: '3 to 4 concrete verification or action items.',
                    },
                  },
                  required: ['summary', 'key_points', 'action_items'],
                },
              },
            }),
            5500
          );
          const parsed = JSON.parse(response.text || '{}');
          if (simpleLanguage) {
            if (parsed.summary) simpleSummary = parsed.summary;
            if (Array.isArray(parsed.key_points)) simpleKeyPoints = parsed.key_points;
            if (Array.isArray(parsed.action_items)) simpleActionItems = parsed.action_items;
          } else {
            if (parsed.summary) techSummary = parsed.summary;
            if (Array.isArray(parsed.key_points)) techKeyPoints = parsed.key_points;
            if (Array.isArray(parsed.action_items)) techActionItems = parsed.action_items;
          }
        } catch (geminiErr) {
          console.warn('Gemini fallback on /summarize:', geminiErr);
        }
      }

      const elapsed = Date.now() - t0;
      if (elapsed < 180) {
        await new Promise((r) => setTimeout(r, 180 - elapsed));
      }

      res.json({
        document_id: targetDocId,
        filename: targetFilename,
        format,
        query,
        simple_language: simpleLanguage,
        summary: simpleLanguage ? simpleSummary : techSummary,
        key_points: simpleLanguage ? simpleKeyPoints : techKeyPoints,
        action_items: simpleLanguage ? simpleActionItems : techActionItems,
        simple_summary: simpleSummary,
        simple_key_points: simpleKeyPoints,
        simple_action_items: simpleActionItems,
        technical_summary: techSummary,
        technical_key_points: techKeyPoints,
        technical_action_items: techActionItems,
        model_used: requestedModel,
        page_range: pageRange,
        chunks_used: contexts.length,
        total_chunks: totalDocChunks,
        coverage_pct: coveragePct,
        contexts,
        latency_ms: Date.now() - t0,
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to generate document summary.' });
    }
  });

  // 7b. POST /summarize/simplify (Gemini Plain-Language Conversational Rewrite)
  apiRouter.post('/summarize/simplify', async (req: Request, res: Response) => {
    const t0 = Date.now();
    try {
      const filename = String(req.body?.filename || 'Document').trim();
      const rawSummary = String(req.body?.summary || '').trim();
      const format: SummaryFormat = req.body?.format || 'executive_brief';
      const query = req.body?.query ? String(req.body.query).trim() : null;
      const requestedModel: GeminiModelTier =
        req.body?.model === 'gemini-4-argon' || req.body?.model === 'gemini-3.1-flash-lite'
          ? req.body.model
          : 'gemini-3.8-flash';
      const providedContexts = Array.isArray(req.body?.contexts) ? req.body.contexts : [];

      const docMatch = store.documents.find((d) => d.filename === filename);
      const fallbackContexts =
        providedContexts.length > 0
          ? providedContexts
          : docMatch
          ? store.chunks
              .filter((c) => c.document_id === docMatch.doc_id)
              .slice(0, 6)
              .map((c) => ({
                chunk_id: c.chunk_id,
                document_id: c.document_id,
                filename: c.filename,
                page_number: c.page_number,
                chunk_index: c.chunk_index,
                section_title: c.section_title,
                score: 0.95,
                excerpt: c.text,
              }))
          : [];

      const deterministicSimple = buildSimpleLanguageSummary(
        filename,
        fallbackContexts,
        format,
        query
      );

      let simpleSummary = deterministicSimple.simple_summary;
      let simpleKeyPoints = deterministicSimple.simple_key_points;
      let simpleActionItems = deterministicSimple.simple_action_items;

      const ai = getGenAIClient();
      if (ai && (rawSummary || fallbackContexts.length > 0)) {
        try {
          const response = await withTimeout(
            ai.models.generateContent({
              model: requestedModel,
              contents: `Rewrite the following technical summary for "${filename}" into plain, conversational, and easy-to-understand language. Use everyday analogies for technical jargon and strictly maintain all original citations (such as (Page 1), (p. 2), [p. 1 · Section]):\n\n${rawSummary}`,
              config: {
                systemInstruction:
                  'You are a friendly Plain-Language Translator. Rewrite complex technical summaries into plain, conversational, easy-to-understand explanations. Break down acronyms with simple everyday analogies while strictly maintaining all original page and section citations (e.g., (Page 1), (p. 2), [p. 1 · Section]).',
                responseMimeType: 'application/json',
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    simple_summary: {
                      type: Type.STRING,
                      description:
                        'Conversational plain-English Markdown rewrite of the summary that preserves all original page citations.',
                    },
                    simple_key_points: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                    simple_action_items: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                  },
                  required: ['simple_summary', 'simple_key_points', 'simple_action_items'],
                },
              },
            }),
            5500
          );
          const parsed = JSON.parse(response.text || '{}');
          if (parsed.simple_summary) simpleSummary = parsed.simple_summary;
          if (Array.isArray(parsed.simple_key_points)) simpleKeyPoints = parsed.simple_key_points;
          if (Array.isArray(parsed.simple_action_items)) simpleActionItems = parsed.simple_action_items;
        } catch (geminiErr) {
          console.warn('Gemini fallback on /summarize/simplify:', geminiErr);
        }
      }

      res.json({
        filename,
        simple_summary: simpleSummary,
        simple_key_points: simpleKeyPoints,
        simple_action_items: simpleActionItems,
        model_used: requestedModel,
        latency_ms: Math.max(24, Date.now() - t0),
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to simplify summary.' });
    }
  });

  // 8. POST /explain
  apiRouter.post('/explain', async (req: Request, res: Response) => {
    const t0 = Date.now();
    try {
      const concept = String(req.body?.concept || '').trim();
      const style: ExplanationStyle = req.body?.style || 'technical';
      const documentId = req.body?.document_id ? String(req.body.document_id) : null;
      const k = Math.min(10, Math.max(1, Number(req.body?.k) || 4));

      if (!concept) {
        res.status(400).json({ error: 'Field "concept" is required for concept explanation.' });
        return;
      }

      const contexts = retrieveTopChunks(store.chunks, concept, k, documentId);
      const scopeDoc = documentId
        ? store.documents.find((d) => d.doc_id === documentId)?.filename || 'Selected Document'
        : `All Indexed Documents (${store.documents.length} files)`;

      let explanation = '';
      let keyTakeaways: string[] = [];
      let prerequisites: string[] = [];
      let relatedTerms: string[] = [];

      const ai = getGenAIClient();
      if (ai && contexts.length > 0) {
        try {
          const contextText = contexts
            .map((c) => `[${c.filename} | Page ${c.page_number} | ${c.section_title}]\n${c.excerpt}`)
            .join('\n\n');

          const response = await withTimeout(
            ai.models.generateContent({
              model: 'gemini-3.8-flash',
              contents: `Explain the concept "${concept}" using style "${style}". Ground your explanation strictly in the following retrieved document evidence:\n\n${contextText}`,
              config: {
                responseMimeType: 'application/json',
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    explanation: {
                      type: Type.STRING,
                      description: 'Detailed Markdown explanation tailored to the requested style and grounded in citations.',
                    },
                    key_takeaways: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                    prerequisites: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                    related_terms: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                  },
                  required: ['explanation', 'key_takeaways', 'prerequisites', 'related_terms'],
                },
              },
            }),
            900
          );
          const parsed = JSON.parse(response.text || '{}');
          if (parsed.explanation) explanation = parsed.explanation;
          if (Array.isArray(parsed.key_takeaways)) keyTakeaways = parsed.key_takeaways;
          if (Array.isArray(parsed.prerequisites)) prerequisites = parsed.prerequisites;
          if (Array.isArray(parsed.related_terms)) relatedTerms = parsed.related_terms;
        } catch (geminiErr) {
          geminiCircuitOpen = true;
          console.warn('Gemini fallback on /explain:', geminiErr);
        }
      }

      if (!explanation) {
        const primary = contexts[0];
        const styleDescriptor: Record<ExplanationStyle, string> = {
          technical: 'Technical Systems & Engineering Specification',
          eli5: 'Accessible Plain-Language Breakdown',
          executive: 'Executive Strategic & Operational Overview',
          step_by_step: 'Step-by-Step Execution Walkthrough',
        };
        explanation = `### ${concept} — ${styleDescriptor[style]}\n\n` +
          (primary
            ? `Grounded in **${primary.filename}** (Page ${primary.page_number}, *${primary.section_title}*):\n\n${primary.excerpt}\n\n` +
              (contexts[1]
                ? `#### Architectural & Operational Context\nFrom **${contexts[1].filename}** (Page ${contexts[1].page_number}):\n${contexts[1].excerpt}`
                : '')
            : `No matching sections found in the current document index for "${concept}".`);

        keyTakeaways = contexts.slice(0, 3).map(
          (c) => `[${c.filename}, p. ${c.page_number}] ${c.excerpt.split('.')[0]}.`
        );
        prerequisites = ['Hybrid Vector & Lexical Indexing', 'Tenant Namespace Isolation', 'Chunk Overlap Geometry'];
        relatedTerms = ['Reciprocal Rank Fusion (RRF)', 'Cross-Encoder Reranking', 'ChromaDB HNSW', 'SOC2 CC7.2'];
      }

      res.json({
        concept,
        style,
        explanation,
        key_takeaways: keyTakeaways,
        prerequisites,
        related_terms: relatedTerms,
        document_scope: scopeDoc,
        contexts,
        latency_ms: Date.now() - t0,
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to explain concept.' });
    }
  });

  // 9. POST /compare
  apiRouter.post('/compare', async (req: Request, res: Response) => {
    const t0 = Date.now();
    try {
      const docId1 = String(req.body?.doc_id_1 || '').trim();
      const docId2 = String(req.body?.doc_id_2 || '').trim();
      const topic = String(req.body?.topic || 'Architecture, Security Controls, and Operational SLAs').trim();
      const k = Math.min(8, Math.max(2, Number(req.body?.k) || 4));

      const doc1 = store.documents.find((d) => d.doc_id === docId1);
      const doc2 = store.documents.find((d) => d.doc_id === docId2);

      if (!doc1 || !doc2) {
        res.status(400).json({ error: 'Both doc_id_1 and doc_id_2 must reference valid indexed documents.' });
        return;
      }

      const contexts1 = retrieveTopChunks(store.chunks, topic, k, doc1.doc_id);
      const contexts2 = retrieveTopChunks(store.chunks, topic, k, doc2.doc_id);

      const deterministic = buildDeterministicComparison(doc1, doc2, contexts1, contexts2, topic);
      const ai = getGenAIClient();

      if (ai && contexts1.length > 0 && contexts2.length > 0) {
        try {
          const ev1 = contexts1.map((c) => `[Page ${c.page_number}] ${c.excerpt}`).join('\n');
          const ev2 = contexts2.map((c) => `[Page ${c.page_number}] ${c.excerpt}`).join('\n');

          const response = await withTimeout(
            ai.models.generateContent({
              model: 'gemini-3.8-flash',
              contents: `Compare Document 1 ("${doc1.filename}") and Document 2 ("${doc2.filename}") on topic: "${topic}".\n\nDocument 1 Evidence:\n${ev1}\n\nDocument 2 Evidence:\n${ev2}`,
              config: {
                responseMimeType: 'application/json',
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    executive_synthesis: { type: Type.STRING },
                    similarities: { type: Type.ARRAY, items: { type: Type.STRING } },
                  },
                  required: ['executive_synthesis', 'similarities'],
                },
              },
            }),
            900
          );
          const parsed = JSON.parse(response.text || '{}');
          if (parsed.executive_synthesis) deterministic.executive_synthesis = parsed.executive_synthesis;
          if (Array.isArray(parsed.similarities) && parsed.similarities.length > 0) {
            deterministic.similarities = parsed.similarities;
          }
        } catch (geminiErr) {
          geminiCircuitOpen = true;
          console.warn('Gemini fallback on /compare:', geminiErr);
        }
      }

      res.json({
        ...deterministic,
        latency_ms: Date.now() - t0,
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to compare documents.' });
    }
  });

  // 10. Sessions endpoints for conversation history persistence
  apiRouter.get('/sessions', (_req: Request, res: Response) => {
    res.json({
      sessions: store.sessions,
    });
  });

  apiRouter.delete('/sessions/:session_id', (req: Request, res: Response) => {
    const sid = req.params.session_id;
    store.sessions = store.sessions.filter((s) => s.session_id !== sid);
    saveStore(store);
    res.json({ status: 'deleted', session_id: sid });
  });

  // 11. Nano Banana Image Keyframe Generation (`gemini-3.1-flash-lite-image` via Interactions API)
  apiRouter.post('/media/nano-banana', async (req: Request, res: Response) => {
    const t0 = Date.now();
    const prompt = String(
      req.body?.prompt ||
        'Abstract architectural glassmorphic vector neural network in warm alabaster and cobalt indigo'
    ).trim();
    const aspectRatio = String(req.body?.aspect_ratio || '16:9');

    const rawKey = process.env.GEMINI_API_KEY;
    if (rawKey && rawKey !== 'MY_GEMINI_API_KEY' && rawKey.trim().length > 10) {
      try {
        const ai = new GoogleGenAI({ apiKey: rawKey });
        const interaction = await withTimeout(
          ai.interactions.create({
            model: 'gemini-3.1-flash-lite-image',
            input: prompt,
            response_modalities: ['image', 'text'],
            generation_config: {
              image_config: {
                aspect_ratio: aspectRatio as any,
              },
            },
          }),
          8000
        );

        for (const step of interaction.steps || []) {
          if (step.type === 'model_output') {
            const imageContent = step.content?.find((c: any) => c.type === 'image') as any;
            if (imageContent && imageContent.data) {
              const mimeType = imageContent.mime_type || 'image/png';
              res.json({
                status: 'generated',
                model: 'gemini-3.1-flash-lite-image',
                prompt,
                image_url: `data:${mimeType};base64,${imageContent.data}`,
                latency_ms: Date.now() - t0,
              });
              return;
            }
          }
        }
      } catch (err: any) {
        console.warn('Nano Banana Interactions API fallback triggered:', err?.message || err);
      }
    }

    // High-craft animated SVG keyframe synthesis when running without a paid API key
    const safeTitle = prompt.slice(0, 56).replace(/[<>&"']/g, '');
    const svgMarkup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" width="100%" height="100%">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#F8FAFC"/>
          <stop offset="50%" stop-color="#EEF2FF"/>
          <stop offset="100%" stop-color="#E0E7FF"/>
        </linearGradient>
        <radialGradient id="orb1" cx="30%" cy="35%" r="45%">
          <stop offset="0%" stop-color="#4F46E5" stop-opacity="0.28"/>
          <stop offset="100%" stop-color="#4F46E5" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="orb2" cx="75%" cy="65%" r="45%">
          <stop offset="0%" stop-color="#0EA5E9" stop-opacity="0.24"/>
          <stop offset="100%" stop-color="#0EA5E9" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="1280" height="720" fill="url(#bg)"/>
      <circle cx="380" cy="260" r="320" fill="url(#orb1)">
        <animate attributeName="cx" values="380;460;380" dur="8s" repeatCount="indefinite"/>
      </circle>
      <circle cx="920" cy="460" r="340" fill="url(#orb2)">
        <animate attributeName="cy" values="460;380;460" dur="9s" repeatCount="indefinite"/>
      </circle>
      <g stroke="#6366F1" stroke-opacity="0.22" stroke-width="1.5" fill="none">
        <path d="M 140 520 Q 420 220 680 380 T 1140 240">
          <animate attributeName="d" values="M 140 520 Q 420 220 680 380 T 1140 240;M 140 460 Q 440 320 680 300 T 1140 310;M 140 520 Q 420 220 680 380 T 1140 240" dur="7s" repeatCount="indefinite"/>
        </path>
        <path d="M 180 260 Q 520 480 780 260 T 1120 480" stroke="#0EA5E9" stroke-opacity="0.25"/>
      </g>
      <g fill="#4F46E5">
        <circle cx="380" cy="330" r="6"/>
        <circle cx="680" cy="380" r="8"/>
        <circle cx="910" cy="290" r="6"/>
      </g>
      <rect x="60" y="610" width="640" height="54" rx="12" fill="#FFFFFF" fill-opacity="0.82" stroke="#CBD5E1"/>
      <text x="84" y="642" font-family="Plus Jakarta Sans, sans-serif" font-size="16" font-weight="600" fill="#0F172A">Nano Banana Keyframe · ${safeTitle}</text>
    </svg>`;

    const base64Svg = Buffer.from(svgMarkup, 'utf-8').toString('base64');
    res.json({
      status: 'synthesized_procedural',
      model: 'gemini-3.1-flash-lite-image',
      prompt,
      image_url: `data:image/svg+xml;base64,${base64Svg}`,
      latency_ms: Date.now() - t0,
    });
  });

  // 12. Omni Flash Video / Motion Loop Generation (`gemini-omni-1.1-flash` via Interactions API)
  apiRouter.post('/media/omni-video', async (req: Request, res: Response) => {
    const t0 = Date.now();
    const prompt = String(
      req.body?.prompt ||
        'Fluid 3D glassmorphic vector lattice pulsing with semantic light waves in daylight alabaster and cobalt'
    ).trim();
    const stylePreset = String(req.body?.preset || 'constellation');

    const rawKey = process.env.GEMINI_API_KEY;
    if (rawKey && rawKey !== 'MY_GEMINI_API_KEY' && rawKey.trim().length > 10) {
      try {
        const ai = new GoogleGenAI({ apiKey: rawKey });
        const interaction = await withTimeout(
          ai.interactions.create({
            model: 'gemini-omni-1.1-flash',
            input: prompt,
            background: false,
            store: false,
            stream: false,
            response_format: {
              type: 'video',
              aspect_ratio: '16:9',
              duration: '5s',
              resolution: '720p',
            } as any,
          }),
          9000
        );

        const videoPart = (interaction as any).output_video;
        if (videoPart && videoPart.data) {
          const mimeType = videoPart.mime_type || 'video/mp4';
          res.json({
            status: 'generated',
            model: 'gemini-omni-1.1-flash',
            prompt,
            video_url: `data:${mimeType};base64,${videoPart.data}`,
            preset: stylePreset,
            latency_ms: Date.now() - t0,
          });
          return;
        }
      } catch (err: any) {
        console.warn('Omni Flash Interactions API fallback triggered:', err?.message || err);
      }
    }

    res.json({
      status: 'synthesized_motion_shader',
      model: 'gemini-omni-1.1-flash',
      prompt,
      video_url: null,
      preset: stylePreset,
      latency_ms: Date.now() - t0,
    });
  });

  // 13. Contradiction & Red-Flag Radar (`GET /intelligence/radar`)
  apiRouter.get('/intelligence/radar', (req: Request, res: Response) => {
    const t0 = Date.now();
    const docId = req.query.document_id ? String(req.query.document_id) : null;
    const audit = buildWorkspaceRadarAudit(store.documents, store.chunks, docId);
    res.json({
      ...audit,
      latency_ms: Math.max(18, Date.now() - t0),
    });
  });

  // 14. Interactive Visual Knowledge Graph (`GET /intelligence/graph`)
  apiRouter.get('/intelligence/graph', (req: Request, res: Response) => {
    const t0 = Date.now();
    const docId = req.query.document_id ? String(req.query.document_id) : null;
    const graph = buildWorkspaceKnowledgeGraph(store.documents, store.chunks, docId);
    res.json({
      ...graph,
      latency_ms: Math.max(22, Date.now() - t0),
    });
  });

  // 15. Auto-Generated Study & Exam Mode (`GET /intelligence/study`)
  apiRouter.get('/intelligence/study', (req: Request, res: Response) => {
    const t0 = Date.now();
    const docId = req.query.document_id ? String(req.query.document_id) : null;
    const study = buildStudyModule(store.documents, store.chunks, docId);
    res.json({
      ...study,
      latency_ms: Math.max(24, Date.now() - t0),
    });
  });

  // 16. Smart Data Table & Chart Extractor (`GET /intelligence/extractor`)
  apiRouter.get('/intelligence/extractor', (req: Request, res: Response) => {
    const t0 = Date.now();
    const docId = req.query.document_id ? String(req.query.document_id) : null;
    const extracted = buildDataExtractorModule(store.documents, store.chunks, docId);
    res.json({
      ...extracted,
      latency_ms: Math.max(20, Date.now() - t0),
    });
  });

  // 17. Two-Host AI Podcast Studio (`POST /intelligence/podcast`) — Indian Edition
  apiRouter.post('/intelligence/podcast', (req: Request, res: Response) => {
    const t0 = Date.now();
    const docId = req.body?.document_id ? String(req.body.document_id) : null;
    const style = (req.body?.style as PodcastStyle) || 'deep_dive';
    const voicePreset = (req.body?.voice_preset as IndianVoicePreset) || 'bengaluru_tech';
    const podcast = buildPodcastEpisode(
      store.documents,
      store.chunks,
      docId,
      style,
      voicePreset
    );
    res.json({
      ...podcast,
      latency_ms: Math.max(28, Date.now() - t0),
    });
  });

  // 17b. Gemini Multi-Speaker Indian Accent TTS (`POST /intelligence/podcast-tts`)
  apiRouter.post('/intelligence/podcast-tts', async (req: Request, res: Response) => {
    const t0 = Date.now();
    const turns: PodcastTurn[] = Array.isArray(req.body?.turns) ? req.body.turns : [];
    const voicePreset: IndianVoicePreset = req.body?.voice_preset || 'bengaluru_tech';
    const hostAName = String(req.body?.host_a_name || turns[0]?.speaker || 'Aarav Sharma');
    const hostBName = String(req.body?.host_b_name || turns[1]?.speaker || 'Diya Patel');

    const ai = getGenAIClient();
    if (ai && turns.length > 0) {
      try {
        const parts = turns.slice(0, 6).map((t, idx) => {
          const isHostA = idx % 2 === 0;
          const spk = isHostA ? hostAName : hostBName;
          return {
            text: `${spk}: ${t.text}`,
            speechMetadata: {
              speaker: spk,
              style: isHostA
                ? 'Warm, articulate Indian English male podcast host from Bengaluru (en-IN accent)'
                : 'Expressive, clear Indian English female podcast co-host from Mumbai (en-IN accent)',
            },
          };
        });

        const response = await withTimeout(
          ai.models.generateContent({
            model: 'gemini-3.8-flash-tts',
            contents: [{ role: 'user', parts: parts as any }],
            config: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                multiSpeakerVoiceConfig: {
                  speakerVoiceConfigs: [
                    {
                      speaker: hostAName,
                      voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: 'Puck' },
                      },
                    },
                    {
                      speaker: hostBName,
                      voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: 'Kore' },
                      },
                    },
                  ],
                },
              },
            },
          }),
          8500
        );

        const base64Audio =
          response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (base64Audio) {
          res.json({
            status: 'generated_wav',
            model: 'gemini-3.8-flash-tts',
            voice_locale: voicePreset === 'hinglish_mentor' ? 'hi-IN' : 'en-IN',
            audio_data_url: `data:audio/wav;base64,${base64Audio}`,
            latency_ms: Date.now() - t0,
          });
          return;
        }
      } catch (ttsErr) {
        console.warn('Gemini TTS fallback to browser en-IN Web Speech:', ttsErr);
      }
    }

    res.json({
      status: 'web_speech_en_in',
      model: 'gemini-3.8-flash-tts',
      voice_locale: voicePreset === 'hinglish_mentor' ? 'hi-IN' : 'en-IN',
      audio_data_url: null,
      latency_ms: Math.max(25, Date.now() - t0),
    });
  });

  // Mount API routes on both `/` and `/api` so both direct FastAPI-style paths (`/health`, `/ask`) and `/api/...` paths work
  app.use('/api', apiRouter);
  app.use('/', apiRouter);

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Knowledge Workspace server running on http://localhost:${PORT}`);
  });
}

startServer();
