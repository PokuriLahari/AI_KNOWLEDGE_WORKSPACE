import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Network,
  GraduationCap,
  BarChart3,
  Mic,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  Download,
  Copy,
  Check,
  Volume2,
  Square,
  ArrowRight,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Search,
  Shuffle,
} from 'lucide-react';
import { DocumentItem } from '../lib/ragCore';
import {
  RadarAuditResponse,
  KnowledgeGraphResponse,
  GraphNode,
  GraphNodeCategory,
  StudyModuleResponse,
  DataExtractorResponse,
  PodcastEpisodeResponse,
  PodcastStyle,
  IndianVoicePreset,
} from '../lib/intelligenceSuite';
import { workspaceApi } from '../lib/apiClient';

export type IntelligenceModuleId = 'radar' | 'graph' | 'study' | 'extractor' | 'podcast';

interface IntelligenceSuiteViewProps {
  activeModule: IntelligenceModuleId;
  onSelectModule: (mod: IntelligenceModuleId) => void;
  documents: DocumentItem[];
  onInspectDocument: (docId: string) => void;
  onExplainConcept: (concept: string) => void;
  onAskQuestion: (question: string, docId?: string | null) => void;
  onNotify: (type: 'success' | 'error', message: string) => void;
}

const MODULE_TABS: Array<{
  id: IntelligenceModuleId;
  label: string;
  shortDesc: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    id: 'radar',
    label: 'Contradiction Radar',
    shortDesc: 'Cross-document policy & SLA conflict auditor',
    icon: ShieldAlert,
  },
  {
    id: 'graph',
    label: 'Knowledge Graph',
    shortDesc: 'Interactive concept, metric & citation map',
    icon: Network,
  },
  {
    id: 'study',
    label: 'Study & Quiz Mode',
    shortDesc: 'Interactive flip flashcards & grounded exam',
    icon: GraduationCap,
  },
  {
    id: 'extractor',
    label: 'Table & Chart Extractor',
    shortDesc: 'Quantitative benchmarks, charts & CSV export',
    icon: BarChart3,
  },
  {
    id: 'podcast',
    label: 'AI Podcast Studio',
    shortDesc: 'Two-host conversational deep dive & audio player',
    icon: Mic,
  },
];

export const IntelligenceSuiteView: React.FC<IntelligenceSuiteViewProps> = ({
  activeModule,
  onSelectModule,
  documents,
  onInspectDocument,
  onExplainConcept,
  onAskQuestion,
  onNotify,
}) => {
  // Shared document scope selector (`""` = All Documents, or specific `doc_id`)
  const [selectedDocId, setSelectedDocId] = useState<string>('');

  // 1. Radar state
  const [radarData, setRadarData] = useState<RadarAuditResponse | null>(null);
  const [radarFilter, setRadarFilter] = useState<'all' | 'contradiction' | 'warning' | 'verified'>('all');
  const [isLoadingRadar, setIsLoadingRadar] = useState(false);

  // 2. Knowledge Graph state
  const [graphData, setGraphData] = useState<KnowledgeGraphResponse | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [graphCategoryFilter, setGraphCategoryFilter] = useState<'all' | GraphNodeCategory>('all');
  const [isLoadingGraph, setIsLoadingGraph] = useState(false);

  // 3. Study & Exam state
  const [studyData, setStudyData] = useState<StudyModuleResponse | null>(null);
  const [studySubMode, setStudySubMode] = useState<'flashcards' | 'quiz'>('flashcards');
  const [activeCardIdx, setActiveCardIdx] = useState(0);
  const [isCardFlipped, setIsCardFlipped] = useState(false);
  const [masteredCards, setMasteredCards] = useState<Record<string, boolean>>({});
  const [quizAnswers, setQuizAnswers] = useState<Record<string, number>>({});
  const [isLoadingStudy, setIsLoadingStudy] = useState(false);

  // 4. Data Table & Chart Extractor state
  const [extractorData, setExtractorData] = useState<DataExtractorResponse | null>(null);
  const [activeChartGroupId, setActiveChartGroupId] = useState<string>('');
  const [tableSearch, setTableSearch] = useState('');
  const [copiedTable, setCopiedTable] = useState(false);
  const [isLoadingExtractor, setIsLoadingExtractor] = useState(false);

  // 5. Two-Host Podcast Studio state (Indian Voice & Accent Edition)
  const [podcastData, setPodcastData] = useState<PodcastEpisodeResponse | null>(null);
  const [podcastDocId, setPodcastDocId] = useState<string>(documents[0]?.doc_id || '');
  const [podcastStyle, setPodcastStyle] = useState<PodcastStyle>('deep_dive');
  const [indianVoicePreset, setIndianVoicePreset] = useState<IndianVoicePreset>('bengaluru_tech');
  const [detectedIndianVoiceName, setDetectedIndianVoiceName] = useState<string>(
    'Indian English (en-IN) Neural Synthesizer'
  );
  const [studioAudioUrl, setStudioAudioUrl] = useState<string | null>(null);
  const [isSynthesizingStudioAudio, setIsSynthesizingStudioAudio] = useState<boolean>(false);
  const [isGeneratingPodcast, setIsGeneratingPodcast] = useState(false);
  const [isPlayingPodcast, setIsPlayingPodcast] = useState(false);
  const [activeTurnIdx, setActiveTurnIdx] = useState<number>(0);
  const [speechRate, setSpeechRate] = useState<number>(1.0);

  useEffect(() => {
    if (!podcastDocId && documents.length > 0) {
      setPodcastDocId(documents[0].doc_id);
    }
  }, [documents, podcastDocId]);

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const updateIndianVoices = () => {
      const voices = window.speechSynthesis.getVoices() || [];
      const indianVoice = voices.find(
        (v) =>
          v.lang.toLowerCase().includes('en-in') ||
          v.lang.toLowerCase().includes('hi-in') ||
          /india|rishi|lekha|veena|ravi|heera|prabhat|neerja|swara|madhur|हिन्दी/i.test(v.name)
      );
      if (indianVoice) {
        setDetectedIndianVoiceName(`${indianVoice.name} (${indianVoice.lang})`);
      }
    };
    updateIndianVoices();
    window.speechSynthesis.onvoiceschanged = updateIndianVoices;
    return () => {
      window.speechSynthesis.cancel();
    };
  }, []);

  const loadRadar = async (docId: string, showToast = false) => {
    setIsLoadingRadar(true);
    try {
      const res = await workspaceApi.getRadarAudit(docId || null);
      setRadarData(res);
      if (showToast) {
        onNotify(
          'success',
          `Completed workspace audit across ${res.total_scanned_documents} document(s).`
        );
      }
    } catch (err: any) {
      onNotify('error', err?.message || 'Failed to run contradiction radar.');
    } finally {
      setIsLoadingRadar(false);
    }
  };

  const loadGraph = async (docId: string, showToast = false) => {
    setIsLoadingGraph(true);
    try {
      const res = await workspaceApi.getKnowledgeGraph(docId || null);
      setGraphData(res);
      if (res.nodes.length > 0) {
        setSelectedNodeId(res.nodes[0].id);
      }
      if (showToast) {
        onNotify('success', `Mapped ${res.nodes.length} nodes and ${res.edges.length} citation links.`);
      }
    } catch (err: any) {
      onNotify('error', err?.message || 'Failed to build knowledge graph.');
    } finally {
      setIsLoadingGraph(false);
    }
  };

  const loadStudy = async (docId: string, showToast = false) => {
    setIsLoadingStudy(true);
    try {
      const res = await workspaceApi.getStudyModule(docId || null);
      setStudyData(res);
      setActiveCardIdx(0);
      setIsCardFlipped(false);
      setQuizAnswers({});
      if (showToast) {
        onNotify(
          'success',
          `Generated ${res.flashcards.length} flashcards & ${res.quiz_questions.length} exam questions.`
        );
      }
    } catch (err: any) {
      onNotify('error', err?.message || 'Failed to generate study deck.');
    } finally {
      setIsLoadingStudy(false);
    }
  };

  const loadExtractor = async (docId: string, showToast = false) => {
    setIsLoadingExtractor(true);
    try {
      const res = await workspaceApi.getDataExtractor(docId || null);
      setExtractorData(res);
      if (res.chart_groups.length > 0) {
        setActiveChartGroupId(res.chart_groups[0].id);
      }
      if (showToast) {
        onNotify('success', `Extracted ${res.extracted_rows.length} quantitative metrics & tables.`);
      }
    } catch (err: any) {
      onNotify('error', err?.message || 'Failed to extract metrics.');
    } finally {
      setIsLoadingExtractor(false);
    }
  };

  const loadPodcast = async (
    docId: string,
    style: PodcastStyle,
    showToast = false,
    voicePresetOverride?: IndianVoicePreset
  ) => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsPlayingPodcast(false);
    setStudioAudioUrl(null);
    setIsGeneratingPodcast(true);
    const activeVoice = voicePresetOverride || indianVoicePreset;
    try {
      const res = await workspaceApi.generatePodcastEpisode({
        document_id: docId || documents[0]?.doc_id || null,
        style,
        voice_preset: activeVoice,
      });
      setPodcastData(res);
      setActiveTurnIdx(0);
      if (showToast) {
        onNotify(
          'success',
          `Generated Indian two-host podcast episode (${res.hosts.host_a.name} & ${res.hosts.host_b.name}) for "${res.filename}".`
        );
      }
    } catch (err: any) {
      onNotify('error', err?.message || 'Failed to generate podcast script.');
    } finally {
      setIsGeneratingPodcast(false);
    }
  };

  // Load active module data on mount or module change
  useEffect(() => {
    if (activeModule === 'radar' && !radarData && !isLoadingRadar) {
      loadRadar(selectedDocId, false);
    } else if (activeModule === 'graph' && !graphData && !isLoadingGraph) {
      loadGraph(selectedDocId, false);
    } else if (activeModule === 'study' && !studyData && !isLoadingStudy) {
      loadStudy(selectedDocId, false);
    } else if (activeModule === 'extractor' && !extractorData && !isLoadingExtractor) {
      loadExtractor(selectedDocId, false);
    } else if (activeModule === 'podcast' && !podcastData && !isGeneratingPodcast) {
      loadPodcast(
        podcastDocId || documents[0]?.doc_id || '',
        podcastStyle,
        false,
        indianVoicePreset
      );
    }
  }, [activeModule, documents.length]);

  const handleScopeDocChange = (newDocId: string) => {
    setSelectedDocId(newDocId);
    if (activeModule === 'radar') loadRadar(newDocId, true);
    if (activeModule === 'graph') loadGraph(newDocId, true);
    if (activeModule === 'study') loadStudy(newDocId, true);
    if (activeModule === 'extractor') loadExtractor(newDocId, true);
  };

  // Podcast Indian dual-voice playback handler
  const stopPodcastPlayback = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsPlayingPodcast(false);
  };

  const playPodcastFromTurn = (startIdx: number) => {
    if (!podcastData || podcastData.turns.length === 0) return;
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      onNotify('error', 'Web Speech synthesis is not supported in this browser.');
      return;
    }
    window.speechSynthesis.cancel();
    setIsPlayingPodcast(true);

    const allVoices = window.speechSynthesis.getVoices() || [];
    const indianVoices = allVoices.filter(
      (v) =>
        v.lang.toLowerCase().includes('en-in') ||
        v.lang.toLowerCase().includes('hi-in') ||
        /india|rishi|lekha|veena|ravi|heera|prabhat|neerja|swara|madhur|हिन्दी/i.test(v.name)
    );

    const maleIndianVoice =
      indianVoices.find((v) => /rishi|ravi|prabhat|madhur|male/i.test(v.name)) ||
      indianVoices[0] ||
      allVoices.find((v) => v.lang.toLowerCase().startsWith('en'));

    const femaleIndianVoice =
      indianVoices.find((v) => /lekha|veena|heera|neerja|swara|हिन्दी|female/i.test(v.name)) ||
      indianVoices[1] ||
      indianVoices[0] ||
      allVoices.find((v) => v.lang.toLowerCase().startsWith('en'));

    const speakTurn = (idx: number) => {
      if (!podcastData || idx >= podcastData.turns.length) {
        setIsPlayingPodcast(false);
        return;
      }
      setActiveTurnIdx(idx);
      const turn = podcastData.turns[idx];
      const isMaleHost = turn.speaker_gender === 'male' || idx % 2 === 0;
      const u = new SpeechSynthesisUtterance(`${turn.speaker} says: ${turn.text}`);
      u.lang = indianVoicePreset === 'hinglish_mentor' ? 'hi-IN' : 'en-IN';
      if (isMaleHost && maleIndianVoice) {
        u.voice = maleIndianVoice;
      } else if (!isMaleHost && femaleIndianVoice) {
        u.voice = femaleIndianVoice;
      }
      u.rate = speechRate;
      u.pitch = isMaleHost ? 0.94 : 1.14;
      u.onend = () => {
        speakTurn(idx + 1);
      };
      u.onerror = () => {
        setIsPlayingPodcast(false);
      };
      window.speechSynthesis.speak(u);
    };

    speakTurn(startIdx);
  };

  const handleSynthesizeGeminiIndianAudio = async () => {
    if (!podcastData || podcastData.turns.length === 0) return;
    setIsSynthesizingStudioAudio(true);
    try {
      const res = await workspaceApi.synthesizePodcastAudio({
        turns: podcastData.turns,
        voice_preset: indianVoicePreset,
        host_a_name: podcastData.hosts.host_a.name,
        host_b_name: podcastData.hosts.host_b.name,
      });
      if (res.audio_data_url) {
        setStudioAudioUrl(res.audio_data_url);
        onNotify(
          'success',
          `Synthesized Indian English studio WAV via ${res.model} (${res.voice_locale}).`
        );
      } else {
        playPodcastFromTurn(activeTurnIdx);
        onNotify(
          'success',
          `Playing Indian voice episode (${res.voice_locale} · ${podcastData.hosts.host_a.name} & ${podcastData.hosts.host_b.name}).`
        );
      }
    } catch {
      playPodcastFromTurn(activeTurnIdx);
    } finally {
      setIsSynthesizingStudioAudio(false);
    }
  };

  const handleDownloadCsv = () => {
    if (!extractorData) return;
    const blob = new Blob([extractorData.csv_export], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Workspace_Extracted_Metrics.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    onNotify('success', 'Downloaded extracted data table as CSV.');
  };

  const handleDownloadPodcastMd = () => {
    if (!podcastData) return;
    const blob = new Blob([podcastData.markdown_transcript], {
      type: 'text/markdown;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${podcastData.filename.replace(/[^a-zA-Z0-9_-]/g, '_')}_Podcast_Transcript.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    onNotify('success', 'Exported two-host podcast transcript (.md).');
  };

  const selectedGraphNode: GraphNode | undefined =
    graphData?.nodes.find((n) => n.id === selectedNodeId) || graphData?.nodes[0];

  const currentFlashcard = studyData?.flashcards[activeCardIdx];
  const masteredCount = Object.values(masteredCards).filter(Boolean).length;

  const totalQuizAnswered = Object.keys(quizAnswers).length;
  const totalQuizCorrect =
    studyData?.quiz_questions.filter((q) => quizAnswers[q.id] === q.correct_index).length || 0;

  const activeChartGroup =
    extractorData?.chart_groups.find((g) => g.id === activeChartGroupId) ||
    extractorData?.chart_groups[0];

  const filteredTableRows =
    extractorData?.extracted_rows.filter(
      (r) =>
        !tableSearch.trim() ||
        r.metric_name.toLowerCase().includes(tableSearch.toLowerCase()) ||
        r.category.toLowerCase().includes(tableSearch.toLowerCase()) ||
        r.filename.toLowerCase().includes(tableSearch.toLowerCase()) ||
        r.value.toLowerCase().includes(tableSearch.toLowerCase())
    ) || [];

  return (
    <div className="max-w-[1260px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Top Header & 5-Module Switcher Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800 pb-5">
        <div className="space-y-1">
          <div className="text-xs font-medium text-[#4338CA] dark:text-indigo-300">
            Unique Document Intelligence Suite · 5 Interactive Modules
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            {MODULE_TABS.find((t) => t.id === activeModule)?.label}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {MODULE_TABS.find((t) => t.id === activeModule)?.shortDesc} — strictly grounded in your indexed workspace files.
          </p>
        </div>

        {/* Document Scope Selector (for Radar, Graph, Study, Extractor) */}
        {activeModule !== 'podcast' && (
          <div className="flex items-center gap-2.5 self-start lg:self-auto">
            <label
              htmlFor="suite-doc-scope"
              className="text-xs font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap"
            >
              Document Scope:
            </label>
            <select
              id="suite-doc-scope"
              value={selectedDocId}
              onChange={(e) => handleScopeDocChange(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-[#C7D2FE] dark:border-slate-700 bg-[#EEF2FF]/70 dark:bg-[#11141D] text-xs font-medium text-[#312E81] dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#C7D2FE]"
            >
              <option value="">All Indexed Documents ({documents.length} files)</option>
              {documents.map((d) => (
                <option key={d.doc_id} value={d.doc_id}>
                  {d.filename} ({d.page_count}p)
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* 5-Module Pastel Segmented Switcher */}
      <div
        role="tablist"
        aria-label="Unique Document Intelligence Modules"
        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5"
      >
        {MODULE_TABS.map((tab) => {
          const Icon = tab.icon;
          const isSelected = activeModule === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isSelected}
              onClick={() => onSelectModule(tab.id)}
              className={`flex flex-col items-start gap-1 p-3 rounded-xl border text-left transition-all cursor-pointer ${
                isSelected
                  ? 'bg-[#E0E7FF] dark:bg-indigo-950/60 border-[#A5B4FC] dark:border-indigo-700 text-[#312E81] dark:text-indigo-200 shadow-2xs'
                  : 'bg-white dark:bg-[#11141D] border-slate-200/90 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-[#F5F7FF] dark:hover:bg-slate-800/60'
              }`}
            >
              <div className="flex items-center gap-2 w-full justify-between">
                <span className="text-xs font-semibold truncate">{tab.label}</span>
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    isSelected ? 'text-[#4338CA] dark:text-indigo-300' : 'text-slate-400'
                  }`}
                />
              </div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1">
                {tab.shortDesc}
              </span>
            </button>
          );
        })}
      </div>

      {/* =====================================================================
          MODULE 1: CONTRADICTION & RED-FLAG RADAR
      ===================================================================== */}
      {activeModule === 'radar' && (
        <div className="space-y-6">
          {/* Summary Banner & Filter Controls */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11141D] p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Automated Cross-Document Governance & Conflict Audit
                <span aria-hidden="true"> · </span>
                <span>{radarData?.total_scanned_documents || documents.length} Documents</span>
                <span aria-hidden="true"> · </span>
                <span>{radarData?.total_scanned_chunks || 0} Chunks Verified</span>
                <span aria-hidden="true"> · </span>
                <span className="font-mono font-semibold text-[#312E81] dark:text-indigo-300">
                  Governance Score: {radarData?.governance_score || 84}/100
                </span>
              </div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Detected Policy Contradictions, Architectural Warnings & Verified Guardrails
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-[#0B0D13] border border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setRadarFilter('all')}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    radarFilter === 'all'
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  All ({radarData?.findings.length || 0})
                </button>
                <button
                  type="button"
                  onClick={() => setRadarFilter('contradiction')}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    radarFilter === 'contradiction'
                      ? 'bg-[#FFE4E6] text-[#9F1239]'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Contradictions ({radarData?.counts.contradictions || 0})
                </button>
                <button
                  type="button"
                  onClick={() => setRadarFilter('warning')}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    radarFilter === 'warning'
                      ? 'bg-[#FEF3C7] text-[#92400E]'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Warnings ({radarData?.counts.warnings || 0})
                </button>
                <button
                  type="button"
                  onClick={() => setRadarFilter('verified')}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    radarFilter === 'verified'
                      ? 'bg-[#D1FAE5] text-[#065F46]'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Verified ({radarData?.counts.verified || 0})
                </button>
              </div>

              <button
                type="button"
                onClick={() => loadRadar(selectedDocId, true)}
                disabled={isLoadingRadar}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#E0E7FF] hover:bg-[#C7D2FE] text-[#312E81] border border-[#C7D2FE] text-xs font-semibold transition-colors cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingRadar ? 'animate-spin' : ''}`} />
                <span>Re-Scan Workspace</span>
              </button>
            </div>
          </div>

          {/* Radar Findings List */}
          <div className="space-y-4">
            {(radarData?.findings || [])
              .filter((f) => radarFilter === 'all' || f.severity === radarFilter)
              .map((finding) => {
                const isConflict = finding.severity === 'contradiction';
                const isWarn = finding.severity === 'warning';
                const surfaceClass = isConflict
                  ? 'bg-[#FFF5F6] dark:bg-rose-950/20 border-[#FECDD3] dark:border-rose-800/50'
                  : isWarn
                  ? 'bg-[#FFFBEB] dark:bg-amber-950/20 border-[#FDE68A] dark:border-amber-800/50'
                  : 'bg-[#F0FDF4] dark:bg-emerald-950/20 border-[#A7F3D0] dark:border-emerald-800/50';

                const labelColor = isConflict
                  ? 'text-[#9F1239] dark:text-rose-300'
                  : isWarn
                  ? 'text-[#92400E] dark:text-amber-300'
                  : 'text-[#065F46] dark:text-emerald-300';

                return (
                  <div
                    key={finding.id}
                    className={`rounded-xl border p-5 space-y-4 transition-colors ${surfaceClass}`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="space-y-1">
                        <div className={`text-xs font-semibold flex items-center gap-1.5 ${labelColor}`}>
                          {isConflict ? (
                            <AlertOctagon className="w-3.5 h-3.5 shrink-0" />
                          ) : isWarn ? (
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          ) : (
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                          )}
                          <span>
                            {isConflict
                              ? 'High-Priority Policy Contradiction'
                              : isWarn
                              ? 'Operational & Architecture Warning'
                              : 'Verified Control & Guardrail'}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{finding.category}</span>
                        </div>
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {finding.title}
                        </h3>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          onAskQuestion(
                            `Explain how to resolve: ${finding.title}`,
                            finding.left_evidence.doc_id
                          )
                        }
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/90 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-medium text-[#312E81] dark:text-indigo-300 hover:bg-[#EEF2FF] transition-colors cursor-pointer self-start"
                      >
                        <span>Ask AI Assistant</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>

                    <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                      {finding.summary}
                    </p>

                    {/* Side-by-Side Grounded Evidence Comparison */}
                    <div
                      className={`grid grid-cols-1 ${
                        finding.right_evidence ? 'md:grid-cols-2' : ''
                      } gap-3`}
                    >
                      <div className="rounded-lg bg-white/90 dark:bg-[#0D1017] border border-slate-200/80 dark:border-slate-800 p-3.5 space-y-1.5">
                        <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
                          <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                            {finding.left_evidence.filename}
                          </span>
                          <button
                            type="button"
                            onClick={() => onInspectDocument(finding.left_evidence.doc_id)}
                            className="text-[#4338CA] dark:text-indigo-400 hover:underline font-mono shrink-0 cursor-pointer"
                          >
                            Page {finding.left_evidence.page} · Inspect
                          </button>
                        </div>
                        <div className="text-[11px] font-medium text-slate-500">
                          Section: {finding.left_evidence.section}
                        </div>
                        <p className="text-xs text-slate-700 dark:text-slate-300 italic">
                          "{finding.left_evidence.quote}"
                        </p>
                      </div>

                      {finding.right_evidence && (
                        <div className="rounded-lg bg-white/90 dark:bg-[#0D1017] border border-slate-200/80 dark:border-slate-800 p-3.5 space-y-1.5">
                          <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
                            <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                              {finding.right_evidence.filename}
                            </span>
                            <button
                              type="button"
                              onClick={() => onInspectDocument(finding.right_evidence!.doc_id)}
                              className="text-[#4338CA] dark:text-indigo-400 hover:underline font-mono shrink-0 cursor-pointer"
                            >
                              Page {finding.right_evidence.page} · Inspect
                            </button>
                          </div>
                          <div className="text-[11px] font-medium text-slate-500">
                            Section: {finding.right_evidence.section}
                          </div>
                          <p className="text-xs text-slate-700 dark:text-slate-300 italic">
                            "{finding.right_evidence.quote}"
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800/60 text-xs text-slate-700 dark:text-slate-300">
                      <span className="font-semibold text-slate-900 dark:text-slate-100">
                        Recommended Engineering Remediation:{' '}
                      </span>
                      {finding.remediation}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* =====================================================================
          MODULE 2: INTERACTIVE VISUAL KNOWLEDGE GRAPH
      ===================================================================== */}
      {activeModule === 'graph' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Interactive SVG Concept & Citation Canvas (8 cols) */}
          <div className="lg:col-span-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11141D] p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Interactive Cross-Document Concept & Citation Map
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Click any node to highlight connected documents and inspect exact page citations.
                </p>
              </div>

              <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-[#0B0D13] border border-slate-200 dark:border-slate-800">
                {(['all', 'document', 'concept', 'metric', 'control'] as const).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setGraphCategoryFilter(cat)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium capitalize transition-colors cursor-pointer ${
                      graphCategoryFilter === cat
                        ? 'bg-[#E0E7FF] text-[#312E81]'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Interactive SVG Canvas */}
            <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-[#FAF9F5] dark:bg-[#0B0D13] overflow-hidden">
              <svg
                viewBox="0 0 920 540"
                className="w-full h-[420px] sm:h-[460px] select-none"
                role="img"
                aria-label="Interactive Knowledge Graph connecting documents, concepts, metrics, and security controls"
              >
                <defs>
                  <radialGradient id="pastelGlow" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#E0E7FF" stopOpacity="0.65" />
                    <stop offset="100%" stopColor="#FAF9F5" stopOpacity="0" />
                  </radialGradient>
                </defs>
                <circle cx="460" cy="270" r="240" fill="url(#pastelGlow)" />

                {/* Edges */}
                {(graphData?.edges || []).map((edge) => {
                  const sourceNode = graphData?.nodes.find((n) => n.id === edge.source);
                  const targetNode = graphData?.nodes.find((n) => n.id === edge.target);
                  if (!sourceNode || !targetNode) return null;
                  const isHighlighted =
                    selectedNodeId === edge.source || selectedNodeId === edge.target;
                  const midX = (sourceNode.x + targetNode.x) / 2;
                  const midY = (sourceNode.y + targetNode.y) / 2;

                  return (
                    <g key={edge.id}>
                      <line
                        x1={sourceNode.x}
                        y1={sourceNode.y}
                        x2={targetNode.x}
                        y2={targetNode.y}
                        stroke={isHighlighted ? '#818CF8' : '#CBD5E1'}
                        strokeWidth={isHighlighted ? 2.5 : 1.2}
                        strokeDasharray={isHighlighted ? undefined : '4 4'}
                      />
                      {isHighlighted && (
                        <text
                          x={midX}
                          y={midY - 6}
                          textAnchor="middle"
                          fontSize="10"
                          fill="#4338CA"
                          fontWeight="600"
                        >
                          {edge.relationship}
                        </text>
                      )}
                    </g>
                  );
                })}

                {/* Nodes */}
                {(graphData?.nodes || [])
                  .filter(
                    (n) => graphCategoryFilter === 'all' || n.category === graphCategoryFilter
                  )
                  .map((node) => {
                    const isSelected = selectedGraphNode?.id === node.id;
                    const palette: Record<
                      GraphNodeCategory,
                      { fill: string; stroke: string; text: string }
                    > = {
                      document: { fill: '#E0E7FF', stroke: '#818CF8', text: '#312E81' },
                      concept: { fill: '#EDE9FE', stroke: '#A78BFA', text: '#4C1D95' },
                      metric: { fill: '#FEF3C7', stroke: '#FBBF24', text: '#92400E' },
                      control: { fill: '#D1FAE5', stroke: '#34D399', text: '#065F46' },
                    };
                    const colors = palette[node.category];

                    return (
                      <g
                        key={node.id}
                        transform={`translate(${node.x}, ${node.y})`}
                        onClick={() => setSelectedNodeId(node.id)}
                        className="cursor-pointer"
                      >
                        {isSelected && (
                          <circle
                            r={node.radius + 7}
                            fill="none"
                            stroke={colors.stroke}
                            strokeWidth="2"
                            strokeDasharray="3 3"
                          />
                        )}
                        <circle
                          r={node.radius}
                          fill={colors.fill}
                          stroke={colors.stroke}
                          strokeWidth={isSelected ? 2.8 : 1.8}
                        />
                        <text
                          y={node.radius + 15}
                          textAnchor="middle"
                          fontSize="11"
                          fontWeight={isSelected ? '700' : '600'}
                          fill="#1E293B"
                        >
                          {node.label}
                        </text>
                        <text
                          y="4"
                          textAnchor="middle"
                          fontSize="9"
                          fontWeight="700"
                          fill={colors.text}
                        >
                          {node.category.slice(0, 3).toUpperCase()}
                        </text>
                      </g>
                    );
                  })}
              </svg>
            </div>

            {/* Pastel Legend */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 pt-1">
              <div className="flex flex-wrap items-center gap-4">
                <span>DOC = Indexed File (Pastel Indigo)</span>
                <span>·</span>
                <span>CON = Technical Concept (Pastel Lavender)</span>
                <span>·</span>
                <span>MET = Quantitative SLA (Pastel Peach)</span>
                <span>·</span>
                <span>CTL = Security Control (Pastel Mint)</span>
              </div>
            </div>
          </div>

          {/* Right Node Citation Inspector Panel (4 cols) */}
          <div className="lg:col-span-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11141D] p-5 space-y-4">
            {selectedGraphNode ? (
              <>
                <div className="space-y-1 border-b border-slate-200 dark:border-slate-800 pb-3">
                  <div className="text-xs font-medium text-[#4338CA] dark:text-indigo-300 capitalize">
                    Selected {selectedGraphNode.category} Node · {selectedGraphNode.mentions.length}{' '}
                    Citation(s)
                  </div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    {selectedGraphNode.label}
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    {selectedGraphNode.summary}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onExplainConcept(selectedGraphNode.label)}
                    className="flex-1 py-2 px-3 rounded-lg bg-[#E0E7FF] hover:bg-[#C7D2FE] text-[#312E81] text-xs font-semibold transition-colors cursor-pointer text-center"
                  >
                    Deep-Dive Explain
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onAskQuestion(
                        `How is ${selectedGraphNode.label} specified across our documents?`,
                        null
                      )
                    }
                    className="flex-1 py-2 px-3 rounded-lg bg-[#EDE9FE] hover:bg-[#DDD6FE] text-[#4C1D95] text-xs font-semibold transition-colors cursor-pointer text-center"
                  >
                    Ask Assistant
                  </button>
                </div>

                <div className="space-y-2.5 pt-2">
                  <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    Grounded Document Mentions & Pages
                  </div>
                  {selectedGraphNode.mentions.map((m, i) => (
                    <div
                      key={`${m.doc_id}_${m.page}_${i}`}
                      className="rounded-lg border border-slate-200/90 dark:border-slate-800 bg-[#FAF9F5] dark:bg-[#0D1017] p-3 space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                          {m.filename}
                        </span>
                        <button
                          type="button"
                          onClick={() => onInspectDocument(m.doc_id)}
                          className="font-mono text-[#4338CA] dark:text-indigo-400 hover:underline shrink-0 cursor-pointer"
                        >
                          Page {m.page}
                        </button>
                      </div>
                      <div className="text-[11px] text-slate-500">Section: {m.section}</div>
                      <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-3">
                        {m.excerpt}
                      </p>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-xs text-slate-500 py-8 text-center">
                Select any node in the graph to inspect its document citations.
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          MODULE 3: STUDY & EXAM MODE (FLASHCARDS + GROUNDED QUIZ)
      ===================================================================== */}
      {activeModule === 'study' && (
        <div className="space-y-6">
          {/* Sub-mode Toggle Bar */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11141D] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setStudySubMode('flashcards')}
                className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  studySubMode === 'flashcards'
                    ? 'bg-[#E0E7FF] text-[#312E81] border border-[#C7D2FE]'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100'
                }`}
              >
                Interactive Flip Flashcards ({studyData?.flashcards.length || 0})
              </button>
              <button
                type="button"
                onClick={() => setStudySubMode('quiz')}
                className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  studySubMode === 'quiz'
                    ? 'bg-[#EDE9FE] text-[#4C1D95] border border-[#DDD6FE]'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100'
                }`}
              >
                Grounded Multiple-Choice Exam ({studyData?.quiz_questions.length || 0} Questions)
              </button>
            </div>

            <div className="text-xs text-slate-500 dark:text-slate-400">
              <span>Scope: {studyData?.scope_title}</span>
              <span aria-hidden="true"> · </span>
              <span className="font-mono font-semibold text-[#065F46] dark:text-emerald-300">
                {studySubMode === 'flashcards'
                  ? `Mastered: ${masteredCount}/${studyData?.flashcards.length || 0}`
                  : `Score: ${totalQuizCorrect}/${studyData?.quiz_questions.length || 0}`}
              </span>
            </div>
          </div>

          {studySubMode === 'flashcards' && currentFlashcard && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Main Interactive Flip Card (8 cols) */}
              <div className="lg:col-span-8 space-y-4">
                <div
                  onClick={() => setIsCardFlipped((prev) => !prev)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setIsCardFlipped((prev) => !prev);
                    }
                  }}
                  aria-label="Flip study flashcard"
                  className={`min-h-[290px] rounded-2xl border p-7 flex flex-col justify-between transition-all cursor-pointer select-none ${
                    isCardFlipped
                      ? 'bg-[#F0FDF4] dark:bg-emerald-950/25 border-[#A7F3D0] dark:border-emerald-800/60'
                      : 'bg-[#EEF2FF] dark:bg-indigo-950/25 border-[#C7D2FE] dark:border-indigo-800/60'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400">
                    <span>
                      Card {activeCardIdx + 1} of {studyData?.flashcards.length} ·{' '}
                      {currentFlashcard.category}
                    </span>
                    <span className="font-semibold text-[#4338CA] dark:text-indigo-300">
                      {isCardFlipped ? 'Answer & Citation (Click to Flip)' : 'Question Prompt (Click to Flip)'}
                    </span>
                  </div>

                  <div className="my-auto py-6 space-y-3">
                    <div className="text-lg sm:text-xl font-semibold text-slate-900 dark:text-slate-100 leading-snug">
                      {isCardFlipped
                        ? currentFlashcard.back_answer
                        : currentFlashcard.front_question}
                    </div>
                    {isCardFlipped && (
                      <div className="pt-2 text-xs font-mono text-[#065F46] dark:text-emerald-300">
                        Key Rule / Formula: {currentFlashcard.key_rule}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-300/60 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400">
                    <span>
                      Source: {currentFlashcard.citation.filename} · Page{' '}
                      {currentFlashcard.citation.page} ({currentFlashcard.citation.section})
                    </span>
                    <span className="underline font-medium">Flip Card</span>
                  </div>
                </div>

                {/* Flashcard Controls */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsCardFlipped(false);
                        setActiveCardIdx((prev) =>
                          prev > 0 ? prev - 1 : (studyData?.flashcards.length || 1) - 1
                        );
                      }}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11141D] hover:bg-slate-50 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      <span>Previous</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsCardFlipped((prev) => !prev)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#E0E7FF] hover:bg-[#C7D2FE] text-[#312E81] text-xs font-semibold cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>{isCardFlipped ? 'Show Question' : 'Reveal Answer'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsCardFlipped(false);
                        setActiveCardIdx((prev) =>
                          prev + 1 < (studyData?.flashcards.length || 1) ? prev + 1 : 0
                        );
                      }}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11141D] hover:bg-slate-50 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
                    >
                      <span>Next</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setMasteredCards((prev) => ({
                        ...prev,
                        [currentFlashcard.id]: !prev[currentFlashcard.id],
                      }))
                    }
                    className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                      masteredCards[currentFlashcard.id]
                        ? 'bg-[#D1FAE5] text-[#065F46] border-[#A7F3D0]'
                        : 'bg-white dark:bg-[#11141D] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>
                      {masteredCards[currentFlashcard.id] ? 'Marked Mastered' : 'Mark as Mastered'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Deck Navigator List (4 cols) */}
              <div className="lg:col-span-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11141D] p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Flashcard Deck Queue
                  </h3>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCardFlipped(false);
                      setActiveCardIdx(
                        Math.floor(Math.random() * (studyData?.flashcards.length || 1))
                      );
                    }}
                    className="inline-flex items-center gap-1 text-xs font-medium text-[#4338CA] hover:underline cursor-pointer"
                  >
                    <Shuffle className="w-3 h-3" />
                    <span>Random Card</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {(studyData?.flashcards || []).map((fc, idx) => {
                    const isCurrent = idx === activeCardIdx;
                    const isDone = masteredCards[fc.id];
                    return (
                      <button
                        key={fc.id}
                        type="button"
                        onClick={() => {
                          setActiveCardIdx(idx);
                          setIsCardFlipped(false);
                        }}
                        className={`w-full text-left p-3 rounded-lg border text-xs transition-colors cursor-pointer ${
                          isCurrent
                            ? 'bg-[#EEF2FF] dark:bg-indigo-950/50 border-[#A5B4FC] text-[#312E81] dark:text-indigo-200 font-semibold'
                            : 'bg-[#FAF9F5] dark:bg-[#0D1017] border-slate-200/80 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 mb-1">
                          <span>
                            #{idx + 1} · {fc.category}
                          </span>
                          <span>{isDone ? 'Mastered ✓' : `p. ${fc.citation.page}`}</span>
                        </div>
                        <div className="line-clamp-2">{fc.front_question}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {studySubMode === 'quiz' && (
            <div className="space-y-4">
              {(studyData?.quiz_questions || []).map((q, qIdx) => {
                const chosen = quizAnswers[q.id];
                const isAnswered = chosen !== undefined;
                const isCorrect = chosen === q.correct_index;

                return (
                  <div
                    key={q.id}
                    className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11141D] p-5 space-y-4"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                      <span>
                        Question {qIdx + 1} of {studyData?.quiz_questions.length}
                      </span>
                      <span>
                        Citation: {q.citation.filename} · Page {q.citation.page}
                      </span>
                    </div>

                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {q.question}
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      {q.options.map((opt, optIdx) => {
                        const isThisSelected = chosen === optIdx;
                        const isThisCorrect = q.correct_index === optIdx;
                        let optionStyle =
                          'bg-[#FAF9F5] dark:bg-[#0D1017] border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 hover:bg-[#EEF2FF]/60';

                        if (isAnswered) {
                          if (isThisCorrect) {
                            optionStyle =
                              'bg-[#D1FAE5] dark:bg-emerald-950/40 border-[#6EE7B7] text-[#065F46] dark:text-emerald-200 font-semibold';
                          } else if (isThisSelected && !isThisCorrect) {
                            optionStyle =
                              'bg-[#FFE4E6] dark:bg-rose-950/40 border-[#FDA4AF] text-[#9F1239] dark:text-rose-200';
                          }
                        }

                        return (
                          <button
                            key={optIdx}
                            type="button"
                            onClick={() =>
                              setQuizAnswers((prev) => ({
                                ...prev,
                                [q.id]: optIdx,
                              }))
                            }
                            className={`p-3.5 rounded-lg border text-left text-xs transition-colors cursor-pointer ${optionStyle}`}
                          >
                            <span className="font-mono font-semibold mr-2">
                              {String.fromCharCode(65 + optIdx)}.
                            </span>
                            <span>{opt}</span>
                          </button>
                        );
                      })}
                    </div>

                    {isAnswered && (
                      <div
                        className={`p-3.5 rounded-lg border text-xs ${
                          isCorrect
                            ? 'bg-[#F0FDF4] border-[#A7F3D0] text-[#065F46]'
                            : 'bg-[#FFF5F6] border-[#FECDD3] text-[#9F1239]'
                        }`}
                      >
                        <div className="font-semibold mb-1">
                          {isCorrect ? 'Correct! Grounded Verification:' : 'Not quite — Grounded Explanation:'}
                        </div>
                        <div>{q.explanation}</div>
                      </div>
                    )}
                  </div>
                );
              })}

              {totalQuizAnswered > 0 && (
                <div className="flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => setQuizAnswers({})}
                    className="px-4 py-2 rounded-lg bg-[#E0E7FF] hover:bg-[#C7D2FE] text-[#312E81] text-xs font-semibold cursor-pointer"
                  >
                    Reset Exam Answers ({totalQuizCorrect}/{studyData?.quiz_questions.length} Correct)
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          MODULE 4: SMART DATA TABLE & CHART EXTRACTOR
      ===================================================================== */}
      {activeModule === 'extractor' && (
        <div className="space-y-6">
          {/* Interactive Visual Pastel Bar Chart Card */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11141D] p-5 space-y-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  {activeChartGroup?.title || 'Extracted Quantitative Benchmarks'}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {activeChartGroup?.description}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {(extractorData?.chart_groups || []).map((cg) => (
                  <button
                    key={cg.id}
                    type="button"
                    onClick={() => setActiveChartGroupId(cg.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      activeChartGroup?.id === cg.id
                        ? 'bg-[#E0E7FF] text-[#312E81] border border-[#C7D2FE]'
                        : 'bg-slate-100 dark:bg-[#0B0D13] text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {cg.title.split('(')[0].trim()}
                  </button>
                ))}
              </div>
            </div>

            {/* Horizontal Pastel Bars */}
            {activeChartGroup && (
              <div className="space-y-3.5 pt-2">
                {(() => {
                  const maxVal = Math.max(...activeChartGroup.bars.map((b) => b.value), 1);
                  const barPastelMap: Record<
                    string,
                    { fill: string; border: string; text: string }
                  > = {
                    indigo: { fill: '#E0E7FF', border: '#A5B4FC', text: '#312E81' },
                    violet: { fill: '#EDE9FE', border: '#C4B5FD', text: '#4C1D95' },
                    mint: { fill: '#D1FAE5', border: '#6EE7B7', text: '#065F46' },
                    amber: { fill: '#FEF3C7', border: '#FCD34D', text: '#92400E' },
                    rose: { fill: '#FFE4E6', border: '#FDA4AF', text: '#9F1239' },
                    sky: { fill: '#E0F2FE', border: '#7DD3FC', text: '#075985' },
                  };

                  return activeChartGroup.bars.map((bar, i) => {
                    const widthPct = Math.max(12, Math.round((bar.value / maxVal) * 100));
                    const p = barPastelMap[bar.color_token] || barPastelMap.indigo;
                    return (
                      <div key={i} className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <div className="font-medium text-slate-800 dark:text-slate-200">
                            {bar.label}
                            <span className="text-slate-400 mx-1.5">·</span>
                            <span className="text-slate-500 text-[11px]">{bar.secondary_note}</span>
                          </div>
                          <div className="font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                            {bar.formatted_value}{' '}
                            <span className="text-[11px] font-normal text-slate-400">
                              ({bar.filename}, p. {bar.page})
                            </span>
                          </div>
                        </div>
                        <div className="w-full h-7 rounded-lg bg-slate-100 dark:bg-[#0B0D13] overflow-hidden p-0.5">
                          <div
                            style={{
                              width: `${widthPct}%`,
                              backgroundColor: p.fill,
                              border: `1px solid ${p.border}`,
                              color: p.text,
                            }}
                            className="h-full rounded-md flex items-center px-2.5 text-[11px] font-mono font-semibold transition-all duration-300"
                          >
                            {bar.formatted_value}
                          </div>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            )}
          </div>

          {/* Extracted Specification Table + Export Controls */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11141D] p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Extracted Quantitative Metrics, SLAs & Tabular Benchmarks ({filteredTableRows.length})
                </h3>
                <p className="text-xs text-slate-500">
                  Every number below is automatically linked to its source document and page number.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={tableSearch}
                    onChange={(e) => setTableSearch(e.target.value)}
                    placeholder="Filter metrics or files..."
                    aria-label="Filter extracted metrics"
                    className="pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D13] text-xs"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (!extractorData) return;
                    navigator.clipboard.writeText(extractorData.csv_export);
                    setCopiedTable(true);
                    setTimeout(() => setCopiedTable(false), 2000);
                    onNotify('success', 'Copied extracted table to clipboard.');
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  {copiedTable ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedTable ? 'Copied' : 'Copy CSV'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleDownloadCsv}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#D1FAE5] hover:bg-[#A7F3D0] text-[#065F46] border border-[#A7F3D0] text-xs font-semibold cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download CSV</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                    <th className="py-2.5 pr-4 font-semibold">Metric / Parameter</th>
                    <th className="py-2.5 px-4 font-semibold">Extracted Value</th>
                    <th className="py-2.5 px-4 font-semibold">Category</th>
                    <th className="py-2.5 px-4 font-semibold">Source Citation</th>
                    <th className="py-2.5 pl-4 font-semibold">Grounded Context</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800/70">
                  {filteredTableRows.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/30">
                      <td className="py-3 pr-4 font-semibold text-slate-900 dark:text-slate-100">
                        {row.metric_name}
                      </td>
                      <td className="py-3 px-4 font-mono font-semibold text-[#312E81] dark:text-indigo-300 tabular-nums whitespace-nowrap">
                        {row.value}
                      </td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {row.category}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => onInspectDocument(row.doc_id)}
                          className="text-[#4338CA] dark:text-indigo-400 hover:underline font-mono cursor-pointer"
                        >
                          {row.filename} (p. {row.page})
                        </button>
                      </td>
                      <td className="py-3 pl-4 text-slate-600 dark:text-slate-400 max-w-xs truncate">
                        {row.context_snippet}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODULE 5: TWO-HOST AI PODCAST STUDIO (INDIAN VOICE EDITION)
      ===================================================================== */}
      {activeModule === 'podcast' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Podcast Studio Controls (4 cols) */}
          <div className="lg:col-span-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11141D] p-5 space-y-5">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-[#FEF3C7] text-[#92400E] border border-[#FCD34D] text-[11px] font-semibold">
                <span>🇮🇳 Indian Voice & Accent Studio (en-IN / hi-IN)</span>
              </div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 pt-1">
                Two-Host Indian Podcast Configuration
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Grounded conversational episode hosted by{' '}
                <strong>{podcastData?.hosts?.host_a?.name || 'Aarav Sharma'}</strong> &{' '}
                <strong>{podcastData?.hosts?.host_b?.name || 'Diya Patel'}</strong> in Indian English / Hinglish.
              </p>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="podcast-doc-select"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Source Document
              </label>
              <select
                id="podcast-doc-select"
                value={podcastDocId}
                onChange={(e) => {
                  const nextDoc = e.target.value;
                  setPodcastDocId(nextDoc);
                  loadPodcast(nextDoc, podcastStyle, true, indianVoicePreset);
                }}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0B0D13] text-xs font-medium text-slate-900 dark:text-slate-100"
              >
                {documents.map((d) => (
                  <option key={d.doc_id} value={d.doc_id}>
                    {d.filename} ({d.page_count}p)
                  </option>
                ))}
              </select>
            </div>

            {/* Indian Voice & Host Pair Selector */}
            <div className="space-y-1.5">
              <label
                htmlFor="podcast-indian-voice-select"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Indian Voice & Host Pair (en-IN / hi-IN)
              </label>
              <select
                id="podcast-indian-voice-select"
                value={indianVoicePreset}
                onChange={(e) => {
                  const nextPreset = e.target.value as IndianVoicePreset;
                  setIndianVoicePreset(nextPreset);
                  loadPodcast(podcastDocId, podcastStyle, true, nextPreset);
                }}
                className="w-full px-3 py-2 rounded-lg border border-[#FCD34D] dark:border-amber-700 bg-[#FFFBEB] dark:bg-[#0B0D13] text-xs font-semibold text-[#92400E] dark:text-amber-300"
              >
                <option value="bengaluru_tech">
                  Aarav & Diya · Indian English Tech Deep-Dive (en-IN · Bengaluru & Mumbai)
                </option>
                <option value="hinglish_mentor">
                  Rohan & Kavya · Conversational Hinglish Mentor (hi-IN / en-IN · Exam & Viva)
                </option>
                <option value="mumbai_executive">
                  Vikram & Ananya · Executive India Briefing (en-IN · Mumbai & Chennai)
                </option>
              </select>
              <div className="text-[11px] text-slate-500 flex items-center justify-between pt-0.5">
                <span>Active Voice Engine:</span>
                <span className="font-mono font-medium text-[#312E81] dark:text-indigo-300">
                  {detectedIndianVoiceName}
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <span className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Conversation Angle
              </span>
              <div className="space-y-2">
                {(
                  [
                    {
                      id: 'deep_dive',
                      label: 'Architecture & Engineering Deep Dive',
                      desc: 'Unpacks microservices, retrieval math, and system design',
                    },
                    {
                      id: 'debate',
                      label: 'Executive Risk & Trade-Off Debate',
                      desc: 'Probes SLA conflicts, key rotation, and governance gaps',
                    },
                    {
                      id: 'exam_prep',
                      label: 'Hackathon & Exam Prep Breakdown',
                      desc: 'Focuses on B1–B6 rules, CO1–CO4 grading, and test cases',
                    },
                  ] as const
                ).map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => {
                      setPodcastStyle(st.id);
                      loadPodcast(podcastDocId, st.id, true, indianVoicePreset);
                    }}
                    className={`w-full text-left p-3 rounded-lg border transition-colors cursor-pointer ${
                      podcastStyle === st.id
                        ? 'bg-[#E0E7FF] dark:bg-indigo-950/50 border-[#A5B4FC] text-[#312E81] dark:text-indigo-200'
                        : 'bg-[#FAF9F5] dark:bg-[#0B0D13] border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <div className="text-xs font-semibold">{st.label}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{st.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Indian Dual-Voice Audio Player Box */}
            <div className="rounded-xl border border-[#C7D2FE] dark:border-indigo-800/60 bg-[#EEF2FF]/80 dark:bg-indigo-950/30 p-4 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[#312E81] dark:text-indigo-200">
                  Indian Dual-Voice Audio Player ({podcastData?.voice_locale || 'en-IN'})
                </span>
                <span className="font-mono text-[11px] text-slate-500">
                  {podcastData?.duration_estimate || '2 min 45 sec'}
                </span>
              </div>

              <div className="flex flex-col gap-2">
                {!isPlayingPodcast ? (
                  <button
                    type="button"
                    onClick={() => playPodcastFromTurn(activeTurnIdx)}
                    className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-[#E0E7FF] hover:bg-[#C7D2FE] text-[#312E81] border border-[#A5B4FC] text-xs font-semibold cursor-pointer"
                  >
                    <Volume2 className="w-4 h-4" />
                    <span>
                      Play Episode Audio (Indian Voice · {podcastData?.voice_locale || 'en-IN'})
                    </span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={stopPodcastPlayback}
                    className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-[#FFE4E6] hover:bg-[#FECDD3] text-[#9F1239] border border-[#FDA4AF] text-xs font-semibold cursor-pointer"
                  >
                    <Square className="w-3.5 h-3.5" />
                    <span>Stop Audio Playback</span>
                  </button>
                )}

                <button
                  type="button"
                  disabled={isSynthesizingStudioAudio}
                  onClick={handleSynthesizeGeminiIndianAudio}
                  className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-[#FEF3C7] hover:bg-[#FDE68A] text-[#92400E] border border-[#FCD34D] text-[11px] font-semibold cursor-pointer disabled:opacity-50"
                >
                  <Mic className="w-3.5 h-3.5" />
                  <span>
                    {isSynthesizingStudioAudio
                      ? 'Synthesizing Indian Studio Audio (gemini-3.8-flash-tts)...'
                      : 'Synthesize Studio WAV (Gemini Indian TTS)'}
                  </span>
                </button>
              </div>

              {studioAudioUrl && (
                <div className="pt-1">
                  <audio controls src={studioAudioUrl} className="w-full h-8" />
                </div>
              )}

              <div className="flex items-center justify-between gap-2 pt-1 text-[11px] text-slate-600 dark:text-slate-400">
                <span>Playback Speed:</span>
                <div className="inline-flex items-center gap-1">
                  {[0.95, 1.0, 1.15].map((rate) => (
                    <button
                      key={rate}
                      type="button"
                      onClick={() => setSpeechRate(rate)}
                      className={`px-2 py-0.5 rounded font-mono cursor-pointer ${
                        speechRate === rate
                          ? 'bg-white text-[#312E81] font-semibold border border-[#C7D2FE]'
                          : 'text-slate-500'
                      }`}
                    >
                      {rate}x
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleDownloadPodcastMd}
              className="w-full inline-flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-[#D1FAE5] hover:bg-[#A7F3D0] text-[#065F46] border border-[#A7F3D0] text-xs font-semibold cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Podcast Script (.MD)</span>
            </button>
          </div>

          {/* Right Synced Two-Host Dialogue Transcript (8 cols) */}
          <div className="lg:col-span-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11141D] p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <div className="text-xs font-medium text-[#92400E] dark:text-amber-300">
                  {podcastData?.hosts?.host_a?.name || 'Aarav Sharma'} ({podcastData?.hosts?.host_a?.role || 'Lead Systems Architect · Bengaluru'}) &{' '}
                  {podcastData?.hosts?.host_b?.name || 'Diya Patel'} ({podcastData?.hosts?.host_b?.role || 'Principal Governance Auditor · Mumbai'})
                </div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  {podcastData?.episode_title || 'Grounded Two-Host Indian Dialogue'}
                </h3>
              </div>
              <span className="text-xs text-slate-500 font-mono">
                Click any turn to speak in Indian voice ({podcastData?.voice_locale || 'en-IN'})
              </span>
            </div>

            <div className="space-y-3">
              {(podcastData?.turns || []).map((turn, idx) => {
                const isHostA = turn.speaker_gender === 'male' || idx % 2 === 0;
                const isCurrentTurn = idx === activeTurnIdx;

                return (
                  <div
                    key={turn.index}
                    onClick={() => {
                      setActiveTurnIdx(idx);
                      playPodcastFromTurn(idx);
                    }}
                    className={`rounded-xl border p-4 space-y-2 transition-all cursor-pointer ${
                      isCurrentTurn
                        ? isHostA
                          ? 'bg-[#EEF2FF] dark:bg-indigo-950/35 border-[#A5B4FC]'
                          : 'bg-[#F5F3FF] dark:bg-violet-950/35 border-[#C4B5FD]'
                        : 'bg-[#FAF9F5] dark:bg-[#0D1017] border-slate-200/80 dark:border-slate-800 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-semibold ${
                            isHostA
                              ? 'text-[#312E81] dark:text-indigo-300'
                              : 'text-[#4C1D95] dark:text-violet-300'
                          }`}
                        >
                          {turn.speaker}
                        </span>
                        <span aria-hidden="true" className="text-slate-400">
                          ·
                        </span>
                        <span className="text-slate-500">{turn.role_tag}</span>
                        {turn.highlight_metric && (
                          <>
                            <span aria-hidden="true" className="text-slate-400">
                              ·
                            </span>
                            <span className="font-mono text-[11px] text-[#065F46] dark:text-emerald-300">
                              {turn.highlight_metric}
                            </span>
                          </>
                        )}
                      </div>

                      <span className="font-mono text-[11px] text-slate-500">
                        Page {turn.cited_page} · {turn.cited_section}
                      </span>
                    </div>

                    <p className="text-xs sm:text-sm text-slate-800 dark:text-slate-200 leading-relaxed">
                      "{turn.text}"
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
