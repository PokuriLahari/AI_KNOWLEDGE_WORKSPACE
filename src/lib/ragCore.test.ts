import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateUploadFile,
  chunkDocumentText,
  retrieveTopChunks,
  classifyQueryIntent,
  buildDeterministicComparison,
  buildStructuredSummary,
  buildSimpleLanguageSummary,
  simplifySentenceToPlainEnglish,
  CHAT_ROLE_PERSONAS,
  INITIAL_SEED_RAW_DOCS,
} from './ragCore';
import { parseCitationToken } from '../components/MarkdownRenderer';
import { buildPodcastEpisode } from './intelligenceSuite';

test('validateUploadFile accepts valid extensions and rejects invalid formats or sizes', () => {
  const validPdf = validateUploadFile('report.pdf', 1024 * 500);
  assert.equal(validPdf.valid, true);
  assert.equal(validPdf.extension, 'pdf');

  const validCsv = validateUploadFile('metrics.CSV', 2048);
  assert.equal(validCsv.valid, true);
  assert.equal(validCsv.extension, 'csv');

  const invalidExt = validateUploadFile('malware.exe', 1024);
  assert.equal(invalidExt.valid, false);
  assert.match(invalidExt.error || '', /Unsupported file format/);

  const emptyFile = validateUploadFile('empty.txt', 0);
  assert.equal(emptyFile.valid, false);

  const oversized = validateUploadFile('huge.pdf', 26 * 1024 * 1024);
  assert.equal(oversized.valid, false);
  assert.match(oversized.error || '', /exceeds the 25 MB/);
});

test('chunkDocumentText splits multi-page text into indexed chunks with page numbers and sections', () => {
  const raw = INITIAL_SEED_RAW_DOCS[0].rawText;
  const { chunks, pageCount } = chunkDocumentText('doc_test', 'spec.pdf', raw, 600, 80);

  assert.ok(chunks.length >= 4, 'Should create at least 4 chunks');
  assert.equal(pageCount, 5);
  assert.equal(chunks[0].document_id, 'doc_test');
  assert.equal(chunks[0].filename, 'spec.pdf');
  assert.ok(chunks[0].token_count > 10);
});

test('retrieveTopChunks ranks relevant chunks highest and filters by document_id when provided', () => {
  const allChunks = INITIAL_SEED_RAW_DOCS.flatMap((doc) =>
    chunkDocumentText(doc.doc_id, doc.filename, doc.rawText).chunks
  );

  const rrfResults = retrieveTopChunks(allChunks, 'Reciprocal Rank Fusion RRF cross-encoder latency', 3);
  assert.equal(rrfResults.length, 3);
  assert.equal(rrfResults[0].document_id, 'doc_arch_rag_v4');
  assert.ok(rrfResults[0].excerpt.includes('Reciprocal Rank Fusion'));
  assert.ok(rrfResults[0].score > 0.5);

  // Scoped retrieval to security audit doc only
  const scopedResults = retrieveTopChunks(allChunks, 'key rotation interval', 2, 'doc_sec_audit_q3');
  assert.ok(scopedResults.every((c) => c.document_id === 'doc_sec_audit_q3'));
});

test('classifyQueryIntent accurately classifies qa, summarize, explain, and compare intents', () => {
  const routeCompare = classifyQueryIntent('Compare the key rotation policy between the architecture spec and security audit');
  assert.equal(routeCompare.intent, 'compare');
  assert.ok(routeCompare.confidence >= 0.9);

  const routeSummarize = classifyQueryIntent('Give me an executive summary of the Q3 security audit');
  assert.equal(routeSummarize.intent, 'summarize');
  assert.equal(routeSummarize.explanation_style, 'executive');

  const routeExplain = classifyQueryIntent('Explain Reciprocal Rank Fusion step by step');
  assert.equal(routeExplain.intent, 'explain');
  assert.equal(routeExplain.explanation_style, 'step_by_step');
  assert.ok(routeExplain.target_concept?.toLowerCase().includes('reciprocal rank fusion'));

  const routeQa = classifyQueryIntent('What is the p95 latency budget for the cross-encoder reranker?');
  assert.equal(routeQa.intent, 'qa');
});

test('buildDeterministicComparison produces structured coverage, similarities, differences, and conflicts', () => {
  const doc1Chunks = chunkDocumentText(
    INITIAL_SEED_RAW_DOCS[0].doc_id,
    INITIAL_SEED_RAW_DOCS[0].filename,
    INITIAL_SEED_RAW_DOCS[0].rawText
  ).chunks;
  const doc2Chunks = chunkDocumentText(
    INITIAL_SEED_RAW_DOCS[1].doc_id,
    INITIAL_SEED_RAW_DOCS[1].filename,
    INITIAL_SEED_RAW_DOCS[1].rawText
  ).chunks;

  const doc1 = {
    doc_id: INITIAL_SEED_RAW_DOCS[0].doc_id,
    filename: INITIAL_SEED_RAW_DOCS[0].filename,
    file_type: 'pdf' as const,
    file_size_bytes: 1000,
    page_count: 5,
    chunk_count: doc1Chunks.length,
    status: 'indexed' as const,
    indexed_at: '2026-10-21T00:00:00Z',
    summary_preview: '',
    tags: [],
  };
  const doc2 = {
    doc_id: INITIAL_SEED_RAW_DOCS[1].doc_id,
    filename: INITIAL_SEED_RAW_DOCS[1].filename,
    file_type: 'docx' as const,
    file_size_bytes: 1000,
    page_count: 4,
    chunk_count: doc2Chunks.length,
    status: 'indexed' as const,
    indexed_at: '2026-10-22T00:00:00Z',
    summary_preview: '',
    tags: [],
  };

  const ctx1 = retrieveTopChunks(doc1Chunks, 'key rotation retention', 3);
  const ctx2 = retrieveTopChunks(doc2Chunks, 'key rotation retention', 3);

  const cmp = buildDeterministicComparison(doc1, doc2, ctx1, ctx2, 'Key rotation and audit retention');
  assert.equal(cmp.doc_1.doc_id, doc1.doc_id);
  assert.equal(cmp.doc_2.doc_id, doc2.doc_id);
  assert.ok(cmp.conflicts.length >= 2);
  assert.ok(cmp.similarities.length >= 2);
  assert.ok(cmp.differences.length >= 2);
});

test('buildStructuredSummary generates distinct formatted summaries, key points, and action items for each format', () => {
  const chunks = chunkDocumentText(
    INITIAL_SEED_RAW_DOCS[0].doc_id,
    INITIAL_SEED_RAW_DOCS[0].filename,
    INITIAL_SEED_RAW_DOCS[0].rawText
  ).chunks;
  const contexts = retrieveTopChunks(chunks, 'RRF latency encryption', 4);

  const execRes = buildStructuredSummary(
    INITIAL_SEED_RAW_DOCS[0].filename,
    contexts,
    'executive_brief',
    null
  );
  const bulletRes = buildStructuredSummary(
    INITIAL_SEED_RAW_DOCS[0].filename,
    contexts,
    'bullet_highlights',
    'latency and encryption'
  );
  const deepRes = buildStructuredSummary(
    INITIAL_SEED_RAW_DOCS[0].filename,
    contexts,
    'technical_deep_dive',
    null
  );

  assert.ok(execRes.summary.includes('Executive Brief'));
  assert.ok(bulletRes.summary.includes('Rapid Bullet Highlights'));
  assert.ok(bulletRes.summary.includes('latency and encryption'));
  assert.ok(deepRes.summary.includes('| Section / Subsystem |'));
  assert.notEqual(execRes.summary, bulletRes.summary);
  assert.notEqual(bulletRes.summary, deepRes.summary);
  assert.ok(execRes.key_points.length >= 3);
  assert.ok(execRes.action_items.length >= 3);
});

test('sanitizeRawDocumentText and chunkDocumentText strip raw PDF objects/streams and extract clean human-readable sections', () => {
  const rawPdfDump = `1 0 obj << /Producer (pypdf) /Title (Section 6 \\055 SOA Hackathon \\055 23 Team Problems) >> endobj
2 0 obj << /Type /Pages /Count 27 /Kids [ 4 0 R 9 0 R ] >> endobj
4 0 obj << /Contents 5 0 R /MediaBox [ 0 0 595.2756 841.8898 ] /Resources << /Font 6 0 R /ProcSet [ /ImageB /ImageC /ImageI /PDF /Text ] >> /Type /Page >> endobj
21 0 obj << /A 20 0 R /Title (Team 1\\072 Parcel misroute interception) /Parent 22 0 R >> endobj
26 0 obj << /A 25 0 R /Title (Team 2\\072 Container seal discrepancy) /Prev 21 0 R >> endobj
30 0 obj << /A 29 0 R /Title (Team 3\\072 Vehicle axle load planner) /Prev 26 0 R >> endobj
112 0 obj << /Length 3853 >> stream
BT /F2 21 Tf 25.2 TL (Section 6: Hackathon problems) Tj T* ET
BT /F1 11 Tf 13.2 TL (SOA Programming and Microservices / 24SDCS03 / 23 teams) Tj T* ET
BT /F1 10 Tf 12 TL (Every challenge includes functional requirements, architecture, tests and demo.) Tj T* ET
BT /F1 8 Tf (Page 1 of 27) Tj T* ET
endstream endobj
115 0 obj << /Length 2470 >> stream
BT /F2 17 Tf 21 TL (Common requirements: architecture and security) Tj T* ET
BT /F2 10 Tf 13 TL (B1 / CO1 architecture) Tj T* ET
BT /F1 10 Tf 13 TL (Implement Auth plus the three named domain services as separate Spring Boot applications.) Tj T* (Use the named Kafka topic and event for a meaningful cross-service state transition.) Tj T* ET
BT /F1 8 Tf (Page 2 of 27) Tj T* ET
endstream endobj`;

  const { chunks, pageCount } = chunkDocumentText(
    'doc_soa_pdf',
    'DOC-20261022-WA0002 (2).pdf',
    rawPdfDump
  );

  assert.ok(chunks.length >= 2, 'Should extract clean chunks from PDF stream');
  assert.equal(pageCount, 2);

  for (const c of chunks) {
    assert.ok(!c.text.includes('endobj'), 'Chunk must not contain raw endobj');
    assert.ok(!c.text.includes('/MediaBox'), 'Chunk must not contain /MediaBox');
    assert.ok(!c.text.includes('/ProcSet'), 'Chunk must not contain /ProcSet');
    assert.ok(!c.text.includes(') Tj'), 'Chunk must not contain raw Tj operator');
  }

  const contexts = retrieveTopChunks(chunks, 'Spring Boot Kafka architecture hackathon', 4);
  const summary = buildStructuredSummary(
    'DOC-20261022-WA0002 (2).pdf',
    contexts,
    'executive_brief',
    null
  );

  assert.ok(summary.summary.includes('Spring Boot') || summary.summary.includes('Hackathon'));
  assert.ok(!summary.summary.includes('endobj'));
  assert.ok(!summary.summary.includes('/WinAnsiEncoding'));
});

test('buildSimpleLanguageSummary rewrites complex technical summaries into plain conversational explanations and analogies', () => {
  const chunks = chunkDocumentText(
    INITIAL_SEED_RAW_DOCS[0].doc_id,
    INITIAL_SEED_RAW_DOCS[0].filename,
    INITIAL_SEED_RAW_DOCS[0].rawText
  ).chunks;
  const contexts = retrieveTopChunks(chunks, 'Reciprocal Rank Fusion cross-encoder latency AES-256', 4);

  const techRes = buildStructuredSummary(
    INITIAL_SEED_RAW_DOCS[0].filename,
    contexts,
    'executive_brief',
    null
  );
  const simpleRes = buildSimpleLanguageSummary(
    INITIAL_SEED_RAW_DOCS[0].filename,
    contexts,
    'executive_brief',
    null
  );

  assert.ok(simpleRes.simple_summary.includes('In Simple Words'));
  assert.ok(simpleRes.simple_summary.includes('Plain-English Dictionary'));
  assert.notEqual(simpleRes.simple_summary, techRes.summary);
  assert.ok(simpleRes.simple_key_points.length >= 3);
  assert.ok(simpleRes.simple_key_points[0].startsWith('In Simple Terms'));
  assert.ok(simpleRes.simple_action_items.length >= 3);

  const simplifiedClause = simplifySentenceToPlainEnglish(
    'Passed through a cross-encoder reranker with a strict p95 latency budget of 180ms.'
  );
  assert.ok(simplifiedClause.includes('final relevance checker'));
  assert.ok(simplifiedClause.includes('fast response target of under 180ms'));
  assert.ok(CHAT_ROLE_PERSONAS.plain_language_coach.systemInstruction.includes('Simple Language Coach'));
});

test('parseCitationToken parses interactive citation tokens and buildPodcastEpisode configures Indian hosts and en-IN/hi-IN locales', () => {
  const ref1 = parseCitationToken('(Page 3)');
  assert.ok(ref1);
  assert.equal(ref1.page, 3);

  const ref2 = parseCitationToken('[p. 2 · Architecture & Security]');
  assert.ok(ref2);
  assert.equal(ref2.page, 2);
  assert.equal(ref2.section, 'Architecture & Security');

  const chunks = chunkDocumentText(
    INITIAL_SEED_RAW_DOCS[0].doc_id,
    INITIAL_SEED_RAW_DOCS[0].filename,
    INITIAL_SEED_RAW_DOCS[0].rawText
  ).chunks;
  const docRecord = {
    doc_id: INITIAL_SEED_RAW_DOCS[0].doc_id,
    filename: INITIAL_SEED_RAW_DOCS[0].filename,
    file_type: 'pdf' as const,
    file_size_bytes: 2048,
    upload_timestamp: '2026-10-24T12:00:00Z',
    indexed_at: '2026-10-24T12:00:00Z',
    chunk_count: chunks.length,
    page_count: 6,
    status: 'indexed' as const,
    summary_preview: '',
    tags: [],
  };

  const blrEpisode = buildPodcastEpisode([docRecord], chunks, docRecord.doc_id, 'deep_dive', 'bengaluru_tech');
  assert.equal(blrEpisode.hosts.host_a.name, 'Aarav Sharma');
  assert.equal(blrEpisode.hosts.host_b.name, 'Diya Patel');
  assert.equal(blrEpisode.voice_locale, 'en-IN');
  assert.ok(blrEpisode.turns[0].text.includes('Namaste'));

  const hinglishEpisode = buildPodcastEpisode([docRecord], chunks, docRecord.doc_id, 'deep_dive', 'hinglish_mentor');
  assert.equal(hinglishEpisode.hosts.host_a.name, 'Rohan Verma');
  assert.equal(hinglishEpisode.hosts.host_b.name, 'Kavya Nair');
  assert.equal(hinglishEpisode.voice_locale, 'hi-IN');
  assert.ok(hinglishEpisode.turns[0].text.includes('Bilkul') || hinglishEpisode.turns[0].text.includes('Namaste'));
});

