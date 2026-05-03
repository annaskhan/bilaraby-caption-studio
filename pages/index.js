import { useState, useRef, useCallback } from 'react';
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

async function translateBlocks(blocks, langLabel) {
  const response = await fetch('/api/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blocks, langLabel }),
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || 'Translation failed');
  }
  const data = await response.json();
  return data.blocks;
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
  const fileRef = useRef();

  const handleFile = useCallback((f) => {
    if (!f || !f.name.endsWith('.srt')) { setError('Please upload a valid .srt file'); return; }
    setError(''); setResults({}); setStage('idle'); setActiveStageIndex(-1); setUploadStatus({});
    const reader = new FileReader();
    reader.onload = (e) => { setSrtContent(e.target.result); setFile(f); };
    reader.readAsText(f);
  }, []);

  const onDrop = (e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); };
  const toggleLang = (code) => setSelectedLangs(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]);

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

      await Promise.all(selectedLangs.map(async (code) => {
        const lang = LANGUAGES.find(l => l.code === code);
        try {
          setProgress(p => ({ ...p, [code]: 'translating' }));
          const translated = await translateBlocks(blocks, lang.label);
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
    } catch (e) {
      setUploadStatus(s => ({ ...s, [code]: `error:${e.message}` }));
    }
  };

  const handleUploadAll = async () => {
    for (const code of Object.keys(results)) { await handleUpload(code); await sleep(800); }
  };

  return (
    <>
      <Head>
        <title>BilAraby Caption Studio</title>
        <meta name="description" content="AI-powered Arabic subtitle translation tool" />
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>✦</text></svg>" />
      </Head>

      <div style={s.root}>
        {/* Header */}
        <header style={s.header}>
          <div style={s.headerInner}>
            <div style={s.logo}>
              <span style={s.logoAr}>بالعربي</span>
              <span style={s.logoDivider}>✦</span>
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
            {/* Hero */}
            <div style={s.hero}>
              <h1 style={s.heroTitle}>Translate Once.<br /><span style={s.heroAccent}>Reach Everyone.</span></h1>
              <p style={s.heroSub}>Upload your Arabic SRT. Claude translates to 12 languages simultaneously. Push directly to YouTube as drafts — your team reviews and publishes.</p>
            </div>

            {/* Pipeline */}
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
              {/* Upload */}
              <div style={s.card}>
                <div style={s.cardLabel}>01 — SOURCE FILE</div>
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
                {error && <div style={s.error}>{error}</div>}
              </div>

              {/* Languages */}
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

            {/* Translate Button */}
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

            {/* Progress */}
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

            {/* Results */}
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

            {/* Stats */}
            <div style={s.statBar}>
              {[['150,000', 'QAR annual saving'], ['~$0.15', 'per video translated'], ['12', 'languages supported'], ['∞', 'videos per month']].map(([num, label], i, arr) => (
                <>
                  <div key={num} style={s.stat}>
                    <span style={s.statNum}>{num}</span>
                    <span style={s.statLabel}>{label}</span>
                  </div>
                  {i < arr.length - 1 && <div key={`d${i}`} style={s.statDivider}>✦</div>}
                </>
              ))}
            </div>
          </main>
        )}
      </div>
    </>
  );
}

function GuideTab() {
  const phases = [
    { phase: 'PHASE 1', color: '#1A1A2E', title: 'Get your Arabic SRT from YouTube', steps: ['Log in to YouTube Studio (studio.youtube.com)', 'Click Subtitles in the left menu', 'Find and click your video', 'Click the three-dot menu (⋮) on the Arabic track', 'Select Download → .srt format', 'Save to your computer'] },
    { phase: 'PHASE 2', color: '#2244AA', title: 'Configure YouTube Upload (first time only)', steps: ['Go to developers.google.com/oauthplayground', 'Find YouTube Data API v3 in the left panel', 'Check the youtube.force-ssl scope', 'Click Authorize APIs → sign in with BilAraby YouTube account', 'Click Exchange authorization code for tokens', 'Copy the Access token (starts with ya29...)', 'Paste your Video ID and token into the tool'] },
    { phase: 'PHASE 3', color: '#1A7A5A', title: 'Translate with AI', steps: ['Drop your Arabic .srt file into the upload zone', 'Select all target languages', 'Click Run AI Translation', 'Watch Claude translate all languages simultaneously', 'Takes 30–90 seconds depending on video length'] },
    { phase: 'PHASE 4', color: '#7A3A1A', title: 'Upload & Publish', steps: ['Click Upload All to YouTube', 'All tracks upload as Drafts — not visible to viewers yet', 'Go to YouTube Studio → Subtitles', 'Review each language track', 'Click Publish when satisfied'] },
  ];
  const tips = [
    ['⚡', 'Batch process', 'Run multiple videos back-to-back. Each takes 30–90 seconds.'],
    ['🔑', 'Token expired?', 'Get a fresh token from OAuth Playground if you get an auth error.'],
    ['✏', 'Edit before publish', 'Always review drafts — Claude is accurate but nuance may need a human touch.'],
    ['📁', 'Keep your SRTs', 'Download and store all translated SRTs in a shared drive folder.'],
    ['🌍', 'Priority languages', 'Start with English, French, Turkish — highest reach for BilAraby.'],
    ['💰', 'Cost tracking', 'Monitor API usage at console.anthropic.com (~$0.15/video).'],
  ];
  return (
    <div style={g.root}>
      <div style={g.hero}>
        <div style={g.heroLabel}>TEAM OPERATIONS GUIDE</div>
        <h1 style={g.heroTitle}>BilAraby Caption Studio</h1>
        <p style={g.heroSub}>How to translate and publish Arabic subtitles across 12 languages using AI.</p>
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

const s = {
  root: { minHeight: '100vh', background: '#06060a', color: '#e8e0d0' },
  header: { borderBottom: '1px solid rgba(212,175,80,0.12)', padding: '0 32px', position: 'sticky', top: 0, background: 'rgba(6,6,10,0.96)', backdropFilter: 'blur(12px)', zIndex: 100 },
  headerInner: { maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64 },
  logo: { display: 'flex', alignItems: 'center', gap: 12 },
  logoAr: { fontSize: 22, fontWeight: 700, color: '#D4AF50', fontFamily: 'serif' },
  logoDivider: { color: 'rgba(212,175,80,0.3)', fontSize: 12 },
  logoEn: { fontSize: 12, fontWeight: 500, letterSpacing: 4, textTransform: 'uppercase', color: 'rgba(232,224,208,0.4)' },
  headerRight: { display: 'flex', alignItems: 'center', gap: 20 },
  tabNav: { display: 'flex', gap: 4, background: 'rgba(232,224,208,0.05)', borderRadius: 6, padding: 4 },
  tabBtn: { background: 'transparent', border: 'none', color: 'rgba(232,224,208,0.4)', fontSize: 12, fontWeight: 600, letterSpacing: 1, padding: '6px 14px', borderRadius: 4, cursor: 'pointer', textTransform: 'uppercase', transition: 'all 0.2s' },
  tabBtnActive: { background: 'rgba(212,175,80,0.15)', color: '#D4AF50' },
  badge: { fontSize: 9, letterSpacing: 3, fontWeight: 700, color: '#D4AF50', border: '1px solid rgba(212,175,80,0.25)', padding: '4px 10px', borderRadius: 2 },
  main: { maxWidth: 1100, margin: '0 auto', padding: '48px 32px 80px' },
  hero: { textAlign: 'center', marginBottom: 48 },
  heroTitle: { fontSize: 'clamp(32px, 4.5vw, 56px)', fontWeight: 800, lineHeight: 1.1, margin: '0 0 18px', letterSpacing: -1 },
  heroAccent: { color: '#D4AF50' },
  heroSub: { fontSize: 15, color: 'rgba(232,224,208,0.5)', maxWidth: 560, margin: '0 auto', lineHeight: 1.8 },
  pipelineWrap: { display: 'flex', alignItems: 'flex-start', justifyContent: 'center', marginBottom: 48, overflowX: 'auto', padding: '16px 0', gap: 0 },
  pipelineItem: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, position: 'relative', flex: '0 0 auto' },
  pipelineItemYT: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, flex: '0 0 auto', marginLeft: 24, paddingLeft: 24, borderLeft: '1px solid rgba(212,175,80,0.2)' },
  pipelineNode: { width: 44, height: 44, borderRadius: '50%', border: '1px solid rgba(232,224,208,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, color: 'rgba(232,224,208,0.25)', transition: 'all 0.4s' },
  pipelineNodeActive: { border: '1px solid #D4AF50', color: '#D4AF50', background: 'rgba(212,175,80,0.1)', boxShadow: '0 0 20px rgba(212,175,80,0.25)' },
  pipelineNodeDone: { border: '1px solid rgba(212,175,80,0.4)', color: 'rgba(212,175,80,0.6)' },
  pipelineLabel: { fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(232,224,208,0.2)', textAlign: 'center', maxWidth: 76, lineHeight: 1.3, transition: 'color 0.4s' },
  pipelineLabelActive: { color: 'rgba(212,175,80,0.7)' },
  pipelineConnector: { position: 'absolute', top: 22, left: 'calc(50% + 22px)', width: 'calc(100% - 8px)', height: 1, background: 'rgba(232,224,208,0.07)', transition: 'background 0.4s' },
  pipelineConnectorActive: { background: 'rgba(212,175,80,0.35)' },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 },
  card: { background: 'rgba(232,224,208,0.025)', border: '1px solid rgba(232,224,208,0.07)', borderRadius: 10, padding: 24 },
  cardLabel: { fontSize: 9, letterSpacing: 3, fontWeight: 700, color: '#D4AF50', marginBottom: 18, textTransform: 'uppercase' },
  dropzone: { border: '1px dashed rgba(232,224,208,0.15)', borderRadius: 8, padding: '36px 24px', textAlign: 'center', cursor: 'pointer', transition: 'all 0.3s', minHeight: 155, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  dropzoneActive: { border: '1px dashed #D4AF50', background: 'rgba(212,175,80,0.04)' },
  dropzoneFilled: { border: '1px solid rgba(212,175,80,0.3)', background: 'rgba(212,175,80,0.03)' },
  dropContent: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 },
  dropIconLg: { fontSize: 26, color: 'rgba(232,224,208,0.15)' },
  dropText: { fontSize: 13, color: 'rgba(232,224,208,0.5)' },
  dropSub: { fontSize: 11, color: 'rgba(232,224,208,0.25)' },
  fileInfo: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 },
  fileIcon: { fontSize: 22, color: '#D4AF50' },
  fileName: { fontSize: 13, fontWeight: 700, color: '#e8e0d0' },
  fileSize: { fontSize: 11, color: 'rgba(232,224,208,0.4)' },
  fileChange: { fontSize: 10, color: 'rgba(212,175,80,0.4)', letterSpacing: 1 },
  error: { marginTop: 10, fontSize: 12, color: '#ff6b6b', textAlign: 'center' },
  langGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 7 },
  langBtn: { background: 'rgba(232,224,208,0.03)', border: '1px solid rgba(232,224,208,0.08)', borderRadius: 6, padding: '10px 6px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, transition: 'all 0.2s', position: 'relative' },
  langBtnActive: { background: 'rgba(212,175,80,0.1)', border: '1px solid rgba(212,175,80,0.35)' },
  langFlag: { fontSize: 18 },
  langName: { fontSize: 9, color: 'rgba(232,224,208,0.55)', letterSpacing: 0.5, textAlign: 'center' },
  langCheck: { position: 'absolute', top: 4, right: 4, fontSize: 8, color: '#D4AF50', fontWeight: 700 },
  langCount: { marginTop: 12, fontSize: 10, color: 'rgba(212,175,80,0.5)', letterSpacing: 1, textAlign: 'right' },
  ytConfigCard: { background: 'rgba(232,224,208,0.025)', border: '1px solid rgba(232,224,208,0.07)', borderRadius: 10, marginBottom: 16, overflow: 'hidden' },
  ytConfigHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', cursor: 'pointer', userSelect: 'none' },
  ytConfigTitle: { display: 'flex', alignItems: 'center', gap: 10, fontSize: 10, fontWeight: 700, letterSpacing: 3, color: '#D4AF50', textTransform: 'uppercase' },
  ytIcon: { fontSize: 14, color: '#ff4444' },
  ytOptional: { fontSize: 9, color: 'rgba(232,224,208,0.3)', fontWeight: 400 },
  ytChevron: { fontSize: 10, color: 'rgba(232,224,208,0.3)' },
  ytConfigBody: { padding: '0 24px 24px', borderTop: '1px solid rgba(232,224,208,0.05)' },
  ytInfoBox: { background: 'rgba(212,175,80,0.04)', border: '1px solid rgba(212,175,80,0.12)', borderRadius: 8, padding: 18, margin: '16px 0' },
  ytInfoTitle: { fontSize: 11, fontWeight: 700, color: '#D4AF50', letterSpacing: 1, marginBottom: 14, textTransform: 'uppercase' },
  ytSteps: { display: 'flex', flexDirection: 'column', gap: 10 },
  ytStep: { display: 'flex', alignItems: 'flex-start', gap: 10 },
  ytStepNum: { minWidth: 18, height: 18, borderRadius: '50%', background: 'rgba(212,175,80,0.2)', color: '#D4AF50', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 },
  ytStepText: { fontSize: 12, color: 'rgba(232,224,208,0.7)', lineHeight: 1.6 },
  ytInfoNote: { marginTop: 12, fontSize: 11, color: 'rgba(232,224,208,0.4)', borderTop: '1px solid rgba(212,175,80,0.1)', paddingTop: 12 },
  link: { color: '#D4AF50', textDecoration: 'none' },
  code: { background: 'rgba(212,175,80,0.1)', padding: '1px 5px', borderRadius: 3, fontSize: 10, fontFamily: 'monospace', color: '#D4AF50' },
  ytFields: { display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 },
  ytField: { display: 'flex', flexDirection: 'column', gap: 6 },
  ytLabel: { fontSize: 10, letterSpacing: 2, color: 'rgba(232,224,208,0.4)', textTransform: 'uppercase' },
  ytInput: { background: 'rgba(232,224,208,0.04)', border: '1px solid rgba(232,224,208,0.1)', borderRadius: 6, padding: '10px 14px', color: '#e8e0d0', fontSize: 13, fontFamily: 'inherit' },
  ytReady: { marginTop: 12, fontSize: 11, color: '#50D4A0' },
  actionRow: { display: 'flex', justifyContent: 'center', marginBottom: 20 },
  translateBtn: { background: 'linear-gradient(135deg, #D4AF50 0%, #b8923a 100%)', border: 'none', borderRadius: 6, padding: '15px 44px', fontSize: 13, fontWeight: 700, letterSpacing: 2, color: '#06060a', cursor: 'pointer', textTransform: 'uppercase', transition: 'all 0.3s', boxShadow: '0 4px 24px rgba(212,175,80,0.2)' },
  translateBtnDisabled: { opacity: 0.25, cursor: 'not-allowed' },
  translateBtnRunning: { background: 'linear-gradient(135deg, rgba(212,175,80,0.3) 0%, rgba(184,146,58,0.3) 100%)', color: '#D4AF50' },
  btnInner: { display: 'flex', alignItems: 'center' },
  btnDisabled: { opacity: 0.4, cursor: 'not-allowed' },
  progressCard: { background: 'rgba(212,175,80,0.03)', border: '1px solid rgba(212,175,80,0.12)', borderRadius: 8, padding: 22, marginBottom: 20 },
  progressTitle: { fontSize: 10, letterSpacing: 3, color: '#D4AF50', marginBottom: 14, textTransform: 'uppercase' },
  progressGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 7 },
  progressItem: { display: 'flex', alignItems: 'center', gap: 7, padding: '7px 11px', borderRadius: 5, background: 'rgba(232,224,208,0.02)', border: '1px solid rgba(232,224,208,0.05)', fontSize: 12 },
  progressItemActive: { border: '1px solid rgba(212,175,80,0.3)', background: 'rgba(212,175,80,0.05)' },
  progressItemDone: { border: '1px solid rgba(80,212,160,0.2)', background: 'rgba(80,212,160,0.03)' },
  progressLang: { flex: 1, fontSize: 11, color: 'rgba(232,224,208,0.6)' },
  progressStatus: { fontSize: 11, color: '#D4AF50' },
  resultsSection: { marginTop: 8 },
  resultsHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  resultsTitle: { fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 },
  resultsTitleAccent: { color: '#D4AF50' },
  resultsActions: { display: 'flex', gap: 10 },
  uploadAllBtn: { padding: '10px 20px', fontSize: 11, background: 'linear-gradient(135deg, #4466cc 0%, #2244aa 100%)' },
  downloadAllBtn: { padding: '10px 20px', fontSize: 11 },
  resultsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 },
  resultCard: { background: 'rgba(232,224,208,0.025)', border: '1px solid rgba(232,224,208,0.07)', borderRadius: 8, padding: 18, transition: 'all 0.2s' },
  resultLang: { display: 'flex', alignItems: 'center', gap: 11, marginBottom: 14 },
  resultFlag: { fontSize: 22 },
  resultLangName: { fontSize: 13, fontWeight: 700 },
  resultMeta: { fontSize: 10, color: 'rgba(212,175,80,0.5)', letterSpacing: 1, marginTop: 2 },
  uploadedBadge: { color: '#50D4A0', letterSpacing: 0.5 },
  resultPreview: { background: 'rgba(0,0,0,0.25)', borderRadius: 5, padding: 11, marginBottom: 12, minHeight: 60 },
  previewBlock: { marginBottom: 7 },
  previewTime: { fontSize: 9, color: 'rgba(212,175,80,0.4)', letterSpacing: 0.5, marginBottom: 2, fontFamily: 'monospace' },
  previewText: { fontSize: 11, color: 'rgba(232,224,208,0.65)', lineHeight: 1.5 },
  uploadError: { fontSize: 11, color: '#ff6b6b', marginBottom: 8 },
  resultBtns: { display: 'flex', gap: 8 },
  resultActionBtn: { flex: 1, justifyContent: 'center', padding: '9px 0', fontSize: 10, letterSpacing: 1.5, display: 'flex', alignItems: 'center' },
  ytUploadBtn: { background: 'rgba(68,102,204,0.15)', border: '1px solid rgba(68,102,204,0.3)', color: '#6B8FD4' },
  ytSuccessBar: { marginTop: 20, padding: '14px 20px', background: 'rgba(80,212,160,0.06)', border: '1px solid rgba(80,212,160,0.2)', borderRadius: 8, fontSize: 13, color: '#50D4A0', lineHeight: 1.6 },
  statBar: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 36, marginTop: 60, padding: '28px 0', borderTop: '1px solid rgba(232,224,208,0.05)' },
  stat: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 },
  statNum: { fontSize: 22, fontWeight: 800, color: '#D4AF50', letterSpacing: -0.5 },
  statLabel: { fontSize: 9, color: 'rgba(232,224,208,0.3)', letterSpacing: 2, textTransform: 'uppercase' },
  statDivider: { color: 'rgba(212,175,80,0.15)', fontSize: 10 },
};

const g = {
  root: { maxWidth: 900, margin: '0 auto', padding: '48px 32px 80px' },
  hero: { textAlign: 'center', marginBottom: 48, paddingBottom: 40, borderBottom: '1px solid rgba(212,175,80,0.1)' },
  heroLabel: { fontSize: 9, letterSpacing: 4, color: '#D4AF50', marginBottom: 14, textTransform: 'uppercase' },
  heroTitle: { fontSize: 38, fontWeight: 800, margin: '0 0 14px', letterSpacing: -1 },
  heroSub: { fontSize: 15, color: 'rgba(232,224,208,0.5)', lineHeight: 1.8 },
  phases: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 48 },
  phaseCard: { background: 'rgba(232,224,208,0.025)', border: '1px solid rgba(232,224,208,0.07)', borderRadius: 10, overflow: 'hidden', display: 'flex' },
  phaseStripe: { width: 4, flexShrink: 0 },
  phaseContent: { padding: 22, flex: 1 },
  phaseTag: { fontSize: 9, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 8 },
  phaseTitle: { fontSize: 14, fontWeight: 700, marginBottom: 16, color: '#e8e0d0', lineHeight: 1.4 },
  step: { display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  stepNum: { minWidth: 20, height: 20, borderRadius: '50%', border: '1px solid', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 },
  stepText: { fontSize: 12, color: 'rgba(232,224,208,0.65)', lineHeight: 1.6 },
  tipsTitle: { fontSize: 13, fontWeight: 700, letterSpacing: 2, color: '#D4AF50', textTransform: 'uppercase', marginBottom: 20 },
  tipsGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 },
  tipCard: { background: 'rgba(232,224,208,0.02)', border: '1px solid rgba(232,224,208,0.06)', borderRadius: 8, padding: 18 },
  tipIcon: { fontSize: 20, marginBottom: 10 },
  tipTitle: { fontSize: 12, fontWeight: 700, marginBottom: 8, color: '#e8e0d0' },
  tipText: { fontSize: 11, color: 'rgba(232,224,208,0.5)', lineHeight: 1.6 },
};
