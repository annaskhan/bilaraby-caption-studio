import { useState, useRef, useCallback, useEffect } from 'react';
import Head from 'next/head';

// ============================================================================
// VOLUNTEER ROSTER — replace placeholder names with actual volunteers later
// Format: { code: 'XXXX' (4 chars, uppercase), name: 'First Last' }
// Admin code is 'BILARABY' and unlocks the admin dashboard.
// ============================================================================
const VOLUNTEERS = [
  { code: 'V001', name: 'Volunteer 1' },
  { code: 'V002', name: 'Volunteer 2' },
  { code: 'V003', name: 'Volunteer 3' },
  { code: 'V004', name: 'Volunteer 4' },
  { code: 'V005', name: 'Volunteer 5' },
  { code: 'V006', name: 'Volunteer 6' },
  { code: 'V007', name: 'Volunteer 7' },
  { code: 'V008', name: 'Volunteer 8' },
  { code: 'V009', name: 'Volunteer 9' },
  { code: 'V010', name: 'Volunteer 10' },
];
const ADMIN_CODE = 'BILARABY';
const ADMIN_NAME = 'Admin';

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
  { id: 'upload',    label: 'Source',     icon: '◇' },
  { id: 'parse',     label: 'Parse',      icon: '◈' },
  { id: 'translate', label: 'Translate',  icon: '✦' },
  { id: 'compile',   label: 'Compile',    icon: '◇' },
  { id: 'ready',     label: 'Ready',      icon: '◆' },
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

async function uploadToYouTubeServer(srtContent, videoId, langCode, langLabel) {
  const response = await fetch('/api/youtube-upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ srtContent, videoId, langCode, langLabel }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Upload failed');
  return data.captionId;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ============================================================================
// LOGIN SCREEN
// ============================================================================
function LoginScreen({ onLogin }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef();

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleLogin = (e) => {
    e?.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (trimmed === ADMIN_CODE) {
      onLogin({ code: 'ADMIN', name: ADMIN_NAME, isAdmin: true });
      return;
    }
    const found = VOLUNTEERS.find(v => v.code.toUpperCase() === trimmed);
    if (found) {
      onLogin({ code: found.code, name: found.name, isAdmin: false });
      return;
    }
    setError('Code not recognised. Please check with your admin.');
  };

  return (
    <div style={l.root}>
      <div style={l.panel}>
        <div style={l.brandMark}>
          <span className="brand-diamond-lg" />
        </div>
        <div style={l.label}>BilAraby</div>
        <h1 style={l.title}>Translate</h1>
        <div style={l.divider} />
        <p style={l.sub}>Enter your volunteer access code to continue</p>
        <form onSubmit={handleLogin} style={l.form}>
          <input
            ref={inputRef}
            value={code}
            onChange={(e) => { setCode(e.target.value); setError(''); }}
            placeholder="ACCESS CODE"
            style={l.input}
            maxLength={20}
            autoComplete="off"
          />
          {error && <div style={l.error}>{error}</div>}
          <button type="submit" style={l.btn} className="login-btn">Enter</button>
        </form>
        <div style={l.footer}>
          An Initiative of Qatar Foundation
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN APP
// ============================================================================
export default function Home() {
  // Session
  const [user, setUser] = useState(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);

  // Theme (dark mode)
  const [theme, setTheme] = useState('light');

  // Translation timer
  const [elapsed, setElapsed] = useState(0);
  const [estimatedTotal, setEstimatedTotal] = useState(0);
  const timerRef = useRef(null);

  // Performance benchmarks for ETA (per-segment-per-language average in ms)
  const [avgMsPerUnit, setAvgMsPerUnit] = useState(450); // sensible default

  // Recently translated jobs
  const [recentJobs, setRecentJobs] = useState([]);

  // Sound notification preference
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Translation flow
  const [file, setFile]                   = useState(null);
  const [srtContent, setSrtContent]       = useState('');
  const [selectedLangs, setSelectedLangs] = useState(['en', 'fr', 'es']);
  const [langOrder, setLangOrder] = useState(LANGUAGES.map(l => l.code));
  const [draggedLang, setDraggedLang] = useState(null);
  const [stage, setStage]                 = useState('idle');
  const [activeStageIndex, setActiveStageIndex] = useState(-1);
  const [results, setResults]             = useState({});
  const [error, setError]                 = useState('');
  const [dragOver, setDragOver]           = useState(false);
  const [progress, setProgress]           = useState({});
  const [uploadStatus, setUploadStatus]   = useState({});
  const [activeTab, setActiveTab]         = useState('translate');

  // Input mode
  const [inputMode, setInputMode] = useState('file');
  const [ytFetchUrl, setYtFetchUrl] = useState('');
  const [ytFetching, setYtFetching] = useState(false);

  // Glossary
  const [glossary, setGlossary] = useState(DEFAULT_GLOSSARY);
  const [glossaryExpanded, setGlossaryExpanded] = useState(false);

  // YouTube upload
  const [ytExpanded, setYtExpanded] = useState(false);
  const [videoId, setVideoId] = useState('');
  const [ytConfigured, setYtConfigured] = useState(null);

  // DOCX re-upload (review workflow)
  const [reuploadExpanded, setReuploadExpanded] = useState(false);
  const [reuploadFile, setReuploadFile] = useState(null);
  const [reuploadLang, setReuploadLang] = useState('en');
  const [reuploadStatus, setReuploadStatus] = useState(null); // null | 'parsing' | 'ready' | 'uploaded' | 'error'
  const [reuploadResult, setReuploadResult] = useState(null);
  const reuploadInputRef = useRef();

  // Stats — global + per user
  const [stats, setStats] = useState({
    videosTranslated: 0, languagesGenerated: 0, segmentsTranslated: 0,
    youtubeDraftsPushed: 0, lastUsed: null, firstUsed: null,
  });
  const [animatedStats, setAnimatedStats] = useState({
    videosTranslated: 0, languagesGenerated: 0, segmentsTranslated: 0, youtubeDraftsPushed: 0,
  });
  const [allUserStats, setAllUserStats] = useState({});

  const fileRef = useRef();

  // Load session
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = localStorage.getItem('bilaraby_session');
    if (saved) {
      try { setUser(JSON.parse(saved)); } catch {}
    }
    const savedTheme = localStorage.getItem('bilaraby_theme');
    if (savedTheme === 'dark' || savedTheme === 'light') setTheme(savedTheme);
    const savedSound = localStorage.getItem('bilaraby_sound');
    if (savedSound === 'false') setSoundEnabled(false);
    setSessionLoaded(true);
  }, []);

  // Apply theme to document
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.setAttribute('data-theme', theme);
    if (sessionLoaded) localStorage.setItem('bilaraby_theme', theme);
  }, [theme, sessionLoaded]);

  // Persist sound preference
  useEffect(() => {
    if (typeof window === 'undefined' || !sessionLoaded) return;
    localStorage.setItem('bilaraby_sound', String(soundEnabled));
  }, [soundEnabled, sessionLoaded]);

  // Load and persist performance benchmark for ETA
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = localStorage.getItem('bilaraby_avg_ms');
    if (saved) {
      const n = parseFloat(saved);
      if (!isNaN(n) && n > 0) setAvgMsPerUnit(n);
    }
  }, []);
  useEffect(() => {
    if (typeof window === 'undefined' || !sessionLoaded) return;
    localStorage.setItem('bilaraby_avg_ms', String(avgMsPerUnit));
  }, [avgMsPerUnit, sessionLoaded]);

  // Load recent jobs per user
  useEffect(() => {
    if (typeof window === 'undefined' || !user) return;
    const saved = localStorage.getItem(`bilaraby_recent_${user.code}`);
    if (saved) {
      try { setRecentJobs(JSON.parse(saved)); } catch { setRecentJobs([]); }
    } else {
      setRecentJobs([]);
    }
  }, [user]);
  // Persist recent jobs
  useEffect(() => {
    if (typeof window === 'undefined' || !user || !sessionLoaded) return;
    localStorage.setItem(`bilaraby_recent_${user.code}`, JSON.stringify(recentJobs));
  }, [recentJobs, user, sessionLoaded]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      // Cmd+Enter / Ctrl+Enter: run translation
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        if (file && selectedLangs.length > 0 && stage !== 'running') {
          runTranslation();
        }
      }
      // Escape: close any open dialogs/sections
      if (e.key === 'Escape') {
        setGlossaryExpanded(false);
        setYtExpanded(false);
        setReuploadExpanded(false);
      }
      // Cmd/Ctrl + D: toggle dark mode
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        setTheme(t => t === 'dark' ? 'light' : 'dark');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  // Save session
  useEffect(() => {
    if (typeof window === 'undefined' || !sessionLoaded) return;
    if (user) localStorage.setItem('bilaraby_session', JSON.stringify(user));
    else localStorage.removeItem('bilaraby_session');
  }, [user, sessionLoaded]);

  // Check YouTube config
  useEffect(() => {
    if (!user) return;
    fetch('/api/youtube-status')
      .then(r => r.json())
      .then(d => setYtConfigured(d.configured))
      .catch(() => setYtConfigured(false));
  }, [user]);

  // Load glossary
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = localStorage.getItem('bilaraby_glossary');
    if (saved) try { setGlossary(JSON.parse(saved)); } catch {}
  }, []);
  useEffect(() => {
    if (typeof window !== 'undefined') localStorage.setItem('bilaraby_glossary', JSON.stringify(glossary));
  }, [glossary]);

  // Load stats — per user + global
  useEffect(() => {
    if (typeof window === 'undefined' || !user) return;
    const userKey = `bilaraby_stats_${user.code}`;
    const allKey = 'bilaraby_stats_all';
    const userSaved = localStorage.getItem(userKey);
    const allSaved = localStorage.getItem(allKey);
    if (userSaved) {
      try {
        const parsed = JSON.parse(userSaved);
        setStats(parsed);
        setAnimatedStats({
          videosTranslated: parsed.videosTranslated || 0,
          languagesGenerated: parsed.languagesGenerated || 0,
          segmentsTranslated: parsed.segmentsTranslated || 0,
          youtubeDraftsPushed: parsed.youtubeDraftsPushed || 0,
        });
      } catch {}
    } else {
      setStats({ videosTranslated: 0, languagesGenerated: 0, segmentsTranslated: 0, youtubeDraftsPushed: 0, lastUsed: null, firstUsed: null });
      setAnimatedStats({ videosTranslated: 0, languagesGenerated: 0, segmentsTranslated: 0, youtubeDraftsPushed: 0 });
    }
    if (allSaved) {
      try { setAllUserStats(JSON.parse(allSaved)); } catch {}
    }
  }, [user]);

  // Persist user stats + global
  useEffect(() => {
    if (typeof window === 'undefined' || !user) return;
    localStorage.setItem(`bilaraby_stats_${user.code}`, JSON.stringify(stats));
    // Update all-user record
    const allKey = 'bilaraby_stats_all';
    const allSaved = localStorage.getItem(allKey);
    let all = {};
    try { all = allSaved ? JSON.parse(allSaved) : {}; } catch {}
    all[user.code] = { ...stats, name: user.name };
    localStorage.setItem(allKey, JSON.stringify(all));
    setAllUserStats(all);
  }, [stats, user]);

  // Animate stat counters
  useEffect(() => {
    const keys = ['videosTranslated', 'languagesGenerated', 'segmentsTranslated', 'youtubeDraftsPushed'];
    const startVals = { ...animatedStats };
    const diffs = {};
    keys.forEach(k => { diffs[k] = stats[k] - startVals[k]; });
    if (keys.every(k => diffs[k] === 0)) return;
    let step = 0;
    const steps = 24;
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
    }, 800 / steps);
    return () => clearInterval(interval);
  }, [stats.videosTranslated, stats.languagesGenerated, stats.segmentsTranslated, stats.youtubeDraftsPushed]);

  // ========= File / YouTube fetch =========
  const handleFile = useCallback((f) => {
    if (!f || !f.name.endsWith('.srt')) { setError('Please upload a valid .srt file'); return; }
    setError(''); setResults({}); setStage('idle'); setActiveStageIndex(-1); setUploadStatus({});
    const reader = new FileReader();
    reader.onload = (e) => { setSrtContent(e.target.result); setFile(f); };
    reader.readAsText(f);
  }, []);

  const onDrop = (e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); };
  const toggleLang = (code) => setSelectedLangs(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]);

  const toggleAllLangs = () => {
    if (selectedLangs.length === LANGUAGES.length) {
      setSelectedLangs([]);
    } else {
      setSelectedLangs(LANGUAGES.map(l => l.code));
    }
  };

  // Drag-and-drop language reordering
  const handleLangDragStart = (e, code) => {
    setDraggedLang(code);
    e.dataTransfer.effectAllowed = 'move';
    // For Firefox compatibility
    try { e.dataTransfer.setData('text/plain', code); } catch {}
  };
  const handleLangDragOver = (e, code) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!draggedLang || draggedLang === code) return;
    setLangOrder(prev => {
      const next = [...prev];
      const fromIdx = next.indexOf(draggedLang);
      const toIdx = next.indexOf(code);
      if (fromIdx === -1 || toIdx === -1) return prev;
      next.splice(fromIdx, 1);
      next.splice(toIdx, 0, draggedLang);
      return next;
    });
  };
  const handleLangDragEnd = () => setDraggedLang(null);

  // Persist language order across sessions
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = localStorage.getItem('bilaraby_lang_order');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length === LANGUAGES.length) {
          setLangOrder(parsed);
        }
      } catch {}
    }
  }, []);
  useEffect(() => {
    if (typeof window === 'undefined' || !sessionLoaded) return;
    localStorage.setItem('bilaraby_lang_order', JSON.stringify(langOrder));
  }, [langOrder, sessionLoaded]);

  const fetchFromYouTube = async () => {
    if (!ytFetchUrl.trim()) { setError('Please enter a YouTube URL or video ID'); return; }
    setError(''); setYtFetching(true); setResults({}); setStage('idle'); setActiveStageIndex(-1);
    try {
      const data = await fetchYouTubeCaptions(ytFetchUrl);
      setSrtContent(data.srtContent);
      setFile({ name: `youtube_${data.videoId}.srt`, size: data.srtContent.length });
      if (data.videoId && !videoId) setVideoId(data.videoId);
    } catch (e) {
      setError(e.message);
    } finally {
      setYtFetching(false);
    }
  };

  // ========= Translate =========
  const runTranslation = async () => {
    if (!srtContent || selectedLangs.length === 0) return;
    setError(''); setResults({}); setStage('running'); setProgress({}); setUploadStatus({});

    // Calculate estimated total based on segments × languages × historical avg
    const initialBlocks = parseSRT(srtContent);
    const workUnits = initialBlocks.length * selectedLangs.length;
    const estimateSeconds = Math.max(15, Math.round((workUnits * avgMsPerUnit) / 1000));
    setEstimatedTotal(estimateSeconds);

    // Start elapsed timer
    setElapsed(0);
    const startTime = Date.now();
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    try {
      setActiveStageIndex(0); await sleep(400);
      setActiveStageIndex(1);
      const blocks = initialBlocks;
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

      // Stop timer + update rolling benchmark
      const finalElapsedMs = Date.now() - startTime;
      const successfulLangs = Object.keys(newResults).length;
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      if (successfulLangs > 0 && blocks.length > 0) {
        const observedMsPerUnit = finalElapsedMs / (blocks.length * successfulLangs);
        // Rolling average: weighted 70% old, 30% new (smooth but adaptive)
        setAvgMsPerUnit(prev => Math.round(prev * 0.7 + observedMsPerUnit * 0.3));
      }

      // Play completion sound + browser notification
      playCompletionSound();
      maybeNotify(`Translation complete — ${successfulLangs} languages ready`);

      // Auto-scroll to results when complete
      setTimeout(() => {
        document.getElementById('results-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 600);

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

        // Save to recent jobs (max 5, newest first)
        const job = {
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          filename: file?.name || 'untitled.srt',
          videoId: videoId || '',
          srtContent,
          results: newResults,
          languages: Object.keys(newResults),
          segmentCount,
          completedAt: now,
        };
        setRecentJobs(prev => [job, ...prev].slice(0, 5));
      }
      if (videoId && ytConfigured) setYtExpanded(true);
    } catch (e) {
      setError('Translation failed. Please try again.');
      setStage('idle');
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    }
  };

  // Sound + notification helpers
  const playCompletionSound = () => {
    if (!soundEnabled) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      // Two soft tones — like a gentle chime
      const playTone = (freq, start, duration) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = 'sine';
        gain.gain.setValueAtTime(0, ctx.currentTime + start);
        gain.gain.linearRampToValueAtTime(0.12, ctx.currentTime + start + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + duration);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + duration);
      };
      playTone(880, 0, 0.25);    // A5
      playTone(1320, 0.15, 0.35); // E6
    } catch {}
  };

  const maybeNotify = (msg) => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (document.hasFocus()) return; // only notify if user is on another tab
    if (Notification.permission === 'granted') {
      new Notification('BilAraby Translate', { body: msg, icon: '/favicon.ico', silent: true });
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then(perm => {
        if (perm === 'granted') new Notification('BilAraby Translate', { body: msg, silent: true });
      });
    }
  };

  const formatElapsed = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
  };

  // ========= Downloads =========
  const download = (code) => {
    const blob = new Blob([results[code]], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${file?.name?.replace('.srt', '') || 'subtitles'}_${code}.srt`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const downloadAll = () => Object.keys(results).forEach((c, i) => setTimeout(() => download(c), i * 200));

  const downloadDocx = async (code) => {
    const lang = LANGUAGES.find(l => l.code === code);
    const originalBlocks = parseSRT(srtContent);
    try {
      const response = await fetch('/api/generate-docx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          langLabel: lang.label,
          langCode: code,
          videoTitle: file?.name?.replace('.srt', '') || '',
          videoId,
          originalBlocks,
          translatedSrt: results[code],
        }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'DOCX generation failed');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${file?.name?.replace('.srt', '') || 'subtitles'}_${code}_review.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(`Failed to generate review document: ${e.message}`);
    }
  };
  const downloadAllDocx = () => Object.keys(results).forEach((c, i) => setTimeout(() => downloadDocx(c), i * 400));

  // ========= YouTube upload =========
  const handleUpload = async (code) => {
    const lang = LANGUAGES.find(l => l.code === code);
    if (!videoId.trim()) { setError('Please enter a YouTube Video ID before uploading.'); return; }
    if (!ytConfigured) { setError('YouTube upload is not configured. Contact your admin.'); return; }
    setUploadStatus(s => ({ ...s, [code]: 'uploading' }));
    try {
      await uploadToYouTubeServer(results[code], videoId.trim(), lang.ytCode, lang.label);
      setUploadStatus(s => ({ ...s, [code]: 'done' }));
      setStats(prev => ({ ...prev, youtubeDraftsPushed: prev.youtubeDraftsPushed + 1, lastUsed: new Date().toISOString() }));
    } catch (e) {
      setUploadStatus(s => ({ ...s, [code]: `error:${e.message}` }));
    }
  };
  const handleUploadAll = async () => {
    for (const code of Object.keys(results)) { await handleUpload(code); await sleep(800); }
  };

  // ========= DOCX Re-upload (Review Workflow) =========
  const handleReuploadFile = async (f) => {
    if (!f || !f.name.match(/\.docx$/i)) {
      setError('Please upload a .docx review file');
      return;
    }
    setError('');
    setReuploadFile(f);
    setReuploadStatus('parsing');
    setReuploadResult(null);

    const formData = new FormData();
    formData.append('file', f);

    try {
      const response = await fetch('/api/parse-docx', { method: 'POST', body: formData });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to parse document');
      setReuploadResult(data);
      setReuploadStatus('ready');
    } catch (e) {
      setReuploadStatus('error');
      setError(`Re-upload failed: ${e.message}`);
    }
  };

  const downloadReuploadedSrt = () => {
    if (!reuploadResult) return;
    const blob = new Blob([reuploadResult.srtContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${reuploadFile.name.replace(/\.docx$/i, '').replace(/_review$/, '')}_corrected.srt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const uploadReuploadedToYouTube = async () => {
    if (!reuploadResult || !videoId.trim() || !ytConfigured) {
      setError('Need video ID and YouTube credentials configured');
      return;
    }
    const lang = LANGUAGES.find(l => l.code === reuploadLang);
    setReuploadStatus('uploading');
    try {
      await uploadToYouTubeServer(reuploadResult.srtContent, videoId.trim(), lang.ytCode, lang.label);
      setReuploadStatus('uploaded');
      setStats(prev => ({ ...prev, youtubeDraftsPushed: prev.youtubeDraftsPushed + 1, lastUsed: new Date().toISOString() }));
    } catch (e) {
      setReuploadStatus('error');
      setError(`YouTube upload failed: ${e.message}`);
    }
  };

  const resetReupload = () => {
    setReuploadFile(null);
    setReuploadStatus(null);
    setReuploadResult(null);
  };

  // Reopen a recent job — restores SRT, results, file metadata
  const reopenRecentJob = (job) => {
    setSrtContent(job.srtContent);
    setFile({ name: job.filename, size: job.srtContent.length });
    setResults(job.results);
    setSelectedLangs(job.languages);
    setVideoId(job.videoId || '');
    setStage('done');
    setActiveStageIndex(4);
    setError('');
    setUploadStatus({});
    setTimeout(() => {
      document.getElementById('results-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 200);
  };

  // Clear all recent jobs
  const clearRecentJobs = () => {
    if (confirm('Clear your recent translations history? Past work won\'t be removed from YouTube — just from this list.')) {
      setRecentJobs([]);
    }
  };


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
      } catch { alert('Invalid glossary JSON file'); }
    };
    reader.readAsText(f);
  };

  // ========= Stats helpers =========
  const resetStats = () => {
    if (confirm('Reset YOUR activity counters to zero?')) {
      const zero = { videosTranslated: 0, languagesGenerated: 0, segmentsTranslated: 0, youtubeDraftsPushed: 0, lastUsed: null, firstUsed: null };
      setStats(zero);
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

  // ========= Logout =========
  const handleLogout = () => {
    if (confirm('Switch user? Your progress will not be lost.')) {
      setUser(null);
      setActiveTab('translate');
      setFile(null); setSrtContent(''); setResults({}); setStage('idle'); setActiveStageIndex(-1);
    }
  };

  // ========= Admin: aggregate stats =========
  const aggregateStats = () => {
    const agg = { videosTranslated: 0, languagesGenerated: 0, segmentsTranslated: 0, youtubeDraftsPushed: 0 };
    Object.values(allUserStats).forEach(s => {
      agg.videosTranslated += s.videosTranslated || 0;
      agg.languagesGenerated += s.languagesGenerated || 0;
      agg.segmentsTranslated += s.segmentsTranslated || 0;
      agg.youtubeDraftsPushed += s.youtubeDraftsPushed || 0;
    });
    return agg;
  };

  if (!sessionLoaded) return null;
  if (!user) return (
    <>
      <Head><title>BilAraby Translate</title></Head>
      <LoginScreen onLogin={setUser} />
    </>
  );

  return (
    <>
      <Head>
        <title>BilAraby Translate</title>
        <meta name="description" content="AI-powered Arabic subtitle translation for BilAraby" />
        <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='18' fill='%23080B0A'/%3E%3Crect x='22' y='38' width='24' height='24' fill='%230F7A4D' transform='rotate(45 34 50)'/%3E%3Crect x='54' y='38' width='24' height='24' fill='%230F7A4D' transform='rotate(45 66 50)'/%3E%3C/svg%3E" />
      </Head>

      <div style={s.root}>
        <header style={s.header}>
          <div style={s.headerInner} className="header-inner">
            <div style={s.logo} className="header-logo">
              <span style={s.logoAr} className="arabic">بالعربي</span>
              <span style={s.logoSep}>·</span>
              <span style={s.logoEn}>Translate</span>
            </div>
            <div style={s.headerRight} className="header-right">
              <div style={s.tabNav}>
                <button onClick={() => setActiveTab('translate')} className="tab-btn-text" style={{ ...s.tabBtn, ...(activeTab === 'translate' ? s.tabBtnActive : {}) }}>Translate</button>
                {user.isAdmin && (
                  <button onClick={() => setActiveTab('admin')} className="tab-btn-text" style={{ ...s.tabBtn, ...(activeTab === 'admin' ? s.tabBtnActive : {}) }}>Admin</button>
                )}
                <button onClick={() => setActiveTab('guide')} className="tab-btn-text" style={{ ...s.tabBtn, ...(activeTab === 'guide' ? s.tabBtnActive : {}) }}>Guide</button>
              </div>
              <div style={s.iconToggleGroup}>
                <button onClick={() => setSoundEnabled(s => !s)} style={s.iconToggle} title={soundEnabled ? 'Sound on — click to mute' : 'Sound muted — click to enable'}>
                  {soundEnabled ? '🔔' : '🔕'}
                </button>
                <button onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} style={s.iconToggle} title={theme === 'dark' ? 'Light mode' : 'Dark mode'}>
                  {theme === 'dark' ? '☀' : '☾'}
                </button>
              </div>
              <div style={s.userChip}>
                <span style={s.userChipName}>{user.name}</span>
                {user.isAdmin && <span style={s.userChipAdmin}>ADMIN</span>}
                <button onClick={handleLogout} style={s.userChipLogout} title="Switch user">↗</button>
              </div>
            </div>
          </div>
        </header>

        {activeTab === 'guide' && <GuideTab />}
        {activeTab === 'admin' && user.isAdmin && (
          <AdminTab allUserStats={allUserStats} aggregate={aggregateStats()} formatNum={formatNum} formatRelativeTime={formatRelativeTime} />
        )}
        {activeTab === 'translate' && (
          <main style={s.main} className="main-pad">
            {/* Hero */}
            <section style={s.hero} className="hero-pad">
              <div style={s.heroDiamond} className="hero-diamond-pos"><span className="brand-diamond-xl" /></div>
              <div style={s.heroLabel}>An Initiative of Qatar Foundation  ·  Powered by Claude</div>
              <h1 style={s.heroTitle} className="hero-title-text">
                <span className="arabic" style={s.heroArabic}>بالعربي</span>
                <span style={s.heroDivider}>·</span>
                <span>Translate</span>
              </h1>
              <p style={s.heroSub}>One Arabic subtitle in. Twelve languages out. Your brand glossary enforced. Drafts pushed straight to YouTube.</p>
              <div style={s.heroTagline}>
                <span className="arabic" style={s.heroTaglineAr}>للأفكار صوت وصدى</span>
                <span style={s.heroTaglineDivider}>·</span>
                <span style={s.heroTaglineEn}>A voice and an echo for ideas</span>
              </div>
            </section>

            {/* Pipeline */}
            <div style={s.pipelineWrap} className="pipeline-wrap">
              {PIPELINE_STAGES.map((stg, i) => {
                const isActive = activeStageIndex === i;
                const isDone = activeStageIndex > i;
                const isReady = i === PIPELINE_STAGES.length - 1 && stage === 'done';
                const handleClick = isReady ? () => {
                  document.getElementById('results-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                } : undefined;
                return (
                  <div key={stg.id} style={s.pipelineItem} className="pipeline-item">
                    <div
                      onClick={handleClick}
                      className={isActive ? 'pipeline-node-active' : isDone ? 'pipeline-node-done' : ''}
                      style={{
                        ...s.pipelineNode,
                        ...(isActive ? s.pipelineNodeActive : {}),
                        ...(isDone ? s.pipelineNodeDone : {}),
                        ...(isReady ? s.pipelineNodeReady : {}),
                      }}>
                      <span>{stg.icon}</span>
                    </div>
                    <span
                      onClick={handleClick}
                      style={{
                        ...s.pipelineLabel,
                        ...(activeStageIndex >= i ? s.pipelineLabelActive : {}),
                        ...(isReady ? s.pipelineLabelReady : {}),
                      }}>
                      {isReady ? `${stg.label} ↓` : stg.label}
                    </span>
                    {i < PIPELINE_STAGES.length - 1 && <div style={{ ...s.pipelineConnector, ...(activeStageIndex > i ? s.pipelineConnectorActive : {}) }} />}
                  </div>
                );
              })}
              <div style={s.pipelineItemYT}>
                <div className={stage === 'done' && videoId && ytConfigured ? 'pipeline-node-active' : ''}
                  style={{ ...s.pipelineNode, ...(stage === 'done' && videoId && ytConfigured ? s.pipelineNodeActive : {}) }}>
                  <span>▶</span>
                </div>
                <span style={{ ...s.pipelineLabel, ...(stage === 'done' && videoId && ytConfigured ? s.pipelineLabelActive : {}) }}>YouTube</span>
              </div>
            </div>

            <div style={s.grid} className="two-col-grid">
              {/* Source */}
              <div style={s.card}>
                <div style={s.cardLabelRow}>
                  <div style={s.cardLabel}>01 — Source</div>
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
                        <div style={s.fileIcon}><span className="brand-diamond" /></div>
                        <div style={s.fileName}>{file.name}</div>
                        <div style={s.fileSize}>{(file.size / 1024).toFixed(1)} KB · {parseSRT(srtContent).length} segments</div>
                        <div style={s.fileChange}>Click to change</div>
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
                    <button onClick={fetchFromYouTube} disabled={ytFetching || !ytFetchUrl.trim() || !ytConfigured}
                      style={{ ...s.ytFetchBtn, ...(ytFetching || !ytFetchUrl.trim() || !ytConfigured ? s.btnDisabled : {}) }}
                      className="translate-btn">
                      {ytFetching ? <><span className="spinner">◈</span>&nbsp; Fetching...</> : 'Fetch Captions from YouTube'}
                    </button>
                    {file && srtContent && inputMode === 'youtube' && (
                      <div style={s.ytFetchSuccess}>
                        ✓ Loaded {parseSRT(srtContent).length} caption segments from {file.name}
                      </div>
                    )}
                    {ytConfigured === false && (
                      <div style={s.ytFetchNote}>⚠ YouTube fetch not configured. Switch to SRT File mode and ask admin to set up YouTube credentials.</div>
                    )}
                    {ytConfigured && (
                      <div style={s.ytFetchNote}>Fetches the Arabic caption track from any video on the BilAraby channel.</div>
                    )}
                  </div>
                )}
                {error && <div style={s.error}>{error}</div>}
              </div>

              {/* Languages */}
              <div style={s.card}>
                <div style={s.cardLabelRow}>
                  <div style={s.cardLabel}>02 — Target Languages</div>
                  <button onClick={toggleAllLangs} style={s.bulkSelectBtn}>
                    {selectedLangs.length === LANGUAGES.length ? '✕ Clear All' : '✓ Select All'}
                  </button>
                </div>
                <div style={s.langGrid} className="lang-grid-mobile">
                  {langOrder.map(code => {
                    const lang = LANGUAGES.find(l => l.code === code);
                    if (!lang) return null;
                    const isSelected = selectedLangs.includes(code);
                    const isDragging = draggedLang === code;
                    return (
                      <button key={code} onClick={() => toggleLang(code)}
                        draggable
                        onDragStart={(e) => handleLangDragStart(e, code)}
                        onDragOver={(e) => handleLangDragOver(e, code)}
                        onDragEnd={handleLangDragEnd}
                        style={{
                          ...s.langBtn,
                          ...(isSelected ? s.langBtnActive : {}),
                          ...(isDragging ? s.langBtnDragging : {}),
                        }}
                        className="lang-btn"
                        title="Drag to reorder">
                        <span style={s.langDragHandle}>⋮⋮</span>
                        <span style={s.langFlag}>{lang.flag}</span>
                        <span style={s.langName}>{lang.label}</span>
                        {isSelected && <span style={s.langCheck}>✓</span>}
                      </button>
                    );
                  })}
                </div>
                <div style={s.langCountRow}>
                  <span style={s.langHint}>Drag to reorder • Click to toggle</span>
                  <span style={s.langCount}>{selectedLangs.length} of {LANGUAGES.length} selected</span>
                </div>
              </div>
            </div>

            {/* Glossary */}
            <div style={s.glossaryCard}>
              <div style={s.glossaryHeader} onClick={() => setGlossaryExpanded(!glossaryExpanded)}>
                <div style={s.glossaryTitle}>
                  <span style={s.cardLabel}>03 — Brand Glossary</span>
                  <span style={s.glossaryCount}>{activeGlossaryCount} terms enforced</span>
                </div>
                <span style={s.chevron}>{glossaryExpanded ? '▲' : '▼'}</span>
              </div>
              {glossaryExpanded && (
                <div style={s.glossaryBody}>
                  <div style={s.glossaryNote}>
                    These terms are enforced across every translation. Terms marked <strong>Keep As-Is</strong> stay unchanged in all languages — so <em>Allah</em> never becomes <em>God</em>.
                  </div>
                  <div style={s.glossaryActions}>
                    <button onClick={addGlossaryTerm} style={s.glossaryActionBtn}>+ Add Term</button>
                    <button onClick={resetGlossary} style={s.glossaryActionBtn}>↺ Reset Defaults</button>
                    <button onClick={exportGlossary} style={s.glossaryActionBtn}>↓ Export</button>
                    <label style={{ ...s.glossaryActionBtn, cursor: 'pointer' }}>
                      ↑ Import
                      <input type="file" accept=".json" onChange={importGlossary} style={{ display: 'none' }} />
                    </label>
                  </div>
                  <div style={s.glossaryTable} className="glossary-table-wrap">
                    <div style={{ ...s.glossaryRowHeader, ...(user.isAdmin ? s.glossaryRowAdmin : {}) }}>
                      <div>Term</div>
                      <div>Translation</div>
                      <div>Keep As-Is</div>
                      <div>Notes</div>
                      {user.isAdmin && <div style={s.glossaryAdminCol}>🔒 Admin Note</div>}
                      <div></div>
                    </div>
                    {glossary.map((g, i) => (
                      <div key={i} style={{ ...s.glossaryRow, ...(user.isAdmin ? s.glossaryRowAdmin : {}) }}>
                        <input style={s.glossaryInput} value={g.term} placeholder="Allah" onChange={e => updateGlossaryTerm(i, 'term', e.target.value)} />
                        <input style={s.glossaryInput} value={g.translation} placeholder="Allah" onChange={e => updateGlossaryTerm(i, 'translation', e.target.value)} />
                        <label style={s.glossaryCheckLabel}>
                          <input type="checkbox" checked={g.keepAsIs} onChange={e => updateGlossaryTerm(i, 'keepAsIs', e.target.checked)} style={s.glossaryCheck} />
                          {g.keepAsIs ? 'Yes' : 'No'}
                        </label>
                        <input style={s.glossaryInput} value={g.notes || ''} placeholder="optional" onChange={e => updateGlossaryTerm(i, 'notes', e.target.value)} />
                        {user.isAdmin && (
                          <input style={{ ...s.glossaryInput, ...s.glossaryAdminInput }} value={g.adminNote || ''} placeholder="admin only" onChange={e => updateGlossaryTerm(i, 'adminNote', e.target.value)} />
                        )}
                        <button onClick={() => removeGlossaryTerm(i)} style={s.glossaryDelBtn}>×</button>
                      </div>
                    ))}
                  </div>
                  <div style={s.glossarySaved}>✓ Auto-saved to your browser</div>
                </div>
              )}
            </div>

            {/* YouTube Upload */}
            <div style={s.ytConfigCard}>
              <div style={s.ytConfigHeader} onClick={() => setYtExpanded(!ytExpanded)}>
                <div style={s.glossaryTitle}>
                  <span style={s.cardLabel}>04 — YouTube Direct Upload</span>
                  <span style={s.glossaryCount}>
                    {ytConfigured === null ? 'checking...' : ytConfigured ? '✓ ready · uploads as drafts' : '⚠ admin setup required'}
                  </span>
                </div>
                <span style={s.chevron}>{ytExpanded ? '▲' : '▼'}</span>
              </div>
              {ytExpanded && (
                <div style={s.ytConfigBody}>
                  {ytConfigured ? (
                    <>
                      <div style={s.ytInfoBox}>
                        <div style={s.ytInfoTitle}>Ready to push captions</div>
                        <div style={s.ytStepText}>
                          YouTube authentication is handled by the BilAraby admin server. You only need the Video ID — captions will upload as drafts that the team reviews and publishes in YouTube Studio.
                        </div>
                      </div>
                      <div style={s.ytFields}>
                        <div style={s.ytField}>
                          <label style={s.ytLabel}>YouTube Video ID</label>
                          <input style={s.ytInput} placeholder="e.g. dQw4w9WgXcQ — the part after ?v=" value={videoId} onChange={e => setVideoId(e.target.value)} />
                        </div>
                      </div>
                      {videoId && <div style={s.ytReady}>✓ Ready to upload after translation</div>}
                    </>
                  ) : (
                    <div style={s.ytInfoBox}>
                      <div style={s.ytInfoTitle}>Admin setup required</div>
                      <div style={s.ytStepText}>
                        The admin needs to configure YouTube credentials in Vercel. Required environment variables: <code style={s.code}>YOUTUBE_CLIENT_ID</code>, <code style={s.code}>YOUTUBE_CLIENT_SECRET</code>, <code style={s.code}>YOUTUBE_REFRESH_TOKEN</code>. See the Guide tab for one-time setup instructions.
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Re-upload edited translation */}
            <div style={s.ytConfigCard}>
              <div style={s.ytConfigHeader} onClick={() => setReuploadExpanded(!reuploadExpanded)}>
                <div style={s.glossaryTitle}>
                  <span style={s.cardLabel}>05 — Re-Upload Edited Translation</span>
                  <span style={s.glossaryCount}>
                    {reuploadStatus === 'ready' ? `✓ ${reuploadResult?.segmentCount || 0} segments parsed` :
                     reuploadStatus === 'uploaded' ? '✓ uploaded to YouTube' :
                     'apply translator corrections'}
                  </span>
                </div>
                <span style={s.chevron}>{reuploadExpanded ? '▲' : '▼'}</span>
              </div>
              {reuploadExpanded && (
                <div style={s.ytConfigBody}>
                  <div style={s.ytInfoBox}>
                    <div style={s.ytInfoTitle}>The Review Loop</div>
                    <div style={s.ytStepText}>
                      Translators review the AI translation in the Word document, edit any segments that need correction, save the file, and upload it here. The tool will rebuild the SRT with all corrections applied — ready to download or push to YouTube.
                    </div>
                  </div>

                  {!reuploadFile && (
                    <div style={{ ...s.dropzone, marginTop: 16 }}
                      onClick={() => reuploadInputRef.current.click()}>
                      <input ref={reuploadInputRef} type="file" accept=".docx" style={{ display: 'none' }}
                        onChange={e => handleReuploadFile(e.target.files[0])} />
                      <div style={s.dropContent}>
                        <div style={s.dropIconLg}>📄</div>
                        <div style={s.dropText}>Drop your edited .DOCX review file</div>
                        <div style={s.dropSub}>or click to browse</div>
                      </div>
                    </div>
                  )}

                  {reuploadFile && (
                    <div style={{ marginTop: 16 }}>
                      <div style={s.reuploadFileBar}>
                        <div>
                          <div style={s.reuploadFileName}>{reuploadFile.name}</div>
                          {reuploadStatus === 'parsing' && <div style={s.reuploadStatus}><span className="spinner">◈</span> Parsing document...</div>}
                          {reuploadStatus === 'ready' && <div style={{ ...s.reuploadStatus, color: TEAL }}>✓ {reuploadResult.segmentCount} segments parsed and ready</div>}
                          {reuploadStatus === 'uploading' && <div style={s.reuploadStatus}><span className="spinner">◈</span> Uploading to YouTube...</div>}
                          {reuploadStatus === 'uploaded' && <div style={{ ...s.reuploadStatus, color: TEAL }}>✓ Successfully uploaded to YouTube as draft</div>}
                          {reuploadStatus === 'error' && <div style={{ ...s.reuploadStatus, color: RED }}>⚠ Failed to process</div>}
                        </div>
                        <button onClick={resetReupload} style={s.glossaryActionBtn}>Change file</button>
                      </div>

                      {reuploadStatus === 'ready' && (
                        <>
                          <div style={s.ytFields}>
                            <div style={s.ytField}>
                              <label style={s.ytLabel}>Language of this translation</label>
                              <select value={reuploadLang} onChange={e => setReuploadLang(e.target.value)} style={s.ytInput}>
                                {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.flag} {l.label}</option>)}
                              </select>
                            </div>
                          </div>

                          <div style={{ display: 'flex', gap: 12, marginTop: 18, flexWrap: 'wrap' }}>
                            <button onClick={downloadReuploadedSrt} style={{ ...s.translateBtn, padding: '13px 26px', fontSize: 12 }} className="translate-btn">
                              ↓ &nbsp;Download Corrected SRT
                            </button>
                            {videoId && ytConfigured && (
                              <button onClick={uploadReuploadedToYouTube} style={{ ...s.translateBtn, padding: '13px 26px', fontSize: 12, background: BLUE, borderColor: BLUE, color: ON_DARK }} className="translate-btn">
                                ▶ &nbsp;Upload Corrected Version to YouTube
                              </button>
                            )}
                          </div>
                          {(!videoId || !ytConfigured) && (
                            <div style={{ marginTop: 12, fontSize: 12, color: TEXT_SOFT }}>
                              {!ytConfigured ? '⚠ YouTube not configured by admin' : '⚠ Enter a Video ID in Section 04 to enable YouTube upload'}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Run button */}
            <div style={s.actionRow}>
              <button onClick={runTranslation}
                disabled={!file || selectedLangs.length === 0 || stage === 'running'}
                style={{ ...s.translateBtn, ...(!file || selectedLangs.length === 0 ? s.translateBtnDisabled : {}), ...(stage === 'running' ? s.translateBtnRunning : {}) }}
                className="translate-btn">
                {stage === 'running'
                  ? <span style={s.btnInner}><span className="spinner">◈</span>&nbsp;&nbsp; Translating  ·  {formatElapsed(elapsed)} elapsed{estimatedTotal > 0 && elapsed < estimatedTotal ? `  ·  ~${formatElapsed(estimatedTotal - elapsed)} remaining` : ''}</span>
                  : <span style={s.btnInner}><span className="brand-diamond" />&nbsp;&nbsp; Run AI Translation</span>}
              </button>
            </div>

            {/* Progress */}
            {stage === 'running' && Object.keys(progress).length > 0 && (
              <div style={s.progressCard}>
                <div style={s.progressCardHeader}>
                  <div style={s.cardLabel}>Translation in Progress</div>
                  <div style={s.progressTimerGroup}>
                    <div style={s.progressTimer}>
                      <span style={s.progressTimerLabel}>Elapsed</span>
                      <span style={s.progressTimerValue}>{formatElapsed(elapsed)}</span>
                    </div>
                    {estimatedTotal > 0 && (
                      <div style={{ ...s.progressTimer, ...s.progressEta }}>
                        <span style={s.progressTimerLabel}>{elapsed < estimatedTotal ? 'Remaining' : 'Wrapping up'}</span>
                        <span style={s.progressTimerValue}>{elapsed < estimatedTotal ? `~${formatElapsed(estimatedTotal - elapsed)}` : '...'}</span>
                      </div>
                    )}
                  </div>
                </div>
                {estimatedTotal > 0 && (
                  <div style={s.progressBarTrack}>
                    <div style={{ ...s.progressBarFill, width: `${Math.min(100, (elapsed / estimatedTotal) * 100)}%` }} />
                  </div>
                )}
                <div style={s.progressGrid}>
                  {selectedLangs.map(code => {
                    const lang = LANGUAGES.find(l => l.code === code);
                    const status = progress[code];
                    return (
                      <div key={code} style={{ ...s.progressItem, ...(status === 'done' ? s.progressItemDone : status === 'translating' ? s.progressItemActive : {}) }}>
                        <span style={{ fontSize: 18 }}>{lang.flag}</span>
                        <span style={s.progressLang}>{lang.label}</span>
                        <span style={s.progressStatus}>{status === 'done' ? '✓' : status === 'translating' ? <span className="pulse">●</span> : '·'}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Results */}
            {stage === 'done' && Object.keys(results).length > 0 && (
              <div id="results-section" style={s.resultsSection}>
                <div style={s.resultsHeader}>
                  <div style={s.resultsTitle}><span className="brand-diamond" />&nbsp;&nbsp;Translation Complete</div>
                  <div style={s.resultsActions} className="results-actions">
                    {videoId && ytConfigured && (
                      <button onClick={handleUploadAll} style={{ ...s.translateBtn, ...s.uploadAllBtn }} className="translate-btn">▶ &nbsp;Upload All to YouTube</button>
                    )}
                    <button onClick={downloadAllDocx} style={{ ...s.translateBtn, ...s.downloadAllBtn, background: PURPLE, borderColor: PURPLE, color: ON_DARK }} className="translate-btn">📄 &nbsp;Download All as Word</button>
                    <button onClick={downloadAll} style={{ ...s.translateBtn, ...s.downloadAllBtn }} className="translate-btn">↓ &nbsp;Download All as SRT</button>
                  </div>
                </div>
                <div style={s.resultsGrid} className="results-grid">
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
                            <div style={s.resultMeta}>{isDone ? <span style={s.uploadedBadge}>✓ Uploaded</span> : 'Ready for review'}</div>
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
                          {videoId && ytConfigured && !isDone && (
                            <button onClick={() => handleUpload(code)} disabled={isUploading}
                              style={{ ...s.resultActionBtn, ...s.ytUploadBtn, ...(isUploading ? s.btnDisabled : {}) }} className="lang-btn">
                              {isUploading ? <span className="spinner">◈</span> : '▶'} &nbsp;{isUploading ? 'Uploading' : 'Upload'}
                            </button>
                          )}
                          <button onClick={() => downloadDocx(code)} style={{ ...s.resultActionBtn, ...s.docxBtn }} className="lang-btn" title="Download as Word for review">📄 &nbsp;Word</button>
                          <button onClick={() => download(code)} style={s.resultActionBtn} className="lang-btn">↓ &nbsp;SRT</button>
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

            {/* Recently Translated */}
            {recentJobs.length > 0 && (
              <div style={s.recentSection}>
                <div style={s.recentHeader}>
                  <div style={s.recentTitle}>
                    <span style={s.cardLabel}>Recently Translated</span>
                    <span style={s.recentSubtitle}>Your last {recentJobs.length} job{recentJobs.length !== 1 ? 's' : ''} · click to reopen</span>
                  </div>
                  <button onClick={clearRecentJobs} style={s.dashReset}>Clear</button>
                </div>
                <div style={s.recentList}>
                  {recentJobs.map((job) => (
                    <button key={job.id} onClick={() => reopenRecentJob(job)} style={s.recentCard} className="recent-card">
                      <div style={s.recentCardTop}>
                        <span style={s.recentCardIcon}><span className="brand-diamond" /></span>
                        <div style={s.recentCardName} title={job.filename}>{job.filename}</div>
                      </div>
                      <div style={s.recentCardLangs}>
                        {job.languages.slice(0, 6).map(code => {
                          const l = LANGUAGES.find(x => x.code === code);
                          return l ? <span key={code} title={l.label}>{l.flag}</span> : null;
                        })}
                        {job.languages.length > 6 && <span style={s.recentCardMore}>+{job.languages.length - 6}</span>}
                      </div>
                      <div style={s.recentCardMeta}>
                        <span>{job.segmentCount} seg · {job.languages.length} lang</span>
                        <span style={s.recentCardTime}>{formatRelativeTime(job.completedAt)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Personal Activity */}
            <div style={s.dashSection}>
              <div style={s.dashHeader}>
                <div style={s.dashTitle}>
                  <span style={s.dashLive}><span className="pulse-dot" />LIVE</span>
                  <span style={s.dashTitleText}>Your Activity</span>
                </div>
                <div style={s.dashSubtitle}>
                  <span>Last activity: <span style={s.dashSubAccent}>{formatRelativeTime(stats.lastUsed)}</span></span>
                  <button onClick={resetStats} style={s.dashReset}>Reset</button>
                </div>
              </div>
              <div style={s.dashGrid} className="dash-grid">
                <div style={s.dashCard}>
                  <div style={s.cardLabel}>Videos Translated</div>
                  <div style={s.dashCardNum} className="dash-card-num">{formatNum(animatedStats.videosTranslated)}</div>
                  <div style={s.dashCardSub}>by {user.name}</div>
                </div>
                <div style={s.dashCard}>
                  <div style={s.cardLabel}>Caption Tracks</div>
                  <div style={s.dashCardNum} className="dash-card-num">{formatNum(animatedStats.languagesGenerated)}</div>
                  <div style={s.dashCardSub}>across all videos</div>
                </div>
                <div style={s.dashCard}>
                  <div style={s.cardLabel}>Segments Translated</div>
                  <div style={s.dashCardNum} className="dash-card-num">{formatNum(animatedStats.segmentsTranslated)}</div>
                  <div style={s.dashCardSub}>subtitle lines</div>
                </div>
                <div style={s.dashCard}>
                  <div style={s.cardLabel}>YouTube Drafts</div>
                  <div style={s.dashCardNum} className="dash-card-num">{formatNum(animatedStats.youtubeDraftsPushed)}</div>
                  <div style={s.dashCardSub}>uploaded as drafts</div>
                </div>
                <div style={s.dashCard}>
                  <div style={s.cardLabel}>Glossary Terms</div>
                  <div style={s.dashCardNum} className="dash-card-num">{formatNum(activeGlossaryCount)}</div>
                  <div style={s.dashCardSub}>brand-enforced</div>
                </div>
                <div style={s.dashCard}>
                  <div style={s.cardLabel}>Languages</div>
                  <div style={s.dashCardNum} className="dash-card-num">12</div>
                  <div style={s.dashCardSub}>across 6 continents</div>
                </div>
              </div>
              {stats.firstUsed && (
                <div style={s.dashFooter}>
                  Tracking your activity since {new Date(stats.firstUsed).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                </div>
              )}
            </div>
          </main>
        )}
      </div>
    </>
  );
}

// ============================================================================
// ADMIN TAB
// ============================================================================
function AdminTab({ allUserStats, aggregate, formatNum, formatRelativeTime }) {
  const sortedUsers = [...VOLUNTEERS].map(v => ({
    ...v,
    ...((allUserStats[v.code]) || { videosTranslated: 0, languagesGenerated: 0, segmentsTranslated: 0, youtubeDraftsPushed: 0, lastUsed: null })
  })).sort((a, b) => (b.videosTranslated || 0) - (a.videosTranslated || 0));

  const totalActive = Object.keys(allUserStats).filter(k => k !== 'ADMIN' && allUserStats[k].videosTranslated > 0).length;

  const exportCSV = () => {
    const headers = ['Code', 'Name', 'Videos Translated', 'Caption Tracks', 'Segments', 'YouTube Drafts', 'Last Activity'];
    const rows = sortedUsers.map(u => [
      u.code,
      `"${u.name}"`,
      u.videosTranslated || 0,
      u.languagesGenerated || 0,
      u.segmentsTranslated || 0,
      u.youtubeDraftsPushed || 0,
      u.lastUsed ? new Date(u.lastUsed).toISOString() : 'Never'
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bilaraby-translate-activity-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const printDashboard = () => window.print();

  return (
    <main style={a.main}>
      <section style={a.hero}>
        <div style={a.heroDiamond}><span className="brand-diamond-xl" /></div>
        <div style={a.heroLabel}>Admin Dashboard</div>
        <h1 style={a.heroTitle}>Team Activity</h1>
        <p style={a.heroSub}>Aggregate translation activity across all volunteers. Numbers update live as the team uses the tool.</p>
      </section>

      <div style={a.aggregateGrid} className="agg-grid">
        <div style={a.aggCard}>
          <div style={s.cardLabel}>Total Videos</div>
          <div style={a.aggNum} className="agg-num">{formatNum(aggregate.videosTranslated)}</div>
          <div style={a.aggSub}>across the whole team</div>
        </div>
        <div style={a.aggCard}>
          <div style={s.cardLabel}>Caption Tracks</div>
          <div style={a.aggNum} className="agg-num">{formatNum(aggregate.languagesGenerated)}</div>
          <div style={a.aggSub}>generated to date</div>
        </div>
        <div style={a.aggCard}>
          <div style={s.cardLabel}>Segments</div>
          <div style={a.aggNum} className="agg-num">{formatNum(aggregate.segmentsTranslated)}</div>
          <div style={a.aggSub}>subtitle lines</div>
        </div>
        <div style={a.aggCard}>
          <div style={s.cardLabel}>YouTube Drafts</div>
          <div style={a.aggNum} className="agg-num">{formatNum(aggregate.youtubeDraftsPushed)}</div>
          <div style={a.aggSub}>pushed by team</div>
        </div>
        <div style={a.aggCard}>
          <div style={s.cardLabel}>Active Volunteers</div>
          <div style={a.aggNum} className="agg-num">{formatNum(totalActive)} <span style={a.aggOf}>/ {VOLUNTEERS.length}</span></div>
          <div style={a.aggSub}>have used the tool</div>
        </div>
        <div style={a.aggCard}>
          <div style={s.cardLabel}>Tool Health</div>
          <div style={{ ...a.aggNum, color: '#0F7A4D', fontSize: 28, lineHeight: 1.2 }} className="agg-num">● Operational</div>
          <div style={a.aggSub}>all systems active</div>
        </div>
      </div>

      <div style={a.tableTitleRow}>
        <div style={a.tableTitle}>Per-Volunteer Breakdown</div>
        <div style={a.tableActions} className="no-print">
          <button onClick={exportCSV} style={a.adminActionBtn}>↓ Export CSV</button>
          <button onClick={printDashboard} style={a.adminActionBtn}>🖨 Print Report</button>
        </div>
      </div>

      <div style={a.tableWrap} className="admin-table-wrap">
        <div style={a.tableHeader}>
          <div style={{ flex: 2 }}>Volunteer</div>
          <div style={{ flex: 1, textAlign: 'right' }}>Videos</div>
          <div style={{ flex: 1, textAlign: 'right' }}>Tracks</div>
          <div style={{ flex: 1, textAlign: 'right' }}>Segments</div>
          <div style={{ flex: 1, textAlign: 'right' }}>YT Drafts</div>
          <div style={{ flex: 2, textAlign: 'right' }}>Last Activity</div>
        </div>
        {sortedUsers.map((u, i) => (
          <div key={u.code} style={{ ...a.tableRow, ...(i === 0 && u.videosTranslated > 0 ? a.tableRowTop : {}) }}>
            <div style={{ flex: 2, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={a.userBadge}>{u.code}</div>
              <div>
                <div style={a.userName}>{u.name}</div>
                {i === 0 && u.videosTranslated > 0 && <div style={a.topBadge}>★ Most Active</div>}
              </div>
            </div>
            <div style={{ ...a.cellNum, flex: 1 }}>{formatNum(u.videosTranslated || 0)}</div>
            <div style={{ ...a.cellNum, flex: 1 }}>{formatNum(u.languagesGenerated || 0)}</div>
            <div style={{ ...a.cellNum, flex: 1 }}>{formatNum(u.segmentsTranslated || 0)}</div>
            <div style={{ ...a.cellNum, flex: 1 }}>{formatNum(u.youtubeDraftsPushed || 0)}</div>
            <div style={{ flex: 2, textAlign: 'right', fontSize: 12, color: 'rgba(27,24,15,0.55)' }}>{formatRelativeTime(u.lastUsed)}</div>
          </div>
        ))}
      </div>

      <div style={a.adminNote}>
        <div style={a.adminNoteTitle}>Note on data scope</div>
        <div style={a.adminNoteText}>
          Activity stats are tracked per browser. Each volunteer's data lives in their own device's local storage. To get a complete picture across all devices, ask volunteers to share their dashboard screenshots periodically — or upgrade to a database backend (one-time setup) for true cross-device tracking.
        </div>
      </div>
    </main>
  );
}

// ============================================================================
// GUIDE TAB
// ============================================================================
function GuideTab() {
  const phases = [
    { phase: 'Phase 1', color: '#1B180F', title: 'Get the Arabic SRT', steps: ['Use YouTube Link mode and paste any BilAraby video URL', 'Or, manually download from YouTube Studio → Subtitles → ⋮ → .srt'] },
    { phase: 'Phase 2', color: '#0F7A4D', title: 'Customise the Brand Glossary', steps: ['Open the Brand Glossary section', 'Add brand and Islamic terms — set Keep As-Is', 'Export the glossary JSON to share with the team', 'Glossary auto-saves to your browser'] },
    { phase: 'Phase 3', color: '#CD891C', title: 'Translate', steps: ['Select your target languages', 'Click Run AI Translation — Claude uses your glossary', 'Wait 30–90 seconds for all languages to complete'] },
    { phase: 'Phase 4', color: '#104F84', title: 'Upload', steps: ['Paste the YouTube Video ID', 'Click Upload All to YouTube', 'All tracks upload as Drafts — invisible to viewers'] },
    { phase: 'Phase 5', color: '#734663', title: 'Review & Publish', steps: ['Go to YouTube Studio → Subtitles', 'Review each language track', 'Make corrections in the YouTube editor', 'Click Publish to go live'] },
  ];
  const tips = [
    ['◆', 'Glossary is critical', 'Add every recurring term — show names, Islamic vocabulary, brand mentions. This separates BilAraby from generic translation.'],
    ['◆', 'Edit before publish', 'Always review drafts. Claude is highly accurate but cultural nuance benefits from a human touch.'],
    ['◆', 'Cost is minimal', 'Roughly $0.10–0.20 per video via the Claude API. Replaces CaptionHub entirely.'],
  ];
  return (
    <main style={a.main}>
      <section style={a.hero}>
        <div style={a.heroDiamond}><span className="brand-diamond-xl" /></div>
        <div style={a.heroLabel}>Team Operations Guide</div>
        <h1 style={a.heroTitle}>How to Use the Tool</h1>
        <p style={a.heroSub}>Five phases to translate and publish Arabic subtitles across 12 languages with brand-consistent terminology.</p>
      </section>
      <div style={a.phases} className="phases-grid">
        {phases.map((ph, pi) => (
          <div key={pi} style={a.phaseCard}>
            <div style={{ ...a.phaseStripe, background: ph.color }} />
            <div style={a.phaseContent}>
              <div style={{ ...a.phaseTag, color: ph.color }}>{ph.phase}</div>
              <div style={a.phaseTitle}>{ph.title}</div>
              {ph.steps.map((step, si) => (
                <div key={si} style={a.step}>
                  <div style={{ ...a.stepNum, borderColor: ph.color, color: ph.color }}>{si + 1}</div>
                  <div style={a.stepText}>{step}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div style={a.tipsTitle}>Key Principles</div>
      <div style={a.tipsGrid} className="tips-grid">
        {tips.map(([icon, title, text], i) => (
          <div key={i} style={a.tipCard}>
            <div style={a.tipIcon}>{icon}</div>
            <div style={a.tipTitle}>{title}</div>
            <div style={a.tipText}>{text}</div>
          </div>
        ))}
      </div>
    </main>
  );
}

// ============================================================================
// STYLES
// ============================================================================
// BilAraby primary accent — forest green (not turquoise), matches website feel
const GOLD = '#0F7A4D';      // PRIMARY (was #0B6A62 toolkit teal — shifted greener, less cyan)
const TEAL = '#0F7A4D';      // SUCCESS — same green
const PURPLE = '#734663';    // SECONDARY accent (Word doc downloads)
const BLUE = '#104F84';      // YouTube actions
const RED = '#D64E3E';       // YouTube fetch + errors + live indicator
const BORDER_GOLD = 'rgba(15, 122, 77, 0.4)';

// Surfaces use CSS variables — switch automatically with dark/light theme
const DARK = 'var(--bg-header)';
const DARK_HERO = 'var(--bg-hero)';
const CREAM = 'var(--bg-page)';
const CREAM_2 = 'var(--bg-soft)';
const TEXT = 'var(--text-primary)';
const TEXT_MUTED = 'var(--text-muted)';
const TEXT_SOFT = 'var(--text-soft)';
const BORDER = 'var(--border-subtle)';
const BORDER_STRONG = 'var(--border-strong)';
const ON_DARK = 'var(--text-on-dark)';
const ON_DARK_MUTED = 'var(--text-on-dark-muted)';
const CARD_BG = 'var(--bg-card)';

// Login screen
const l = {
  root: { minHeight: '100vh', background: DARK, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 },
  panel: { textAlign: 'center', maxWidth: 460, width: '100%', position: 'relative', padding: 56 },
  brandMark: { marginBottom: 24, display: 'flex', justifyContent: 'center' },
  label: { fontSize: 13, letterSpacing: 5, fontWeight: 600, color: GOLD, textTransform: 'uppercase', marginBottom: 14 },
  title: { fontSize: 64, fontWeight: 800, color: ON_DARK, letterSpacing: -2, lineHeight: 1, margin: 0 },
  divider: { width: 60, height: 2, background: GOLD, margin: '32px auto' },
  sub: { fontSize: 15, color: 'rgba(249, 247, 234, 0.65)', marginBottom: 36, lineHeight: 1.6 },
  form: { display: 'flex', flexDirection: 'column', gap: 16 },
  input: { background: 'rgba(249, 247, 234, 0.05)', border: `1.5px solid rgba(249, 247, 234, 0.2)`, borderRadius: 4, padding: '18px 20px', color: ON_DARK, fontSize: 18, fontFamily: 'inherit', textAlign: 'center', letterSpacing: 4, fontWeight: 700, textTransform: 'uppercase', transition: 'all 0.2s' },
  error: { fontSize: 13, color: RED, fontWeight: 500 },
  btn: { background: GOLD, color: DARK, border: 'none', borderRadius: 4, padding: '16px 24px', fontSize: 13, fontWeight: 800, letterSpacing: 3, cursor: 'pointer', textTransform: 'uppercase', transition: 'all 0.2s', fontFamily: 'inherit' },
  footer: { marginTop: 48, fontSize: 11, color: 'rgba(249, 247, 234, 0.4)', letterSpacing: 1.5, textTransform: 'uppercase' },
};

const s = {
  root: { minHeight: '100vh', background: CREAM, color: TEXT },

  // Header
  header: { background: DARK, padding: '0 40px', position: 'sticky', top: 0, zIndex: 100, borderBottom: `1px solid ${GOLD}` },
  headerInner: { maxWidth: 1280, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 80 },
  logo: { display: 'flex', alignItems: 'center', gap: 16 },
  logoAr: { fontSize: 34, fontWeight: 700, color: ON_DARK, lineHeight: 1, letterSpacing: -1 },
  logoSep: { color: GOLD, fontSize: 18 },
  logoEn: { fontSize: 14, fontWeight: 600, letterSpacing: 3.5, textTransform: 'uppercase', color: 'rgba(249, 247, 234, 0.75)' },
  headerRight: { display: 'flex', alignItems: 'center', gap: 24 },
  tabNav: { display: 'flex', gap: 2, background: 'rgba(249, 247, 234, 0.08)', borderRadius: 4, padding: 4 },
  tabBtn: { background: 'transparent', border: 'none', color: 'rgba(249, 247, 234, 0.55)', fontSize: 12, fontWeight: 700, letterSpacing: 1.5, padding: '9px 18px', borderRadius: 3, cursor: 'pointer', textTransform: 'uppercase', transition: 'all 0.2s', fontFamily: 'inherit' },
  tabBtnActive: { background: GOLD, color: DARK },
  userChip: { display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px 6px 16px', background: 'rgba(249, 247, 234, 0.06)', border: `1px solid rgba(249, 247, 234, 0.12)`, borderRadius: 4 },
  userChipName: { fontSize: 13, fontWeight: 600, color: ON_DARK, letterSpacing: 0.5 },
  userChipAdmin: { fontSize: 9, fontWeight: 800, letterSpacing: 1.5, color: GOLD, background: 'rgba(15, 122, 77, 0.15)', padding: '3px 7px', borderRadius: 2 },
  userChipLogout: { background: 'transparent', border: 'none', color: 'rgba(249, 247, 234, 0.55)', fontSize: 16, cursor: 'pointer', padding: '4px 8px', borderRadius: 3, fontFamily: 'inherit', transition: 'all 0.2s' },

  // Header icon toggles (sound, theme)
  iconToggleGroup: { display: 'flex', gap: 4, alignItems: 'center' },
  iconToggle: { background: 'rgba(249, 247, 234, 0.06)', border: `1px solid rgba(249, 247, 234, 0.12)`, color: 'rgba(249, 247, 234, 0.85)', fontSize: 16, cursor: 'pointer', padding: '7px 10px', borderRadius: 4, fontFamily: 'inherit', transition: 'all 0.2s', lineHeight: 1 },

  // Hero tagline
  heroTagline: { marginTop: 22, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', paddingTop: 22, borderTop: `1px solid rgba(249, 247, 234, 0.12)` },
  heroTaglineAr: { fontSize: 22, fontWeight: 600, color: GOLD, letterSpacing: 0 },
  heroTaglineDivider: { color: 'rgba(249, 247, 234, 0.3)', fontSize: 14 },
  heroTaglineEn: { fontSize: 13, letterSpacing: 2.5, color: 'rgba(249, 247, 234, 0.6)', textTransform: 'uppercase', fontWeight: 500, fontStyle: 'italic' },

  // Progress timer
  progressCardHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  progressTimer: { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: 'rgba(15, 122, 77, 0.1)', border: `1px solid ${BORDER_GOLD}`, borderRadius: 4 },
  progressTimerGroup: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  progressEta: { background: 'rgba(15, 122, 77, 0.04)', borderStyle: 'dashed' },
  progressBarTrack: { width: '100%', height: 4, background: 'rgba(15, 122, 77, 0.1)', borderRadius: 2, overflow: 'hidden', marginBottom: 16, marginTop: -4 },
  progressBarFill: { height: '100%', background: GOLD, borderRadius: 2, transition: 'width 1s linear', boxShadow: `0 0 8px ${GOLD}` },
  progressTimerLabel: { fontSize: 9, letterSpacing: 1.5, color: TEXT_MUTED, textTransform: 'uppercase', fontWeight: 700 },
  progressTimerValue: { fontSize: 13, fontWeight: 800, color: GOLD, fontVariantNumeric: 'tabular-nums', letterSpacing: 0.5 },

  // Glossary admin column
  glossaryAdminCol: { color: PURPLE },
  glossaryAdminInput: { borderColor: 'rgba(115, 70, 99, 0.3)', background: 'rgba(115, 70, 99, 0.04)' },
  glossaryRowAdmin: { gridTemplateColumns: '1.3fr 1.3fr 0.7fr 1.4fr 1.4fr 0.3fr' },

  main: { maxWidth: 1280, margin: '0 auto', padding: '0 40px 100px' },

  // Hero (large, futuristic)
  hero: { background: DARK_HERO, color: ON_DARK, margin: '0 -40px 64px', padding: '88px 80px 80px', position: 'relative', overflow: 'hidden' },
  heroDiamond: { position: 'absolute', top: 36, right: 80, opacity: 0.95 },
  heroLabel: { fontSize: 11, letterSpacing: 4, color: GOLD, marginBottom: 28, textTransform: 'uppercase', fontWeight: 600 },
  heroTitle: { fontSize: 'clamp(44px, 6vw, 80px)', fontWeight: 800, lineHeight: 0.95, margin: '0 0 32px', letterSpacing: -2.5, color: ON_DARK, display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap' },
  heroArabic: { fontSize: 'clamp(52px, 7vw, 92px)', fontWeight: 700, color: ON_DARK, lineHeight: 0.9 },
  heroDivider: { color: GOLD, fontWeight: 300, fontSize: '0.7em' },
  heroSub: { fontSize: 18, color: 'rgba(249, 247, 234, 0.7)', maxWidth: 700, lineHeight: 1.7, fontWeight: 400 },

  // Pipeline (larger nodes)
  pipelineWrap: { display: 'flex', alignItems: 'flex-start', justifyContent: 'center', marginBottom: 64, overflowX: 'auto', padding: '20px 0', gap: 4 },
  pipelineItem: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, position: 'relative', flex: '0 0 auto', minWidth: 110 },
  pipelineItemYT: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, flex: '0 0 auto', minWidth: 110, marginLeft: 28, paddingLeft: 28, borderLeft: `1px solid ${BORDER_GOLD}` },
  pipelineNode: { width: 56, height: 56, borderRadius: '50%', border: `1.5px solid ${BORDER_STRONG}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 19, color: TEXT_SOFT, transition: 'all 0.4s', background: CARD_BG, position: 'relative', zIndex: 1 },
  pipelineNodeActive: { border: `1.5px solid ${GOLD}`, color: DARK, background: GOLD, zIndex: 2 },
  pipelineNodeDone: { border: `1.5px solid ${GOLD}`, color: GOLD, background: CARD_BG },
  pipelineNodeReady: { cursor: 'pointer' },
  pipelineLabel: { fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', color: TEXT_SOFT, textAlign: 'center', lineHeight: 1.3, transition: 'color 0.4s', fontWeight: 700, whiteSpace: 'nowrap' },
  pipelineLabelActive: { color: DARK },
  pipelineLabelReady: { cursor: 'pointer', color: GOLD, textDecoration: 'underline', textDecorationColor: 'rgba(205,137,28,0.4)', textUnderlineOffset: 4 },
  pipelineConnector: { position: 'absolute', top: 28, left: '50%', width: '100%', height: 1.5, background: BORDER, transition: 'background 0.4s', zIndex: 0 },
  pipelineConnectorActive: { background: GOLD },

  // Cards (much larger)
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 },
  card: { background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 6, padding: 36, boxShadow: '0 1px 3px rgba(27, 24, 15, 0.04)' },
  cardLabelRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  cardLabel: { fontSize: 11, letterSpacing: 3, fontWeight: 800, color: GOLD, textTransform: 'uppercase' },
  modeToggle: { display: 'flex', gap: 2, background: CREAM_2, borderRadius: 4, padding: 3 },
  modeBtn: { background: 'transparent', border: 'none', color: TEXT_MUTED, fontSize: 11, fontWeight: 700, letterSpacing: 1, padding: '7px 13px', borderRadius: 3, cursor: 'pointer', textTransform: 'uppercase', transition: 'all 0.2s', fontFamily: 'inherit' },
  modeBtnActive: { background: DARK, color: ON_DARK },

  // Dropzone (taller)
  dropzone: { border: `1.5px dashed ${BORDER_STRONG}`, borderRadius: 4, padding: '52px 28px', textAlign: 'center', cursor: 'pointer', transition: 'all 0.3s', minHeight: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: CREAM_2 },
  dropzoneActive: { border: `1.5px dashed ${GOLD}`, background: 'rgba(15, 122, 77, 0.06)' },
  dropzoneFilled: { border: `1.5px solid ${GOLD}`, background: 'rgba(15, 122, 77, 0.04)' },
  dropContent: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 },
  dropIconLg: { fontSize: 36, color: TEXT_SOFT, fontWeight: 300 },
  dropText: { fontSize: 16, color: TEXT_MUTED, fontWeight: 500 },
  dropSub: { fontSize: 12, color: TEXT_SOFT, letterSpacing: 0.5 },
  fileInfo: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 },
  fileIcon: { fontSize: 26 },
  fileName: { fontSize: 15, fontWeight: 700, color: TEXT },
  fileSize: { fontSize: 12, color: TEXT_MUTED },
  fileChange: { fontSize: 11, color: GOLD, letterSpacing: 1, fontWeight: 600, textTransform: 'uppercase', marginTop: 4 },

  // YouTube fetch
  ytFetchBox: { display: 'flex', flexDirection: 'column', gap: 12, padding: '12px 0' },
  ytUrlInput: { background: CREAM_2, border: `1px solid ${BORDER}`, borderRadius: 4, padding: '15px 18px', color: TEXT, fontSize: 14, fontFamily: 'inherit', transition: 'all 0.2s' },
  ytFetchBtn: { background: RED, border: 'none', borderRadius: 4, padding: '14px 22px', fontSize: 12, fontWeight: 800, letterSpacing: 2, color: ON_DARK, cursor: 'pointer', textTransform: 'uppercase', transition: 'all 0.3s', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit' },
  ytFetchSuccess: { fontSize: 13, color: TEAL, padding: '10px 14px', background: 'rgba(15, 122, 77, 0.08)', borderRadius: 3, fontWeight: 500 },
  ytFetchNote: { fontSize: 12, color: TEXT_SOFT, lineHeight: 1.6 },
  error: { marginTop: 12, fontSize: 13, color: RED, textAlign: 'center', fontWeight: 500 },

  // Languages (larger)
  langGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 },
  langBtn: { background: CREAM_2, border: `1px solid ${BORDER}`, borderRadius: 4, padding: '14px 8px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, transition: 'all 0.2s', position: 'relative', fontFamily: 'inherit' },
  langBtnActive: { background: 'rgba(15, 122, 77, 0.1)', border: `1.5px solid ${GOLD}` },
  langFlag: { fontSize: 22 },
  langName: { fontSize: 11, color: TEXT_MUTED, letterSpacing: 0.3, textAlign: 'center', fontWeight: 500 },
  langCheck: { position: 'absolute', top: 5, right: 7, fontSize: 10, color: GOLD, fontWeight: 800 },
  langCount: { fontSize: 12, color: GOLD, letterSpacing: 1, fontWeight: 600 },
  langCountRow: { marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  langHint: { fontSize: 11, color: TEXT_SOFT, letterSpacing: 0.5, fontStyle: 'italic' },
  bulkSelectBtn: { background: CARD_BG, border: `1px solid ${BORDER}`, color: GOLD, fontSize: 11, fontWeight: 700, letterSpacing: 1, padding: '7px 13px', borderRadius: 3, cursor: 'pointer', textTransform: 'uppercase', transition: 'all 0.2s', fontFamily: 'inherit' },
  langDragHandle: { position: 'absolute', top: 4, left: 5, fontSize: 9, color: TEXT_SOFT, letterSpacing: -2, opacity: 0.5, transform: 'rotate(90deg)', pointerEvents: 'none' },
  langBtnDragging: { opacity: 0.4, transform: 'scale(0.95)' },

  // Glossary
  glossaryCard: { background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 6, marginBottom: 20, overflow: 'hidden', boxShadow: '0 1px 3px rgba(27, 24, 15, 0.04)' },
  glossaryHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '24px 36px', cursor: 'pointer', userSelect: 'none' },
  glossaryTitle: { display: 'flex', alignItems: 'center', gap: 14 },
  glossaryCount: { fontSize: 11, color: TEXT_SOFT, fontWeight: 500, letterSpacing: 1, textTransform: 'none' },
  glossaryBody: { padding: '0 36px 28px', borderTop: `1px solid ${BORDER}` },
  glossaryNote: { background: CREAM_2, border: `1px solid ${BORDER}`, borderLeft: `3px solid ${GOLD}`, borderRadius: 2, padding: 18, fontSize: 13, color: TEXT_MUTED, lineHeight: 1.7, margin: '20px 0' },
  glossaryActions: { display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' },
  glossaryActionBtn: { background: CREAM_2, border: `1px solid ${BORDER}`, borderRadius: 3, padding: '9px 14px', fontSize: 11, color: TEXT_MUTED, cursor: 'pointer', fontWeight: 600, letterSpacing: 0.5, fontFamily: 'inherit', transition: 'all 0.2s' },
  glossaryTable: { background: CREAM_2, borderRadius: 4, padding: 8, border: `1px solid ${BORDER}` },
  glossaryRowHeader: { display: 'grid', gridTemplateColumns: '1.4fr 1.4fr 0.8fr 1.6fr 0.3fr', gap: 8, padding: '10px 8px', fontSize: 10, color: GOLD, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 800 },
  glossaryRow: { display: 'grid', gridTemplateColumns: '1.4fr 1.4fr 0.8fr 1.6fr 0.3fr', gap: 8, padding: 4, alignItems: 'center' },
  glossaryInput: { background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 3, padding: '9px 12px', color: TEXT, fontSize: 13, fontFamily: 'inherit', width: '100%' },
  glossaryCheckLabel: { display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: TEXT_MUTED, cursor: 'pointer', fontWeight: 500 },
  glossaryCheck: { accentColor: GOLD, cursor: 'pointer' },
  glossaryDelBtn: { background: 'transparent', border: 'none', color: 'rgba(214, 78, 62, 0.5)', fontSize: 20, cursor: 'pointer', padding: 4 },
  glossarySaved: { marginTop: 16, fontSize: 12, color: TEAL, letterSpacing: 0.5, fontWeight: 500 },

  // YouTube config
  ytConfigCard: { background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 6, marginBottom: 28, overflow: 'hidden', boxShadow: '0 1px 3px rgba(27, 24, 15, 0.04)' },
  ytConfigHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '24px 36px', cursor: 'pointer', userSelect: 'none' },
  chevron: { fontSize: 11, color: TEXT_SOFT },
  ytConfigBody: { padding: '0 36px 28px', borderTop: `1px solid ${BORDER}` },
  ytInfoBox: { background: CREAM_2, border: `1px solid ${BORDER}`, borderLeft: `3px solid ${GOLD}`, borderRadius: 2, padding: 22, margin: '20px 0' },
  ytInfoTitle: { fontSize: 12, fontWeight: 800, color: GOLD, letterSpacing: 1.5, marginBottom: 12, textTransform: 'uppercase' },
  ytStepText: { fontSize: 14, color: TEXT_MUTED, lineHeight: 1.7 },
  code: { background: 'rgba(15, 122, 77, 0.12)', padding: '2px 6px', borderRadius: 2, fontSize: 12, fontFamily: 'monospace', color: DARK, fontWeight: 600 },
  ytFields: { display: 'grid', gridTemplateColumns: '1fr', gap: 14 },
  ytField: { display: 'flex', flexDirection: 'column', gap: 8 },
  ytLabel: { fontSize: 11, letterSpacing: 1.5, color: TEXT_MUTED, textTransform: 'uppercase', fontWeight: 700 },
  ytInput: { background: CREAM_2, border: `1px solid ${BORDER}`, borderRadius: 3, padding: '13px 16px', color: TEXT, fontSize: 14, fontFamily: 'inherit' },
  ytReady: { marginTop: 14, fontSize: 13, color: TEAL, fontWeight: 600 },

  // Run button (big, futuristic)
  actionRow: { display: 'flex', justifyContent: 'center', marginBottom: 28 },
  translateBtn: { background: DARK, border: `2px solid ${GOLD}`, borderRadius: 4, padding: '20px 64px', fontSize: 14, fontWeight: 800, letterSpacing: 3, color: ON_DARK, cursor: 'pointer', textTransform: 'uppercase', transition: 'all 0.3s', boxShadow: `0 6px 28px rgba(27, 24, 15, 0.18)`, fontFamily: 'inherit' },
  translateBtnDisabled: { opacity: 0.3, cursor: 'not-allowed' },
  translateBtnRunning: { background: CREAM_2, color: DARK, border: `2px solid ${GOLD}` },
  btnInner: { display: 'flex', alignItems: 'center', justifyContent: 'center' },
  btnDisabled: { opacity: 0.4, cursor: 'not-allowed' },

  // Progress
  progressCard: { background: CREAM_2, border: `1px solid ${BORDER}`, borderLeft: `4px solid ${GOLD}`, borderRadius: 2, padding: 28, marginBottom: 28 },
  progressGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8, marginTop: 16 },
  progressItem: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 3, background: CARD_BG, border: `1px solid ${BORDER}`, fontSize: 13 },
  progressItemActive: { border: `1.5px solid ${GOLD}` },
  progressItemDone: { border: `1px solid ${TEAL}`, background: 'rgba(15, 122, 77, 0.04)' },
  progressLang: { flex: 1, fontSize: 12, color: TEXT, fontWeight: 500 },
  progressStatus: { fontSize: 13, color: GOLD, fontWeight: 800 },

  // Results
  resultsSection: { marginTop: 8 },
  resultsHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22, flexWrap: 'wrap', gap: 14 },
  resultsTitle: { fontSize: 22, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 14, color: TEXT, letterSpacing: -0.5 },
  resultsActions: { display: 'flex', gap: 12 },
  uploadAllBtn: { padding: '13px 26px', fontSize: 12, background: BLUE, borderColor: BLUE, color: ON_DARK },
  downloadAllBtn: { padding: '13px 26px', fontSize: 12 },
  resultsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 16 },
  resultCard: { background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 6, padding: 22, transition: 'all 0.2s', boxShadow: '0 1px 3px rgba(27, 24, 15, 0.04)' },
  resultLang: { display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 },
  resultFlag: { fontSize: 28 },
  resultLangName: { fontSize: 15, fontWeight: 700, color: TEXT },
  resultMeta: { fontSize: 11, color: GOLD, letterSpacing: 1, marginTop: 3, fontWeight: 600, textTransform: 'uppercase' },
  uploadedBadge: { color: TEAL, letterSpacing: 0.5 },
  resultPreview: { background: CREAM_2, border: `1px solid ${BORDER}`, borderRadius: 3, padding: 13, marginBottom: 14, minHeight: 72 },
  previewBlock: { marginBottom: 8 },
  previewTime: { fontSize: 10, color: GOLD, letterSpacing: 0.5, marginBottom: 3, fontFamily: 'monospace', fontWeight: 700 },
  previewText: { fontSize: 12, color: TEXT, lineHeight: 1.5 },
  uploadError: { fontSize: 12, color: RED, marginBottom: 10, fontWeight: 500 },
  resultBtns: { display: 'flex', gap: 10 },
  resultActionBtn: { flex: 1, justifyContent: 'center', padding: '11px 0', fontSize: 11, letterSpacing: 1.5, display: 'flex', alignItems: 'center' },
  ytUploadBtn: { background: 'rgba(16, 79, 132, 0.08)', border: `1px solid ${BLUE}`, color: BLUE },
  docxBtn: { background: 'rgba(115, 70, 99, 0.08)', border: `1px solid ${PURPLE}`, color: PURPLE },
  reuploadFileBar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', background: CREAM_2, border: `1px solid ${BORDER}`, borderRadius: 4, marginTop: 16 },
  reuploadFileName: { fontSize: 14, fontWeight: 700, color: TEXT, marginBottom: 4 },
  reuploadStatus: { fontSize: 12, color: TEXT_MUTED, fontWeight: 500 },
  ytSuccessBar: { marginTop: 22, padding: '16px 22px', background: 'rgba(15, 122, 77, 0.08)', border: `1px solid ${TEAL}`, borderRadius: 3, fontSize: 14, color: TEAL, lineHeight: 1.6, fontWeight: 500 },

  // Activity Dashboard (larger)
  dashSection: { marginTop: 72, padding: '40px 0 0', borderTop: `1px solid ${BORDER}` },

  // Recently Translated section
  recentSection: { marginTop: 56, padding: '36px 0 0', borderTop: `1px solid ${BORDER}` },
  recentHeader: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 22, flexWrap: 'wrap', gap: 14 },
  recentTitle: { display: 'flex', flexDirection: 'column', gap: 6 },
  recentSubtitle: { fontSize: 12, color: TEXT_SOFT, fontWeight: 500, letterSpacing: 0.3 },
  recentList: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 },
  recentCard: { background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 6, padding: 18, cursor: 'pointer', transition: 'all 0.2s', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 10, fontFamily: 'inherit', boxShadow: '0 1px 3px rgba(14, 20, 17, 0.04)' },
  recentCardTop: { display: 'flex', alignItems: 'center', gap: 10 },
  recentCardIcon: { fontSize: 14, flexShrink: 0 },
  recentCardName: { fontSize: 13, fontWeight: 700, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flex: 1 },
  recentCardLangs: { display: 'flex', gap: 4, alignItems: 'center', fontSize: 16, flexWrap: 'wrap' },
  recentCardMore: { fontSize: 11, color: TEXT_SOFT, fontWeight: 600, padding: '2px 6px', background: CREAM_2, borderRadius: 2 },
  recentCardMeta: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: TEXT_SOFT, paddingTop: 10, borderTop: `1px solid ${BORDER}`, fontWeight: 500 },
  recentCardTime: { color: GOLD, fontWeight: 600 },
  dashHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28, flexWrap: 'wrap', gap: 14 },
  dashTitle: { display: 'flex', alignItems: 'center', gap: 16 },
  dashLive: { display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 10, fontWeight: 800, letterSpacing: 2.5, color: RED, background: 'rgba(214, 78, 62, 0.08)', border: `1px solid rgba(214, 78, 62, 0.3)`, padding: '5px 11px', borderRadius: 2, textTransform: 'uppercase' },
  dashTitleText: { fontSize: 22, fontWeight: 800, letterSpacing: -0.5, color: TEXT },
  dashSubtitle: { display: 'flex', alignItems: 'center', gap: 18, fontSize: 12, color: TEXT_MUTED },
  dashSubAccent: { color: GOLD, fontWeight: 700 },
  dashReset: { background: 'transparent', border: `1px solid ${BORDER_STRONG}`, color: TEXT_MUTED, fontSize: 11, fontWeight: 700, letterSpacing: 1, padding: '6px 12px', borderRadius: 3, cursor: 'pointer', textTransform: 'uppercase', fontFamily: 'inherit', transition: 'all 0.2s' },
  dashGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 },
  dashCard: { background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 6, padding: 28, transition: 'all 0.3s', position: 'relative', overflow: 'hidden', boxShadow: '0 1px 3px rgba(27, 24, 15, 0.04)' },
  dashCardNum: { fontSize: 56, fontWeight: 800, color: DARK, letterSpacing: -2, lineHeight: 1, marginBottom: 8, marginTop: 14, fontVariantNumeric: 'tabular-nums', fontFamily: 'Chivo, sans-serif' },
  dashCardSub: { fontSize: 12, color: TEXT_SOFT, letterSpacing: 0.3 },
  dashFooter: { marginTop: 24, fontSize: 11, color: TEXT_SOFT, textAlign: 'center', letterSpacing: 1, fontStyle: 'italic' },
};

// Admin & Guide tab
const a = {
  main: { maxWidth: 1280, margin: '0 auto', padding: '0 40px 100px' },
  hero: { background: DARK_HERO, color: ON_DARK, margin: '0 -40px 56px', padding: '72px 80px 64px', position: 'relative' },
  heroDiamond: { position: 'absolute', top: 32, right: 80, opacity: 0.95 },
  heroLabel: { fontSize: 11, letterSpacing: 4, color: GOLD, marginBottom: 22, textTransform: 'uppercase', fontWeight: 600 },
  heroTitle: { fontSize: 'clamp(36px, 5vw, 60px)', fontWeight: 800, margin: '0 0 22px', letterSpacing: -1.5, color: ON_DARK, lineHeight: 1 },
  heroSub: { fontSize: 16, color: 'rgba(249, 247, 234, 0.7)', maxWidth: 700, lineHeight: 1.7 },

  aggregateGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 56 },
  aggCard: { background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 6, padding: 32, boxShadow: '0 1px 3px rgba(27, 24, 15, 0.04)' },
  aggNum: { fontSize: 52, fontWeight: 800, color: DARK, letterSpacing: -2, lineHeight: 1, marginTop: 14, marginBottom: 8, fontVariantNumeric: 'tabular-nums' },
  aggOf: { fontSize: 24, color: TEXT_SOFT, fontWeight: 600 },
  aggSub: { fontSize: 12, color: TEXT_SOFT, letterSpacing: 0.3 },

  tableTitle: { fontSize: 18, fontWeight: 800, color: TEXT, marginBottom: 18, letterSpacing: -0.3 },
  tableTitleRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 12 },
  tableActions: { display: 'flex', gap: 8 },
  adminActionBtn: { background: CREAM_2, border: `1px solid ${BORDER}`, borderRadius: 4, padding: '9px 14px', fontSize: 11, color: TEXT_MUTED, cursor: 'pointer', fontWeight: 700, letterSpacing: 1, fontFamily: 'inherit', transition: 'all 0.2s', textTransform: 'uppercase' },
  tableWrap: { background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 6, overflow: 'hidden', marginBottom: 32, boxShadow: '0 1px 3px rgba(27, 24, 15, 0.04)' },
  tableHeader: { display: 'flex', alignItems: 'center', padding: '16px 24px', background: CREAM_2, fontSize: 10, letterSpacing: 2, color: GOLD, textTransform: 'uppercase', fontWeight: 800, gap: 12, borderBottom: `1px solid ${BORDER}` },
  tableRow: { display: 'flex', alignItems: 'center', padding: '18px 24px', borderBottom: `1px solid ${BORDER}`, gap: 12, transition: 'background 0.2s' },
  tableRowTop: { background: 'rgba(15, 122, 77, 0.04)' },
  userBadge: { background: DARK, color: GOLD, fontSize: 10, fontWeight: 800, letterSpacing: 1.5, padding: '6px 9px', borderRadius: 3, fontFamily: 'monospace' },
  userName: { fontSize: 14, fontWeight: 600, color: TEXT },
  topBadge: { fontSize: 10, color: GOLD, fontWeight: 700, letterSpacing: 1, marginTop: 2 },
  cellNum: { fontSize: 14, fontWeight: 700, color: TEXT, textAlign: 'right', fontVariantNumeric: 'tabular-nums' },

  adminNote: { background: CREAM_2, border: `1px solid ${BORDER}`, borderLeft: `3px solid ${BLUE}`, borderRadius: 2, padding: 24 },
  adminNoteTitle: { fontSize: 11, fontWeight: 800, color: BLUE, letterSpacing: 1.5, marginBottom: 10, textTransform: 'uppercase' },
  adminNoteText: { fontSize: 13, color: TEXT_MUTED, lineHeight: 1.7 },

  // Guide tab
  phases: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 56 },
  phaseCard: { background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 6, overflow: 'hidden', display: 'flex', boxShadow: '0 1px 3px rgba(27, 24, 15, 0.04)' },
  phaseStripe: { width: 5, flexShrink: 0 },
  phaseContent: { padding: 28, flex: 1 },
  phaseTag: { fontSize: 10, fontWeight: 800, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 12 },
  phaseTitle: { fontSize: 17, fontWeight: 800, marginBottom: 22, color: TEXT, lineHeight: 1.3, letterSpacing: -0.3 },
  step: { display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  stepNum: { minWidth: 24, height: 24, borderRadius: '50%', border: '1.5px solid', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 },
  stepText: { fontSize: 13, color: TEXT_MUTED, lineHeight: 1.6 },
  tipsTitle: { fontSize: 14, fontWeight: 800, letterSpacing: 2.5, color: GOLD, textTransform: 'uppercase', marginBottom: 24 },
  tipsGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 },
  tipCard: { background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 6, padding: 24, boxShadow: '0 1px 3px rgba(27, 24, 15, 0.04)' },
  tipIcon: { fontSize: 22, marginBottom: 14, color: GOLD },
  tipTitle: { fontSize: 14, fontWeight: 800, marginBottom: 10, color: TEXT },
  tipText: { fontSize: 12, color: TEXT_MUTED, lineHeight: 1.6 },
};
