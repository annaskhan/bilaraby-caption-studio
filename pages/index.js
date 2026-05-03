import { useState, useRef, useCallback, useEffect } from 'react';
import Head from 'next/head';

const LANGUAGES = [
  { code: 'en', label: 'English',    flag: '🇬🇧', dir: 'ltr', ytCode: 'en' },
  { code: 'fr', label: 'Français',   flag: '🇫🇷', dir: 'ltr', ytCode: 'fr' },
  { code: 'es', label: 'Español',    flag: '🇪🇸', dir: 'ltr', ytCode: 'es' },
  { code: 'de', label: 'Deutsch',    flag: '🇩🇪', dir: 'ltr', ytCode: 'de' },
  { code: 'tr', label: 'Türkçe',     flag: '🇹🇷', dir: 'ltr', ytCode: 'tr' },
  { code: 'ur', label: 'اردو',       flag: '🇵🇰', dir: 'rtl', ytCode: 'ur' },
  { code: 'id', label: 'Bahasa',     flag: '🇮🇩', dir: 'ltr', ytCode: 'id' },
  { code: 'ms', label: 'Melayu',     flag: '🇲🇾', dir: 'ltr', ytCode: 'ms' },
  { code: 'hi', label: 'हिन्दी',     flag: '🇮🇳', dir: 'ltr', ytCode: 'hi' },
  { code: 'zh', label: '中文',        flag: '🇨🇳', dir: 'ltr', ytCode: 'zh-Hans' },
  { code: 'ru', label: 'Русский',    flag: '🇷🇺', dir: 'ltr', ytCode: 'ru' },
  { code: 'pt', label: 'Português',  flag: '🇧🇷', dir: 'ltr', ytCode: 'pt' },
];

const PIPELINE_STAGES = [
  { id: 'upload',    label: 'SRT Ingested',   icon: '⬆' },
  { id: 'parse',     label: 'Parsing',         icon: '⚙' },
  { id: 'translate', label: 'AI Translating',  icon: '✦' },
  { id: 'compile',   label: 'Compiling',       icon: '◈' },
  { id: 'ready',     label: 'Ready',           icon: '↓' },
];

const DEFAULT_GLOSSARY = [
  { term: 'BilAraby',       translation: 'BilAraby',       keepAsIs: true,  notes: 'Brand name — never translate' },
  { term: 'بالعربي',        translation: 'BilAraby',       keepAsIs: false, notes: 'Render brand in Latin script' },
  { term: 'Allah',          translation: 'Allah',          keepAsIs: true,  notes: 'Never translate to God/Dieu/Dios etc.' },
  { term: 'الله',           translation: 'Allah',          keepAsIs: false, notes: 'Always render as Allah' },
  { term: 'Quran',          translation: 'Quran',          keepAsIs: true,  notes: 'Capitalized, never Koran' },
  { term: 'القرآن',         translation: 'Quran',          keepAsIs: false, notes: '' },
  { term: 'Sunnah',         translation: 'Sunnah',         keepAsIs: true,  notes: '' },
  { term: 'Hadith',         translation: 'Hadith',         keepAsIs: true,  notes: '' },
  { term: 'Ramadan',        translation: 'Ramadan',        keepAsIs: true,  notes: 'Never Ramazan' },
  { term: 'In sha Allah',   translation: 'In sha Allah',   keepAsIs: true,  notes: '' },
  { term: 'Mash\'Allah',    translation: 'Mash\'Allah',    keepAsIs: true,  notes: '' },
  { term: 'Alhamdulillah',  translation: 'Alhamdulillah',  keepAsIs: true,  notes: '' },
  { term: 'Bismillah',      translation: 'Bismillah',      keepAsIs: true,  notes: '' },
  { term: 'Du\'a',          translation: 'Du\'a',          keepAsIs: true,  notes: 'With apostrophe' },
  { term: 'Dhikr',          translation: 'Dhikr',          keepAsIs: true,  notes: '' },
  { term: 'Hijra',          translation: 'Hijra',          keepAsIs: true,  notes: '' },
  { term: 'Eid',            translation: 'Eid',            keepAsIs: true,  notes: '' },
];

function parseSRT(content) {
  const blocks = content.trim().split(/\n\s*\n/);
  return blocks.map((block) => {
    const lines = block.trim().split('\n');
    return { index: lines[0], timestamp: lines[1], text: lines.slice(2).join('\n') };
  }).filter(b => b.timestamp && b.text);
}

function buildSRT(blocks) {
  return blocks.map((b, i) => `${i + 1}\n${b.timestamp}\n${b.text}`).join('\n\n') + '\n';
}

async function translateBlocks(blocks, langLabel, glossary) {
  const response = await fetch('/api/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blocks, langLabel, glossary }),
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || 'Translation failed');
  }
  const data = await response.json();
  return data.blocks;
}

async function fetchYouTubeCaptions(videoUrl) {
  const response = await fetch('/api/youtube-fetch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ videoUrl }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Failed to fetch captions');
  return data;
}

async function uploadToYouTube(srtContent, videoId, langCode, langLabel, accessToken) {
  const metaRes = await fetch('https://www.googleapis.com/youtube/v3/captions?part=snippet', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ snippet: { videoId, language: langCode, name: `${langLabel} (AI Draft)`, isDraft: true } }),
  });
  if (!metaRes.ok) {
    const err = await metaRes.json();
    throw new Error(err?.error?.message || `HTTP ${metaRes.status}`);
  }
  const meta = await metaRes.json();
  const uploadRes = await fetch(
    `https://www.googleapis.com/upload/youtube/v3/captions?uploadType=media&id=${meta.id}`,
    { method: 'PUT', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'text/plain; charset=utf-8' }, body: srtContent }
  );
  if (!uploadRes.ok) throw new Error(`Upload failed: HTTP ${uploadRes.status}`);
  return meta.id;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

export default function Home() {
  const [file, setFile]                   = useState(null);
  const [srtContent, setSrtContent]       = useState('');
  const [selectedLangs, setSelectedLangs] = useState(['en', 'fr', 'es']);
  const [stage, setStage]                 = useState('idle');
  const [activeStageIndex, setActiveStageIndex] = useState(-1);
  const [results, setResults]             = useState({});
  const [error, setError]                 = useState('');
  const [dragOver, setDragOver]           = useState(false);
  const [progress, setProgress]           = useState({});
  const [ytExpanded, setYtExpanded]       = useState(false);
  const [videoId, setVideoId]             = useState('');
  const [accessToken, setAccessToken]     = useState('');
  const [uploadStatus, setUploadStatus]   = useState({});
  const [activeTab, setActiveTab]         = useState('translate');

  // New: input mode toggle
  const [inputMode, setInputMode] = useState('file'); // 'file' or 'youtube'
  const [ytFetchUrl, setYtFetchUrl] = useState('');
  const [ytFetching, setYtFetching] = useState(false);

  // New: glossary
  const [glossary, setGlossary] = useState(DEFAULT_GLOSSARY);
  const [glossaryExpanded, setGlossaryExpanded] = useState(false);

  // New: live activity stats
  const [stats, setStats] = useState({
    videosTranslated: 0,
    languagesGenerated: 0,
    segmentsTranslated: 0,
    youtubeDraftsPushed: 0,
    lastUsed: null,
    firstUsed: null,
  });
  const [animatedStats, setAnimatedStats] = useState({
    videosTranslated: 0,
    languagesGenerated: 0,
    segmentsTranslated: 0,
    youtubeDraftsPushed: 0,
  });

  const fileRef = useRef();

  // Load glossary from localStorage on mount
  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('bilaraby_glossary') : null;
    if (saved) {
      try { setGlossary(JSON.parse(saved)); } catch {}
    }
  }, []);

  // Save glossary on change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('bilaraby_glossary', JSON.stringify(glossary));
    }
  }, [glossary]);

  // Load stats from localStorage on mount
  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('bilaraby_stats') : null;
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setStats(parsed);
        setAnimatedStats({
          videosTranslated: parsed.videosTranslated || 0,
          languagesGenerated: parsed.languagesGenerated || 0,
          segmentsTranslated: parsed.segmentsTranslated || 0,
          youtubeDraftsPushed: parsed.youtubeDraftsPushed || 0,
        });
      } catch {}
    }
  }, []);

  // Persist stats on change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('bilaraby_stats', JSON.stringify(stats));
    }
  }, [stats]);

  // Count-up animation when stats change
  useEffect(() => {
    const keys = ['videosTranslated', 'languagesGenerated', 'segmentsTranslated', 'youtubeDraftsPushed'];
    const duration = 800;
    const steps = 24;
    const stepTime = duration / steps;
    const startVals = { ...animatedStats };
    const diffs = {};
    keys.forEach(k => { diffs[k] = stats[k] - startVals[k]; });

    if (keys.every(k => diffs[k] === 0)) return;

    let step = 0;
    const interval = setInterval(() => {
      step++;
      const progress = step / steps;
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = {};
      keys.forEach(k => { next[k] = Math.round(startVals[k] + diffs[k] * eased); });
      setAnimatedStats(next);
      if (step >= steps) {
        clearInterval(interval);
        setAnimatedStats({
          videosTranslated: stats.videosTranslated,
          languagesGenerated: stats.languagesGenerated,
          segmentsTranslated: stats.segmentsTranslated,
          youtubeDraftsPushed: stats.youtubeDraftsPushed,
        });
      }
    }, stepTime);
    return () => clearInterval(interval);
  }, [stats.videosTranslated, stats.languagesGenerated, stats.segmentsTranslated, stats.youtubeDraftsPushed]);

  const handleFile = useCallback((f) => {
    if (!f || !f.name.endsWith('.srt')) { setError('Please upload a valid .srt file'); return; }
    setError(''); setResults({}); setStage('idle'); setActiveStageIndex(-1); setUploadStatus({});
    const reader = new FileReader();
    reader.onload = (e) => { setSrtContent(e.target.result); setFile(f); };
    reader.readAsText(f);
  }, []);

  const onDrop = (e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); };
  const toggleLang = (code) => setSelectedLangs(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]);

  const fetchFromYouTube = async () => {
    if (!ytFetchUrl.trim()) { setError('Please enter a YouTube URL or video ID'); return; }
    setError(''); setYtFetching(true); setResults({}); setStage('idle'); setActiveStageIndex(-1);
    try {
      const data = await fetchYouTubeCaptions(ytFetchUrl);
      setSrtContent(data.srtContent);
      const fakeFile = { name: `youtube_${data.videoId}.srt`, size: data.srtContent.length };
      setFile(fakeFile);
      // Auto-fill the videoId for upload section
      if (data.videoId && !videoId) setVideoId(data.videoId);
    } catch (e) {
      setError(e.message);
    } finally {
      setYtFetching(false);
    }
  };

  const runTranslation = async () => {
    if (!srtContent || selectedLangs.length === 0) return;
    setError(''); setResults({}); setStage('running'); setProgress({}); setUploadStatus({});
    try {
      setActiveStageIndex(0); await sleep(400);
      setActiveStageIndex(1);
      const blocks = parseSRT(srtContent);
      await sleep(600);
      setActiveStageIndex(2);

      const newResults = {};
      const progMap = {};
      selectedLangs.forEach(l => (progMap[l] = 'pending'));
      setProgress({ ...progMap });

      const activeGlossary = glossary.filter(g => g.term && g.term.trim());

      await Promise.all(selectedLangs.map(async (code) => {
        const lang = LANGUAGES.find(l => l.code === code);
        try {
          setProgress(p => ({ ...p, [code]: 'translating' }));
          const translated = await translateBlocks(blocks, lang.label, activeGlossary);
          newResults[code] = buildSRT(translated);
          setProgress(p => ({ ...p, [code]: 'done' }));
        } catch (e) {
          setProgress(p => ({ ...p, [code]: 'error' }));
        }
      }));

      setActiveStageIndex(3); await sleep(500);
      setResults(newResults);
      setActiveStageIndex(4);
      setStage('done');

      // Update activity stats
      const successfulLangs = Object.keys(newResults).length;
      if (successfulLangs > 0) {
        const segmentCount = blocks.length;
        const now = new Date().toISOString();
        setStats(prev => ({
          videosTranslated: prev.videosTranslated + 1,
          languagesGenerated: prev.languagesGenerated + successfulLangs,
          segmentsTranslated: prev.segmentsTranslated + (segmentCount * successfulLangs),
          youtubeDraftsPushed: prev.youtubeDraftsPushed,
          lastUsed: now,
          firstUsed: prev.firstUsed || now,
        }));
      }

      if (videoId && accessToken) setYtExpanded(true);
    } catch (e) {
      setError('Translation failed. Please try again.');
      setStage('idle');
    }
  };

  const download = (code) => {
    const lang = LANGUAGES.find(l => l.code === code);
    const blob = new Blob([results[code]], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${file?.name?.replace('.srt', '') || 'subtitles'}_${code}.srt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadAll = () => Object.keys(results).forEach((code, i) => setTimeout(() => download(code), i * 200));

  const handleUpload = async (code) => {
    const lang = LANGUAGES.find(l => l.code === code);
    if (!videoId.trim() || !accessToken.trim()) { setError('Please enter your Video ID and OAuth token.'); return; }
    setUploadStatus(s => ({ ...s, [code]: 'uploading' }));
    try {
      await uploadToYouTube(results[code], videoId.trim(), lang.ytCode, lang.label, accessToken.trim());
      setUploadStatus(s => ({ ...s, [code]: 'done' }));
      setStats(prev => ({ ...prev, youtubeDraftsPushed: prev.youtubeDraftsPushed + 1, lastUsed: new Date().toISOString() }));
    } catch (e) {
      setUploadStatus(s => ({ ...s, [code]: `error:${e.message}` }));
    }
  };

  const handleUploadAll = async () => {
    for (const code of Object.keys(results)) { await handleUpload(code); await sleep(800); }
  };

  // Glossary functions
  const addGlossaryTerm = () => setGlossary([...glossary, { term: '', translation: '', keepAsIs: true, notes: '' }]);
  const updateGlossaryTerm = (idx, field, value) => {
    const next = [...glossary];
    next[idx] = { ...next[idx], [field]: value };
    setGlossary(next);
  };
  const removeGlossaryTerm = (idx) => setGlossary(glossary.filter((_, i) => i !== idx));
  const resetGlossary = () => { if (confirm('Reset glossary to BilAraby defaults?')) setGlossary(DEFAULT_GLOSSARY); };
  const exportGlossary = () => {
    const blob = new Blob([JSON.stringify(glossary, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bilaraby-glossary.json';
    a.click();
    URL.revokeObjectURL(url);
  };
  const importGlossary = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        if (Array.isArray(parsed)) setGlossary(parsed);
      } catch {
        alert('Invalid glossary JSON file');
      }
    };
    reader.readAsText(f);
  };

  const resetStats = () => {
    if (confirm('Reset all activity counters to zero? This cannot be undone.')) {
      setStats({ videosTranslated: 0, languagesGenerated: 0, segmentsTranslated: 0, youtubeDraftsPushed: 0, lastUsed: null, firstUsed: null });
      setAnimatedStats({ videosTranslated: 0, languagesGenerated: 0, segmentsTranslated: 0, youtubeDraftsPushed: 0 });
    }
  };

  const formatRelativeTime = (iso) => {
    if (!iso) return 'Never used';
    const diff = Date.now() - new Date(iso).getTime();
    const sec = Math.floor(diff / 1000);
    if (sec < 60) return 'Just now';
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min} minute${min !== 1 ? 's' : ''} ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr} hour${hr !== 1 ? 's' : ''} ago`;
    const days = Math.floor(hr / 24);
    if (days < 30) return `${days} day${days !== 1 ? 's' : ''} ago`;
    return new Date(iso).toLocaleDateString();
  };

  const formatNum = (n) => n.toLocaleString();

  const activeGlossaryCount = glossary.filter(g => g.term && g.term.trim()).length;

  return (
    <>
      <Head>
        <title>BilAraby Caption Studio</title>
        <meta name="description" content="AI-powered Arabic subtitle translation tool" />
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>✦</text></svg>" />
      </Head>

      <div style={s.root}>
        <header style={s.header}>
          <div style={s.headerInner}>
            <div style={s.logo}>
              <span style={s.logoAr} className="arabic">بالعربي</span>
              <span style={s.logoSep}>·</span>
              <span style={s.logoEn}>Caption Studio</span>
            </div>
            <div style={s.headerRight}>
              <div style={s.tabNav}>
                <button onClick={() => setActiveTab('translate')} style={{ ...s.tabBtn, ...(activeTab === 'translate' ? s.tabBtnActive : {}) }}>Translate</button>
                <button onClick={() => setActiveTab('guide')} style={{ ...s.tabBtn, ...(activeTab === 'guide' ? s.tabBtnActive : {}) }}>Team Guide</button>
              </div>
              <div style={s.badge}>AI-POWERED · CLAUDE</div>
            </div>
          </div>
        </header>

        {activeTab === 'guide' ? <GuideTab /> : (
          <main style={s.main}>
            <div style={s.hero}>
              <div style={s.heroDiamond}><span className="brand-diamond-lg" /></div>
              <div style={s.heroLabel}>AN INITIATIVE OF QATAR FOUNDATION  ·  POWERED BY CLAUDE</div>
              <h1 style={s.heroTitle}>
                <span className="arabic" style={s.heroArabic}>بالعربي</span>
                <span style={s.heroDivider}>·</span>
                Caption Studio
              </h1>
              <p style={s.heroSub}>Translate once. Reach everyone. Upload an Arabic SRT or paste a YouTube link — Claude translates to 12 languages with your custom brand glossary, then pushes directly to YouTube as drafts.</p>
            </div>

            <div style={s.pipelineWrap}>
              {PIPELINE_STAGES.map((stg, i) => (
                <div key={stg.id} style={s.pipelineItem}>
                  <div style={{ ...s.pipelineNode, ...(activeStageIndex === i ? s.pipelineNodeActive : {}), ...(activeStageIndex > i ? s.pipelineNodeDone : {}) }}>
                    <span>{stg.icon}</span>
                  </div>
                  <span style={{ ...s.pipelineLabel, ...(activeStageIndex >= i ? s.pipelineLabelActive : {}) }}>{stg.label}</span>
                  {i < PIPELINE_STAGES.length - 1 && <div style={{ ...s.pipelineConnector, ...(activeStageIndex > i ? s.pipelineConnectorActive : {}) }} />}
                </div>
              ))}
              <div style={s.pipelineItemYT}>
                <div style={{ ...s.pipelineNode, ...(stage === 'done' && videoId && accessToken ? s.pipelineNodeActive : {}) }}>
                  <span>▶</span>
                </div>
                <span style={{ ...s.pipelineLabel, ...(stage === 'done' && videoId && accessToken ? s.pipelineLabelActive : {}) }}>YouTube Upload</span>
              </div>
            </div>

            <div style={s.grid}>
              {/* Input section with mode toggle */}
              <div style={s.card}>
                <div style={s.cardLabelRow}>
                  <div style={s.cardLabel}>01 — SOURCE</div>
                  <div style={s.modeToggle}>
                    <button onClick={() => setInputMode('file')} style={{ ...s.modeBtn, ...(inputMode === 'file' ? s.modeBtnActive : {}) }}>SRT File</button>
                    <button onClick={() => setInputMode('youtube')} style={{ ...s.modeBtn, ...(inputMode === 'youtube' ? s.modeBtnActive : {}) }}>YouTube Link</button>
                  </div>
                </div>

                {inputMode === 'file' ? (
                  <div style={{ ...s.dropzone, ...(dragOver ? s.dropzoneActive : {}), ...(file ? s.dropzoneFilled : {}) }}
                    onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={onDrop}
                    onClick={() => fileRef.current.click()}>
                    <input ref={fileRef} type="file" accept=".srt" style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />
                    {file ? (
                      <div style={s.fileInfo}>
                        <div style={s.fileIcon}>◈</div>
                        <div style={s.fileName}>{file.name}</div>
                        <div style={s.fileSize}>{(file.size / 1024).toFixed(1)} KB · {parseSRT(srtContent).length} segments</div>
                        <div style={s.fileChange}>click to change</div>
                      </div>
                    ) : (
                      <div style={s.dropContent}>
                        <div style={s.dropIconLg}>⬆</div>
                        <div style={s.dropText}>Drop your .SRT file here</div>
                        <div style={s.dropSub}>or click to browse</div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={s.ytFetchBox}>
                    <input
                      style={s.ytUrlInput}
                      placeholder="https://www.youtube.com/watch?v=..."
                      value={ytFetchUrl}
                      onChange={e => setYtFetchUrl(e.target.value)}
                    />
                    <button onClick={fetchFromYouTube} disabled={ytFetching || !ytFetchUrl.trim()}
                      style={{ ...s.ytFetchBtn, ...(ytFetching || !ytFetchUrl.trim() ? s.btnDisabled : {}) }}
                      className="translate-btn">
                      {ytFetching ? <><span className="spinner">◈</span>&nbsp; Fetching...</> : 'Fetch Captions'}
                    </button>
                    {file && srtContent && inputMode === 'youtube' && (
                      <div style={s.ytFetchSuccess}>
                        ✓ Loaded {parseSRT(srtContent).length} caption segments from {file.name}
                      </div>
                    )}
                    <div style={s.ytFetchNote}>
                      ⚠ Only works for videos with public Arabic captions. If it fails, download the SRT manually from YouTube Studio and switch to SRT File mode.
                    </div>
                  </div>
                )}
                {error && <div style={s.error}>{error}</div>}
              </div>

              <div style={s.card}>
                <div style={s.cardLabel}>02 — TARGET LANGUAGES</div>
                <div style={s.langGrid}>
                  {LANGUAGES.map(lang => (
                    <button key={lang.code} onClick={() => toggleLang(lang.code)}
                      style={{ ...s.langBtn, ...(selectedLangs.includes(lang.code) ? s.langBtnActive : {}) }} className="lang-btn">
                      <span style={s.langFlag}>{lang.flag}</span>
                      <span style={s.langName}>{lang.label}</span>
                      {selectedLangs.includes(lang.code) && <span style={s.langCheck}>✓</span>}
                    </button>
                  ))}
                </div>
                <div style={s.langCount}>{selectedLangs.length} language{selectedLangs.length !== 1 ? 's' : ''} selected</div>
              </div>
            </div>

            {/* Glossary */}
            <div style={s.glossaryCard}>
              <div style={s.glossaryHeader} onClick={() => setGlossaryExpanded(!glossaryExpanded)}>
                <div style={s.glossaryTitle}>
                  <span style={s.glossaryIcon}>📖</span>
                  <span>02.5 — BRAND GLOSSARY</span>
                  <span style={s.glossaryCount}>{glossary.filter(g => g.term && g.term.trim()).length} terms active</span>
                </div>
                <span style={s.ytChevron}>{glossaryExpanded ? '▲' : '▼'}</span>
              </div>
              {glossaryExpanded && (
                <div style={s.glossaryBody}>
                  <div style={s.glossaryNote}>
                    These terms are enforced across every translation. Terms marked <strong>Keep As-Is</strong> stay in their original form (e.g. <em>Allah</em> never becomes <em>God</em>). Terms with a translation are forced to that exact rendering.
                  </div>

                  <div style={s.glossaryActions}>
                    <button onClick={addGlossaryTerm} style={s.glossaryActionBtn}>+ Add Term</button>
                    <button onClick={resetGlossary} style={s.glossaryActionBtn}>↺ Reset to Defaults</button>
                    <button onClick={exportGlossary} style={s.glossaryActionBtn}>↓ Export JSON</button>
                    <label style={{ ...s.glossaryActionBtn, cursor: 'pointer' }}>
                      ↑ Import JSON
                      <input type="file" accept=".json" onChange={importGlossary} style={{ display: 'none' }} />
                    </label>
                  </div>

                  <div style={s.glossaryTable}>
                    <div style={s.glossaryRowHeader}>
                      <div style={s.glossaryColTerm}>Term</div>
                      <div style={s.glossaryColTrans}>Translation / Rendering</div>
                      <div style={s.glossaryColKeep}>Keep As-Is</div>
                      <div style={s.glossaryColNotes}>Notes</div>
                      <div style={s.glossaryColDel}></div>
                    </div>
                    {glossary.map((g, i) => (
                      <div key={i} style={s.glossaryRow}>
                        <input style={s.glossaryInput} value={g.term} placeholder="Allah" onChange={e => updateGlossaryTerm(i, 'term', e.target.value)} />
                        <input style={s.glossaryInput} value={g.translation} placeholder="Allah" onChange={e => updateGlossaryTerm(i, 'translation', e.target.value)} />
                        <label style={s.glossaryCheckLabel}>
                          <input type="checkbox" checked={g.keepAsIs} onChange={e => updateGlossaryTerm(i, 'keepAsIs', e.target.checked)} style={s.glossaryCheck} />
                          {g.keepAsIs ? 'Yes' : 'No'}
                        </label>
                        <input style={s.glossaryInput} value={g.notes || ''} placeholder="optional" onChange={e => updateGlossaryTerm(i, 'notes', e.target.value)} />
                        <button onClick={() => removeGlossaryTerm(i)} style={s.glossaryDelBtn}>×</button>
                      </div>
                    ))}
                  </div>

                  <div style={s.glossarySaved}>✓ Auto-saved to your browser. Use Export to share with team members.</div>
                </div>
              )}
            </div>

            {/* YouTube Config */}
            <div style={s.ytConfigCard}>
              <div style={s.ytConfigHeader} onClick={() => setYtExpanded(!ytExpanded)}>
                <div style={s.ytConfigTitle}>
                  <span style={s.ytIcon}>▶</span>
                  <span>03 — YOUTUBE DIRECT UPLOAD</span>
                  <span style={s.ytOptional}>optional · uploads as drafts</span>
                </div>
                <span style={s.ytChevron}>{ytExpanded ? '▲' : '▼'}</span>
              </div>
              {ytExpanded && (
                <div style={s.ytConfigBody}>
                  <div style={s.ytInfoBox}>
                    <div style={s.ytInfoTitle}>⚡ How to get your OAuth Token (60 seconds)</div>
                    <div style={s.ytSteps}>
                      {[
                        <>Go to <a href="https://developers.google.com/oauthplayground" target="_blank" rel="noreferrer" style={s.link}>developers.google.com/oauthplayground</a></>,
                        <>In the left panel, find <strong>YouTube Data API v3</strong> → check <code style={s.code}>https://www.googleapis.com/auth/youtube.force-ssl</code></>,
                        <>Click <strong>Authorize APIs</strong> → sign in with your YouTube account</>,
                        <>Click <strong>Exchange authorization code for tokens</strong></>,
                        <>Copy the <strong>Access token</strong> and paste below</>,
                      ].map((step, i) => (
                        <div key={i} style={s.ytStep}>
                          <div style={s.ytStepNum}>{i + 1}</div>
                          <span style={s.ytStepText}>{step}</span>
                        </div>
                      ))}
                    </div>
                    <div style={s.ytInfoNote}>⚠ Token expires after 1 hour. Video ID is in the YouTube URL after <strong>?v=</strong></div>
                  </div>
                  <div style={s.ytFields}>
                    <div style={s.ytField}>
                      <label style={s.ytLabel}>YouTube Video ID</label>
                      <input style={s.ytInput} placeholder="e.g. dQw4w9WgXcQ" value={videoId} onChange={e => setVideoId(e.target.value)} />
                    </div>
                    <div style={s.ytField}>
                      <label style={s.ytLabel}>OAuth Access Token</label>
                      <input style={s.ytInput} type="password" placeholder="ya29.a0..." value={accessToken} onChange={e => setAccessToken(e.target.value)} />
                    </div>
                  </div>
                  {videoId && accessToken && <div style={s.ytReady}>✓ YouTube upload configured</div>}
                </div>
              )}
            </div>

            <div style={s.actionRow}>
              <button onClick={runTranslation}
                disabled={!file || selectedLangs.length === 0 || stage === 'running'}
                style={{ ...s.translateBtn, ...(!file || selectedLangs.length === 0 ? s.translateBtnDisabled : {}), ...(stage === 'running' ? s.translateBtnRunning : {}) }}
                className="translate-btn">
                {stage === 'running'
                  ? <span style={s.btnInner}><span className="spinner">◈</span>&nbsp; Translating with Claude...</span>
                  : <span style={s.btnInner}>✦ &nbsp;Run AI Translation</span>}
              </button>
            </div>

            {stage === 'running' && Object.keys(progress).length > 0 && (
              <div style={s.progressCard}>
                <div style={s.progressTitle}>Translation in Progress</div>
                <div style={s.progressGrid}>
                  {selectedLangs.map(code => {
                    const lang = LANGUAGES.find(l => l.code === code);
                    const status = progress[code];
                    return (
                      <div key={code} style={{ ...s.progressItem, ...(status === 'done' ? s.progressItemDone : status === 'translating' ? s.progressItemActive : {}) }}>
                        <span>{lang.flag}</span>
                        <span style={s.progressLang}>{lang.label}</span>
                        <span style={s.progressStatus}>{status === 'done' ? '✓' : status === 'translating' ? <span className="pulse">●</span> : '·'}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {stage === 'done' && Object.keys(results).length > 0 && (
              <div style={s.resultsSection}>
                <div style={s.resultsHeader}>
                  <div style={s.resultsTitle}><span style={s.resultsTitleAccent}>✦</span> Translation Complete</div>
                  <div style={s.resultsActions}>
                    {videoId && accessToken && (
                      <button onClick={handleUploadAll} style={{ ...s.translateBtn, ...s.uploadAllBtn }} className="translate-btn">▶ &nbsp;Upload All to YouTube</button>
                    )}
                    <button onClick={downloadAll} style={{ ...s.translateBtn, ...s.downloadAllBtn }} className="translate-btn">↓ &nbsp;Download All</button>
                  </div>
                </div>
                <div style={s.resultsGrid}>
                  {Object.keys(results).map(code => {
                    const lang = LANGUAGES.find(l => l.code === code);
                    const upStatus = uploadStatus[code];
                    const isUploading = upStatus === 'uploading';
                    const isDone = upStatus === 'done';
                    const isError = upStatus?.startsWith('error:');
                    return (
                      <div key={code} style={s.resultCard} className="result-card">
                        <div style={s.resultLang}>
                          <span style={s.resultFlag}>{lang.flag}</span>
                          <div>
                            <div style={s.resultLangName}>{lang.label}</div>
                            <div style={s.resultMeta}>{isDone ? <span style={s.uploadedBadge}>✓ Uploaded to YouTube</span> : 'ready for review'}</div>
                          </div>
                        </div>
                        <div style={s.resultPreview}>
                          {results[code].split('\n\n').slice(0, 2).map((b, i) => (
                            <div key={i} style={s.previewBlock}>
                              <div style={s.previewTime}>{b.split('\n')[1]}</div>
                              <div style={{ ...s.previewText, direction: lang.dir === 'rtl' ? 'rtl' : 'ltr' }}>{b.split('\n').slice(2).join(' ')}</div>
                            </div>
                          ))}
                        </div>
                        {isError && <div style={s.uploadError}>{upStatus.replace('error:', '⚠ ')}</div>}
                        <div style={s.resultBtns}>
                          {videoId && accessToken && !isDone && (
                            <button onClick={() => handleUpload(code)} disabled={isUploading}
                              style={{ ...s.resultActionBtn, ...s.ytUploadBtn, ...(isUploading ? s.btnDisabled : {}) }} className="lang-btn">
                              {isUploading ? <span className="spinner">◈</span> : '▶'} &nbsp;{isUploading ? 'Uploading...' : 'Upload to YT'}
                            </button>
                          )}
                          <button onClick={() => download(code)} style={s.resultActionBtn} className="lang-btn">↓ &nbsp;Download .SRT</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {Object.values(uploadStatus).some(v => v === 'done') && (
                  <div style={s.ytSuccessBar}>✓ &nbsp;Caption tracks uploaded as drafts. Review and publish in <strong>YouTube Studio → Subtitles</strong>.</div>
                )}
              </div>
            )}

            <div style={s.dashSection}>
              <div style={s.dashHeader}>
                <div style={s.dashTitle}>
                  <span style={s.dashLive}><span className="pulse-dot" />LIVE</span>
                  <span style={s.dashTitleText}>Activity Dashboard</span>
                </div>
                <div style={s.dashSubtitle}>
                  <span>Last activity: <span style={s.dashSubAccent}>{formatRelativeTime(stats.lastUsed)}</span></span>
                  <button onClick={resetStats} style={s.dashReset}>Reset Counters</button>
                </div>
              </div>
              <div style={s.dashGrid}>
                <div style={s.dashCard}>
                  <div style={s.dashCardLabel}>Videos Translated</div>
                  <div style={s.dashCardNum}>{formatNum(animatedStats.videosTranslated)}</div>
                  <div style={s.dashCardSub}>total runs</div>
                </div>
                <div style={s.dashCard}>
                  <div style={s.dashCardLabel}>Caption Tracks Created</div>
                  <div style={s.dashCardNum}>{formatNum(animatedStats.languagesGenerated)}</div>
                  <div style={s.dashCardSub}>across all videos</div>
                </div>
                <div style={s.dashCard}>
                  <div style={s.dashCardLabel}>Segments Translated</div>
                  <div style={s.dashCardNum}>{formatNum(animatedStats.segmentsTranslated)}</div>
                  <div style={s.dashCardSub}>subtitle lines processed</div>
                </div>
                <div style={s.dashCard}>
                  <div style={s.dashCardLabel}>YouTube Drafts Pushed</div>
                  <div style={s.dashCardNum}>{formatNum(animatedStats.youtubeDraftsPushed)}</div>
                  <div style={s.dashCardSub}>uploaded to YouTube</div>
                </div>
                <div style={s.dashCard}>
                  <div style={s.dashCardLabel}>Glossary Terms Active</div>
                  <div style={s.dashCardNum}>{formatNum(activeGlossaryCount)}</div>
                  <div style={s.dashCardSub}>brand-enforced terms</div>
                </div>
                <div style={s.dashCard}>
                  <div style={s.dashCardLabel}>Languages Supported</div>
                  <div style={s.dashCardNum}>12</div>
                  <div style={s.dashCardSub}>across 6 continents</div>
                </div>
              </div>
              {stats.firstUsed && (
                <div style={s.dashFooter}>
                  Tracking activity since {new Date(stats.firstUsed).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                </div>
              )}
            </div>
          </main>
        )}
      </div>
    </>
  );
}

function GuideTab() {
  const phases = [
    { phase: 'PHASE 1', color: '#1A1A2E', title: 'Get your Arabic captions', steps: ['Option A — Paste a YouTube link in the tool to auto-fetch captions', 'Option B — Download SRT manually from YouTube Studio → Subtitles → ⋮ → .srt'] },
    { phase: 'PHASE 2', color: '#7A3A1A', title: 'Customize your Brand Glossary', steps: ['Open the Brand Glossary section', 'Add brand terms (BilAraby, show names) — set Keep As-Is', 'Add Islamic terms (Allah, Quran) — set Keep As-Is', 'Export the glossary JSON to share with team members', 'Glossary auto-saves to browser between sessions'] },
    { phase: 'PHASE 3', color: '#2244AA', title: 'Configure YouTube Upload (first time only)', steps: ['Go to developers.google.com/oauthplayground', 'Find YouTube Data API v3 → check youtube.force-ssl scope', 'Click Authorize APIs → sign in with BilAraby YouTube account', 'Click Exchange authorization code for tokens', 'Copy the Access token (starts with ya29...)', 'Paste your Video ID and token into the tool'] },
    { phase: 'PHASE 4', color: '#1A7A5A', title: 'Translate & Upload', steps: ['Select target languages', 'Click Run AI Translation — Claude uses your glossary', 'Click Upload All to YouTube', 'All tracks upload as Drafts — invisible to viewers'] },
    { phase: 'PHASE 5', color: '#7A1A5A', title: 'Review & Publish', steps: ['Go to YouTube Studio → Subtitles', 'Review each language track', 'Make corrections in the YouTube editor', 'Click Publish to go live'] },
  ];
  const tips = [
    ['📖', 'Glossary is critical', 'Add every recurring term — show names, Islamic vocabulary, brand mentions. This is what separates BilAraby from generic translation.'],
    ['🔗', 'YouTube link mode', 'Paste any YouTube URL in Source mode to auto-fetch Arabic captions. Skips the manual download step.'],
    ['⚡', 'Batch process', 'Run multiple videos back-to-back. Each takes 30–90 seconds.'],
    ['🔑', 'Token expired?', 'Get a fresh token from OAuth Playground if you get an auth error.'],
    ['✏', 'Edit before publish', 'Always review drafts — Claude is accurate but nuance may need a human touch.'],
    ['💰', 'Cost tracking', 'Monitor API usage at console.anthropic.com (~$0.15/video).'],
  ];
  return (
    <div style={g.root}>
      <div style={g.hero}>
        <div style={g.heroLabel}>TEAM OPERATIONS GUIDE</div>
        <h1 style={g.heroTitle}>BilAraby Caption Studio</h1>
        <p style={g.heroSub}>Five phases to translate and publish Arabic subtitles across 12 languages with brand-consistent terminology.</p>
      </div>
      <div style={g.phases}>
        {phases.map((ph, pi) => (
          <div key={pi} style={g.phaseCard}>
            <div style={{ ...g.phaseStripe, background: ph.color }} />
            <div style={g.phaseContent}>
              <div style={{ ...g.phaseTag, color: ph.color }}>{ph.phase}</div>
              <div style={g.phaseTitle}>{ph.title}</div>
              {ph.steps.map((step, si) => (
                <div key={si} style={g.step}>
                  <div style={{ ...g.stepNum, borderColor: ph.color, color: ph.color }}>{si + 1}</div>
                  <div style={g.stepText}>{step}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div style={g.tipsTitle}>Pro Tips</div>
      <div style={g.tipsGrid}>
        {tips.map(([icon, title, text], i) => (
          <div key={i} style={g.tipCard}>
            <div style={g.tipIcon}>{icon}</div>
            <div style={g.tipTitle}>{title}</div>
            <div style={g.tipText}>{text}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

const DARK = '#1B180F';
const DARK_2 = '#2A2620';
const CREAM = '#F9F7EA';
const CREAM_2 = '#F2EFE0';
const CREAM_3 = '#E8E4D0';
const GOLD = '#CD891C';
const GOLD_SOFT = '#D6A03F';
const TEAL = '#0B6A62';
const PURPLE = '#734663';
const BLUE = '#104F84';
const RED = '#D64E3E';
const TEXT = '#1B180F';
const TEXT_MUTED = 'rgba(27, 24, 15, 0.65)';
const TEXT_SOFT = 'rgba(27, 24, 15, 0.45)';
const BORDER = 'rgba(27, 24, 15, 0.1)';
const BORDER_STRONG = 'rgba(27, 24, 15, 0.18)';
const BORDER_GOLD = 'rgba(205, 137, 28, 0.4)';

const s = {
  root: { minHeight: '100vh', background: CREAM, color: TEXT },

  // Header — dark panel with gold frame, evoking the toolkit's branded panels
  header: { background: DARK, padding: '0 32px', position: 'sticky', top: 0, zIndex: 100, borderBottom: `1px solid ${GOLD}` },
  headerInner: { maxWidth: 1180, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 72 },
  logo: { display: 'flex', alignItems: 'center', gap: 14 },
  logoAr: { fontSize: 30, fontWeight: 700, color: CREAM, lineHeight: 1, letterSpacing: -1 },
  logoSep: { color: GOLD, fontSize: 16 },
  logoEn: { fontSize: 12, fontWeight: 600, letterSpacing: 3, textTransform: 'uppercase', color: 'rgba(249, 247, 234, 0.7)' },
  headerRight: { display: 'flex', alignItems: 'center', gap: 20 },
  tabNav: { display: 'flex', gap: 2, background: 'rgba(249, 247, 234, 0.08)', borderRadius: 4, padding: 3 },
  tabBtn: { background: 'transparent', border: 'none', color: 'rgba(249, 247, 234, 0.5)', fontSize: 11, fontWeight: 600, letterSpacing: 1.5, padding: '7px 14px', borderRadius: 3, cursor: 'pointer', textTransform: 'uppercase', transition: 'all 0.2s', fontFamily: 'inherit' },
  tabBtnActive: { background: GOLD, color: DARK },
  badge: { fontSize: 9, letterSpacing: 2.5, fontWeight: 700, color: GOLD, border: `1px solid ${BORDER_GOLD}`, padding: '4px 10px', borderRadius: 2, textTransform: 'uppercase' },

  main: { maxWidth: 1180, margin: '0 auto', padding: '0 32px 80px' },

  // Hero — dark panel with the L-frame gold line and double-diamond, mirroring the toolkit pages
  hero: { background: DARK, color: CREAM, margin: '0 -32px 48px', padding: '64px 64px 56px', position: 'relative' },
  heroDiamond: { position: 'absolute', top: 28, right: 60, opacity: 0.95 },
  heroLabel: { fontSize: 9, letterSpacing: 4, color: GOLD, marginBottom: 20, textTransform: 'uppercase', fontWeight: 600 },
  heroTitle: { fontSize: 'clamp(32px, 4.5vw, 56px)', fontWeight: 800, lineHeight: 1, margin: '0 0 22px', letterSpacing: -1.5, color: CREAM, display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' },
  heroArabic: { fontSize: 'clamp(38px, 5vw, 64px)', fontWeight: 700, color: CREAM },
  heroDivider: { color: GOLD, fontWeight: 300 },
  heroSub: { fontSize: 15, color: 'rgba(249, 247, 234, 0.65)', maxWidth: 600, lineHeight: 1.8 },

  // Pipeline
  pipelineWrap: { display: 'flex', alignItems: 'flex-start', justifyContent: 'center', marginBottom: 48, overflowX: 'auto', padding: '8px 0' },
  pipelineItem: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, position: 'relative', flex: '0 0 auto' },
  pipelineItemYT: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, flex: '0 0 auto', marginLeft: 28, paddingLeft: 28, borderLeft: `1px solid ${BORDER_GOLD}` },
  pipelineNode: { width: 46, height: 46, borderRadius: '50%', border: `1.5px solid ${BORDER_STRONG}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, color: TEXT_SOFT, transition: 'all 0.4s', background: CREAM_2 },
  pipelineNodeActive: { border: `1.5px solid ${GOLD}`, color: DARK, background: GOLD, boxShadow: `0 0 0 6px rgba(205, 137, 28, 0.15)` },
  pipelineNodeDone: { border: `1.5px solid ${GOLD}`, color: GOLD, background: CREAM },
  pipelineLabel: { fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', color: TEXT_SOFT, textAlign: 'center', maxWidth: 80, lineHeight: 1.3, transition: 'color 0.4s', fontWeight: 600 },
  pipelineLabelActive: { color: DARK },
  pipelineConnector: { position: 'absolute', top: 23, left: 'calc(50% + 23px)', width: 'calc(100% - 8px)', height: 1.5, background: BORDER, transition: 'background 0.4s' },
  pipelineConnectorActive: { background: GOLD },

  // Cards (cream panels in the layout)
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 },
  card: { background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 4, padding: 24, boxShadow: '0 1px 3px rgba(27, 24, 15, 0.04)' },
  cardLabelRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  cardLabel: { fontSize: 10, letterSpacing: 3, fontWeight: 800, color: GOLD, textTransform: 'uppercase' },
  modeToggle: { display: 'flex', gap: 2, background: CREAM_2, borderRadius: 4, padding: 3 },
  modeBtn: { background: 'transparent', border: 'none', color: TEXT_MUTED, fontSize: 10, fontWeight: 700, letterSpacing: 1, padding: '5px 11px', borderRadius: 3, cursor: 'pointer', textTransform: 'uppercase', transition: 'all 0.2s', fontFamily: 'inherit' },
  modeBtnActive: { background: DARK, color: CREAM },

  // Dropzone
  dropzone: { border: `1.5px dashed ${BORDER_STRONG}`, borderRadius: 4, padding: '36px 24px', textAlign: 'center', cursor: 'pointer', transition: 'all 0.3s', minHeight: 165, display: 'flex', alignItems: 'center', justifyContent: 'center', background: CREAM_2 },
  dropzoneActive: { border: `1.5px dashed ${GOLD}`, background: 'rgba(205, 137, 28, 0.05)' },
  dropzoneFilled: { border: `1.5px solid ${GOLD}`, background: 'rgba(205, 137, 28, 0.04)' },
  dropContent: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 },
  dropIconLg: { fontSize: 28, color: TEXT_SOFT },
  dropText: { fontSize: 14, color: TEXT_MUTED, fontWeight: 500 },
  dropSub: { fontSize: 11, color: TEXT_SOFT, letterSpacing: 0.5 },
  fileInfo: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 },
  fileIcon: { fontSize: 22, color: GOLD },
  fileName: { fontSize: 13, fontWeight: 700, color: TEXT },
  fileSize: { fontSize: 11, color: TEXT_MUTED },
  fileChange: { fontSize: 10, color: GOLD, letterSpacing: 1, fontWeight: 600 },

  // YouTube fetch box
  ytFetchBox: { display: 'flex', flexDirection: 'column', gap: 10, padding: '8px 0' },
  ytUrlInput: { background: CREAM_2, border: `1px solid ${BORDER}`, borderRadius: 4, padding: '12px 14px', color: TEXT, fontSize: 13, fontFamily: 'inherit', transition: 'all 0.2s' },
  ytFetchBtn: { background: RED, border: 'none', borderRadius: 4, padding: '12px 20px', fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: CREAM, cursor: 'pointer', textTransform: 'uppercase', transition: 'all 0.3s', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit' },
  ytFetchSuccess: { fontSize: 12, color: TEAL, padding: '8px 12px', background: 'rgba(11, 106, 98, 0.08)', borderRadius: 3, fontWeight: 500 },
  ytFetchNote: { fontSize: 11, color: TEXT_SOFT, lineHeight: 1.6 },
  error: { marginTop: 10, fontSize: 12, color: RED, textAlign: 'center', fontWeight: 500 },

  // Languages
  langGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 },
  langBtn: { background: CREAM_2, border: `1px solid ${BORDER}`, borderRadius: 4, padding: '11px 6px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, transition: 'all 0.2s', position: 'relative', fontFamily: 'inherit' },
  langBtnActive: { background: 'rgba(205, 137, 28, 0.1)', border: `1.5px solid ${GOLD}` },
  langFlag: { fontSize: 19 },
  langName: { fontSize: 10, color: TEXT_MUTED, letterSpacing: 0.3, textAlign: 'center', fontWeight: 500 },
  langCheck: { position: 'absolute', top: 4, right: 5, fontSize: 9, color: GOLD, fontWeight: 800 },
  langCount: { marginTop: 13, fontSize: 11, color: GOLD, letterSpacing: 1, textAlign: 'right', fontWeight: 600 },

  // Glossary
  glossaryCard: { background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 4, marginBottom: 16, overflow: 'hidden', boxShadow: '0 1px 3px rgba(27, 24, 15, 0.04)' },
  glossaryHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', cursor: 'pointer', userSelect: 'none' },
  glossaryTitle: { display: 'flex', alignItems: 'center', gap: 12, fontSize: 10, fontWeight: 800, letterSpacing: 3, color: GOLD, textTransform: 'uppercase' },
  glossaryIcon: { fontSize: 14 },
  glossaryCount: { fontSize: 10, color: TEXT_SOFT, fontWeight: 500, letterSpacing: 1, textTransform: 'none' },
  glossaryBody: { padding: '0 24px 24px', borderTop: `1px solid ${BORDER}` },
  glossaryNote: { background: CREAM_2, border: `1px solid ${BORDER}`, borderLeft: `3px solid ${GOLD}`, borderRadius: 2, padding: 14, fontSize: 12, color: TEXT_MUTED, lineHeight: 1.7, margin: '16px 0' },
  glossaryActions: { display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' },
  glossaryActionBtn: { background: CREAM_2, border: `1px solid ${BORDER}`, borderRadius: 3, padding: '7px 12px', fontSize: 11, color: TEXT_MUTED, cursor: 'pointer', fontWeight: 600, letterSpacing: 0.5, fontFamily: 'inherit', transition: 'all 0.2s' },
  glossaryTable: { background: CREAM_2, borderRadius: 4, padding: 6, border: `1px solid ${BORDER}` },
  glossaryRowHeader: { display: 'grid', gridTemplateColumns: '1.4fr 1.4fr 0.8fr 1.6fr 0.3fr', gap: 6, padding: '8px 6px', fontSize: 9, color: GOLD, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 800 },
  glossaryRow: { display: 'grid', gridTemplateColumns: '1.4fr 1.4fr 0.8fr 1.6fr 0.3fr', gap: 6, padding: 4, alignItems: 'center' },
  glossaryColTerm: {}, glossaryColTrans: {}, glossaryColKeep: {}, glossaryColNotes: {}, glossaryColDel: {},
  glossaryInput: { background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 3, padding: '7px 10px', color: TEXT, fontSize: 12, fontFamily: 'inherit', width: '100%' },
  glossaryCheckLabel: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: TEXT_MUTED, cursor: 'pointer', fontWeight: 500 },
  glossaryCheck: { accentColor: GOLD, cursor: 'pointer' },
  glossaryDelBtn: { background: 'transparent', border: 'none', color: 'rgba(214, 78, 62, 0.5)', fontSize: 18, cursor: 'pointer', padding: 4 },
  glossarySaved: { marginTop: 14, fontSize: 11, color: TEAL, letterSpacing: 0.5, fontWeight: 500 },

  // YouTube config
  ytConfigCard: { background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 4, marginBottom: 16, overflow: 'hidden', boxShadow: '0 1px 3px rgba(27, 24, 15, 0.04)' },
  ytConfigHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', cursor: 'pointer', userSelect: 'none' },
  ytConfigTitle: { display: 'flex', alignItems: 'center', gap: 12, fontSize: 10, fontWeight: 800, letterSpacing: 3, color: GOLD, textTransform: 'uppercase' },
  ytIcon: { fontSize: 14, color: RED },
  ytOptional: { fontSize: 10, color: TEXT_SOFT, fontWeight: 500, letterSpacing: 1, textTransform: 'none' },
  ytChevron: { fontSize: 10, color: TEXT_SOFT },
  ytConfigBody: { padding: '0 24px 24px', borderTop: `1px solid ${BORDER}` },
  ytInfoBox: { background: CREAM_2, border: `1px solid ${BORDER}`, borderLeft: `3px solid ${GOLD}`, borderRadius: 2, padding: 18, margin: '16px 0' },
  ytInfoTitle: { fontSize: 11, fontWeight: 800, color: GOLD, letterSpacing: 1, marginBottom: 14, textTransform: 'uppercase' },
  ytSteps: { display: 'flex', flexDirection: 'column', gap: 10 },
  ytStep: { display: 'flex', alignItems: 'flex-start', gap: 10 },
  ytStepNum: { minWidth: 18, height: 18, borderRadius: '50%', background: GOLD, color: CREAM, fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 },
  ytStepText: { fontSize: 12, color: TEXT_MUTED, lineHeight: 1.6 },
  ytInfoNote: { marginTop: 12, fontSize: 11, color: TEXT_SOFT, borderTop: `1px solid ${BORDER}`, paddingTop: 12 },
  link: { color: GOLD, fontWeight: 600 },
  code: { background: 'rgba(205, 137, 28, 0.12)', padding: '1px 5px', borderRadius: 2, fontSize: 10, fontFamily: 'monospace', color: DARK },
  ytFields: { display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 },
  ytField: { display: 'flex', flexDirection: 'column', gap: 6 },
  ytLabel: { fontSize: 10, letterSpacing: 1.5, color: TEXT_MUTED, textTransform: 'uppercase', fontWeight: 700 },
  ytInput: { background: CREAM_2, border: `1px solid ${BORDER}`, borderRadius: 3, padding: '10px 14px', color: TEXT, fontSize: 13, fontFamily: 'inherit' },
  ytReady: { marginTop: 12, fontSize: 11, color: TEAL, fontWeight: 600 },

  // Translate button
  actionRow: { display: 'flex', justifyContent: 'center', marginBottom: 22 },
  translateBtn: { background: DARK, border: `1.5px solid ${GOLD}`, borderRadius: 4, padding: '16px 48px', fontSize: 12, fontWeight: 800, letterSpacing: 2.5, color: CREAM, cursor: 'pointer', textTransform: 'uppercase', transition: 'all 0.3s', boxShadow: `0 4px 20px rgba(27, 24, 15, 0.15)`, fontFamily: 'inherit' },
  translateBtnDisabled: { opacity: 0.3, cursor: 'not-allowed' },
  translateBtnRunning: { background: CREAM_2, color: DARK, border: `1.5px solid ${GOLD}` },
  btnInner: { display: 'flex', alignItems: 'center' },
  btnDisabled: { opacity: 0.4, cursor: 'not-allowed' },

  // Progress
  progressCard: { background: CREAM_2, border: `1px solid ${BORDER}`, borderLeft: `3px solid ${GOLD}`, borderRadius: 2, padding: 22, marginBottom: 22 },
  progressTitle: { fontSize: 10, letterSpacing: 3, color: GOLD, marginBottom: 14, textTransform: 'uppercase', fontWeight: 800 },
  progressGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 7 },
  progressItem: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 11px', borderRadius: 3, background: '#fff', border: `1px solid ${BORDER}`, fontSize: 12 },
  progressItemActive: { border: `1.5px solid ${GOLD}` },
  progressItemDone: { border: `1px solid ${TEAL}`, background: 'rgba(11, 106, 98, 0.04)' },
  progressLang: { flex: 1, fontSize: 11, color: TEXT, fontWeight: 500 },
  progressStatus: { fontSize: 12, color: GOLD, fontWeight: 800 },

  // Results
  resultsSection: { marginTop: 8 },
  resultsHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 12 },
  resultsTitle: { fontSize: 18, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 12, color: TEXT },
  resultsTitleAccent: { color: GOLD },
  resultsActions: { display: 'flex', gap: 10 },
  uploadAllBtn: { padding: '11px 20px', fontSize: 11, background: BLUE, borderColor: BLUE, color: CREAM },
  downloadAllBtn: { padding: '11px 20px', fontSize: 11 },
  resultsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: 14 },
  resultCard: { background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 4, padding: 18, transition: 'all 0.2s', boxShadow: '0 1px 3px rgba(27, 24, 15, 0.04)' },
  resultLang: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 },
  resultFlag: { fontSize: 24 },
  resultLangName: { fontSize: 13, fontWeight: 700, color: TEXT },
  resultMeta: { fontSize: 10, color: GOLD, letterSpacing: 1, marginTop: 2, fontWeight: 600, textTransform: 'uppercase' },
  uploadedBadge: { color: TEAL, letterSpacing: 0.5 },
  resultPreview: { background: CREAM_2, border: `1px solid ${BORDER}`, borderRadius: 3, padding: 11, marginBottom: 12, minHeight: 64 },
  previewBlock: { marginBottom: 7 },
  previewTime: { fontSize: 9, color: GOLD, letterSpacing: 0.5, marginBottom: 2, fontFamily: 'monospace', fontWeight: 700 },
  previewText: { fontSize: 11, color: TEXT, lineHeight: 1.5 },
  uploadError: { fontSize: 11, color: RED, marginBottom: 8, fontWeight: 500 },
  resultBtns: { display: 'flex', gap: 8 },
  resultActionBtn: { flex: 1, justifyContent: 'center', padding: '9px 0', fontSize: 10, letterSpacing: 1.5, display: 'flex', alignItems: 'center' },
  ytUploadBtn: { background: 'rgba(16, 79, 132, 0.08)', border: `1px solid ${BLUE}`, color: BLUE },
  ytSuccessBar: { marginTop: 20, padding: '14px 20px', background: 'rgba(11, 106, 98, 0.08)', border: `1px solid ${TEAL}`, borderRadius: 3, fontSize: 13, color: TEAL, lineHeight: 1.6, fontWeight: 500 },

  // Activity Dashboard
  dashSection: { marginTop: 56, padding: '32px 0 0', borderTop: `1px solid ${BORDER}` },
  dashHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 },
  dashTitle: { display: 'flex', alignItems: 'center', gap: 14 },
  dashLive: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 9, fontWeight: 800, letterSpacing: 2.5, color: RED, background: 'rgba(214, 78, 62, 0.08)', border: `1px solid rgba(214, 78, 62, 0.3)`, padding: '4px 10px', borderRadius: 2, textTransform: 'uppercase' },
  dashTitleText: { fontSize: 18, fontWeight: 800, letterSpacing: -0.3, color: TEXT },
  dashSubtitle: { display: 'flex', alignItems: 'center', gap: 16, fontSize: 11, color: TEXT_MUTED },
  dashSubAccent: { color: GOLD, fontWeight: 700 },
  dashReset: { background: 'transparent', border: `1px solid ${BORDER_STRONG}`, color: TEXT_MUTED, fontSize: 10, fontWeight: 700, letterSpacing: 1, padding: '5px 10px', borderRadius: 3, cursor: 'pointer', textTransform: 'uppercase', fontFamily: 'inherit', transition: 'all 0.2s' },
  dashGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 },
  dashCard: { background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 4, padding: 22, transition: 'all 0.3s', position: 'relative', overflow: 'hidden', boxShadow: '0 1px 3px rgba(27, 24, 15, 0.04)' },
  dashCardLabel: { fontSize: 9, letterSpacing: 2.5, color: GOLD, textTransform: 'uppercase', fontWeight: 800, marginBottom: 14 },
  dashCardNum: { fontSize: 42, fontWeight: 800, color: DARK, letterSpacing: -1.5, lineHeight: 1, marginBottom: 6, fontVariantNumeric: 'tabular-nums', fontFamily: 'Chivo, sans-serif' },
  dashCardSub: { fontSize: 11, color: TEXT_SOFT, letterSpacing: 0.3 },
  dashFooter: { marginTop: 20, fontSize: 10, color: TEXT_SOFT, textAlign: 'center', letterSpacing: 1, fontStyle: 'italic' },
};

const g = {
  root: { maxWidth: 920, margin: '0 auto', padding: '48px 32px 80px' },
  hero: { background: DARK, color: CREAM, margin: '0 -32px 48px', padding: '56px 64px 48px', position: 'relative' },
  heroLabel: { fontSize: 9, letterSpacing: 4, color: GOLD, marginBottom: 14, textTransform: 'uppercase', fontWeight: 600 },
  heroTitle: { fontSize: 38, fontWeight: 800, margin: '0 0 14px', letterSpacing: -1, color: CREAM },
  heroSub: { fontSize: 15, color: 'rgba(249, 247, 234, 0.65)', lineHeight: 1.8, maxWidth: 600 },
  phases: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 48 },
  phaseCard: { background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 4, overflow: 'hidden', display: 'flex', boxShadow: '0 1px 3px rgba(27, 24, 15, 0.04)' },
  phaseStripe: { width: 4, flexShrink: 0 },
  phaseContent: { padding: 24, flex: 1 },
  phaseTag: { fontSize: 9, fontWeight: 800, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 10 },
  phaseTitle: { fontSize: 15, fontWeight: 800, marginBottom: 18, color: TEXT, lineHeight: 1.3 },
  step: { display: 'flex', alignItems: 'flex-start', gap: 11, marginBottom: 11 },
  stepNum: { minWidth: 22, height: 22, borderRadius: '50%', border: '1.5px solid', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 },
  stepText: { fontSize: 12.5, color: TEXT_MUTED, lineHeight: 1.6 },
  tipsTitle: { fontSize: 13, fontWeight: 800, letterSpacing: 2.5, color: GOLD, textTransform: 'uppercase', marginBottom: 22 },
  tipsGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 },
  tipCard: { background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 4, padding: 20, boxShadow: '0 1px 3px rgba(27, 24, 15, 0.04)' },
  tipIcon: { fontSize: 22, marginBottom: 11 },
  tipTitle: { fontSize: 13, fontWeight: 800, marginBottom: 9, color: TEXT },
  tipText: { fontSize: 11.5, color: TEXT_MUTED, lineHeight: 1.6 },
};
