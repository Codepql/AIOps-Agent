'use client';

import { FormEvent, KeyboardEvent, useEffect, useState } from 'react';

type View = 'chat' | 'aiops' | 'knowledge';
type Message = { role: 'user' | 'assistant'; content: string };
type Health = { data?: { status?: string; database?: { status?: string }; capabilities?: { knowledge_base?: string } } };

const navigation = [
  { id: 'chat', label: '智能对话', caption: 'Copilot', icon: '01' },
  { id: 'aiops', label: '告警诊断', caption: 'Diagnosis', icon: '02' },
  { id: 'knowledge', label: '知识库', caption: 'Knowledge', icon: '03' },
] as const;

const pageMeta = {
  chat: { code: 'OPS / COPILOT', title: '智能排障工作台', description: '描述现象，让 AI 联合日志、指标与知识库定位根因。' },
  aiops: { code: 'OPS / DIAGNOSIS', title: '告警诊断', description: '编排 CLS 与 Monitor 工具，生成可复现的诊断链路。' },
  knowledge: { code: 'OPS / KNOWLEDGE', title: '知识库', description: '沉淀故障手册与处理经验，为每次排障提供上下文。' },
} as const;

const marketRows = [
  { name: 'gateway-api', value: '99.98%', delta: '+0.12%', state: 'normal' },
  { name: 'order-service', value: '86 ms', delta: '-4.20%', state: 'normal' },
  { name: 'data-sync', value: '3 alerts', delta: '+2', state: 'risk' },
  { name: 'knowledge-index', value: '1,248', delta: '+36', state: 'normal' },
] as const;

async function readSse(response: Response, onPayload: (payload: Record<string, unknown>) => void) {
  if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split('\n\n');
    buffer = frames.pop() ?? '';
    for (const frame of frames) {
      const data = frame.split('\n').find((line) => line.startsWith('data:'))?.slice(5).trim();
      if (data) onPayload(JSON.parse(data) as Record<string, unknown>);
    }
  }
}

export default function Home() {
  const [view, setView] = useState<View>('chat');
  const [sessionId, setSessionId] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [health, setHealth] = useState<Health>();
  const [diagnosis, setDiagnosis] = useState<string[]>([]);
  const [uploadStatus, setUploadStatus] = useState('');

  useEffect(() => {
    setSessionId(crypto.randomUUID());
    fetch('/health').then((response) => response.json()).then(setHealth).catch(() => setHealth({}));
  }, []);

  async function send(event: FormEvent) {
    event.preventDefault();
    const prompt = question.trim();
    if (!prompt || busy) return;
    setQuestion('');
    setBusy(true);
    const activeSessionId = sessionId || crypto.randomUUID();
    if (!sessionId) setSessionId(activeSessionId);
    setMessages((current) => [...current, { role: 'user', content: prompt }, { role: 'assistant', content: '' }]);
    try {
      const response = await fetch('/api/chat_stream', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ Id: activeSessionId, Question: prompt }),
      });
      await readSse(response, (payload) => {
        if (payload.type === 'error') throw new Error(String(payload.data ?? '请求失败'));
        if (payload.type === 'content' && payload.data) {
          setMessages((current) => current.map((message, index) => index === current.length - 1
            ? { ...message, content: message.content + String(payload.data) } : message));
        }
      });
    } catch (error) {
      setMessages((current) => current.map((message, index) => index === current.length - 1
        ? { ...message, content: `请求失败：${error instanceof Error ? error.message : String(error)}` } : message));
    } finally { setBusy(false); }
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  async function runDiagnosis() {
    if (busy) return;
    setBusy(true);
    setDiagnosis(['正在建立工具链连接…']);
    try {
      const response = await fetch('/api/aiops', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId || 'default' }),
      });
      await readSse(response, (payload) => {
        if (payload.type === 'error') throw new Error(String(payload.message ?? '诊断失败'));
        const text = String(payload.report ?? payload.response ?? payload.message ?? '');
        if (text) setDiagnosis((current) => [...current, text]);
      });
    } catch (error) {
      setDiagnosis((current) => [...current, `诊断失败：${error instanceof Error ? error.message : String(error)}`]);
    } finally { setBusy(false); }
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = event.currentTarget.elements.namedItem('file') as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || busy) return;
    setBusy(true);
    setUploadStatus('正在上传并建立索引…');
    try {
      const body = new FormData();
      body.append('file', file);
      const response = await fetch('/api/upload', { method: 'POST', body });
      const payload = await response.json() as { detail?: string; data?: { indexed?: boolean; index_error?: string | null } };
      if (!response.ok) throw new Error(payload.detail ?? `HTTP ${response.status}`);
      setUploadStatus(payload.data?.indexed
        ? `“${file.name}”已上传并完成索引。`
        : `“${file.name}”已保存，但未建立向量索引：${payload.data?.index_error ?? '知识库不可用'}`);
    } catch (error) {
      setUploadStatus(`上传失败：${error instanceof Error ? error.message : String(error)}`);
    } finally { setBusy(false); }
  }

  const isHealthy = health?.data?.status === 'healthy';
  const meta = pageMeta[view];

  return <main className="opsShell">
    <aside className="rail">
      <div className="brand">
        <span className="brandSignal" aria-hidden="true"><i /><i /><i /></span>
        <div><strong>ONECALL</strong><small>AI OPERATIONS</small></div>
      </div>

      <div className="environment">
        <span className={`healthBeacon ${isHealthy ? 'isHealthy' : ''}`} aria-hidden="true" />
        <div><small>SYSTEM STATUS</small><strong>{isHealthy ? '所有系统正常' : '部分能力受限'}</strong></div>
        <span className="envTag">LOCAL</span>
      </div>

      <nav className="primaryNav" aria-label="主要功能">
        <p>COMMAND CENTER</p>
        {navigation.map((item) => <button
          type="button" className={view === item.id ? 'active' : ''} key={item.id}
          aria-current={view === item.id ? 'page' : undefined} onClick={() => setView(item.id)}
        >
          <span className="navIndex">{item.icon}</span>
          <span><strong>{item.label}</strong><small>{item.caption}</small></span>
          <span className="navArrow" aria-hidden="true">↗</span>
        </button>)}
      </nav>

      <div className="railTelemetry">
        <p><span>API GATEWAY</span><strong className="ok">ONLINE</strong></p>
        <p><span>POSTGRESQL</span><strong className={isHealthy ? 'ok' : 'warn'}>{health?.data?.database?.status ?? 'CHECKING'}</strong></p>
        <p><span>VECTOR INDEX</span><strong className={isHealthy ? 'ok' : 'warn'}>{isHealthy ? 'READY' : 'LIMITED'}</strong></p>
      </div>
      <div className="railFooter"><span>OC</span><p>OneCall Runtime<br /><small>LangGraph / MCP</small></p></div>
    </aside>

    <section className="stage">
      <header className="topbar">
        <div><p className="breadcrumb">{meta.code}</p><h1>{meta.title}</h1><p className="pageDescription">{meta.description}</p></div>
        <div className="topbarMeta">
          <span><i className="pulse" /> LIVE</span>
          <span className="sessionCode">SESSION / {sessionId ? sessionId.slice(0, 8).toUpperCase() : '--------'}</span>
        </div>
      </header>

      <div className="marketTicker" aria-label="系统实时行情">
        <span className="tickerClock">LIVE / LOCAL</span>
        <p><b>API</b><strong className="gain">3001 ONLINE</strong><em>+0.08%</em></p>
        <p><b>POSTGRES</b><strong className={isHealthy ? 'gain' : 'loss'}>{isHealthy ? 'CONNECTED' : 'LIMITED'}</strong><em>{isHealthy ? '+1.00%' : '-0.38%'}</em></p>
        <p><b>CLS MCP</b><strong className="gain">8003 READY</strong><em>+0.02%</em></p>
        <p><b>MONITOR</b><strong className="gain">8004 READY</strong><em>+0.04%</em></p>
        <p><b>VECTOR</b><strong className={isHealthy ? 'gain' : 'loss'}>{isHealthy ? 'INDEXED' : 'OFFLINE'}</strong><em>{isHealthy ? '+0.16%' : '-1.00%'}</em></p>
      </div>

      {view === 'chat' && <section className="chatWorkspace" aria-label="智能对话">
        <div className="messageStream">
          {!messages.length && <div className="terminalOverview">
            <section className="trendPanel" aria-labelledby="trend-title">
              <header><div><p>ONECALL COMPOSITE</p><h2 id="trend-title">系统健康指数</h2></div><div className="quote"><strong>98.72</strong><span className="gain">+1.26&nbsp;&nbsp;+1.29%</span></div></header>
              <div className="chartLegend"><span>今日</span><span>开 97.46</span><span>高 99.18</span><span>低 96.82</span><span>告警 3</span></div>
              <div className="lineChart" role="img" aria-label="系统健康指数今日从97.46上升至98.72">
                <span className="axis top">100</span><span className="axis middle">98</span><span className="axis bottom">96</span>
                <svg viewBox="0 0 800 260" preserveAspectRatio="none" aria-hidden="true">
                  <path className="area" d="M0 210 L45 204 L90 218 L135 184 L180 190 L225 154 L270 166 L315 116 L360 132 L405 92 L450 104 L495 76 L540 94 L585 58 L630 68 L675 34 L720 48 L760 26 L800 38 L800 260 L0 260 Z" />
                  <path className="trend" d="M0 210 L45 204 L90 218 L135 184 L180 190 L225 154 L270 166 L315 116 L360 132 L405 92 L450 104 L495 76 L540 94 L585 58 L630 68 L675 34 L720 48 L760 26 L800 38" />
                  <path className="average" d="M0 220 L100 206 L200 184 L300 154 L400 126 L500 98 L600 76 L700 58 L800 46" />
                  <circle cx="800" cy="38" r="5" />
                </svg>
                <div className="chartTimes"><span>09:30</span><span>11:30</span><span>14:00</span><span>15:00</span></div>
              </div>
              <div className="chartFooter"><span><i className="linePrimary" />健康指数</span><span><i className="lineAverage" />均线</span><strong>数据源：Monitor + CLS</strong></div>
            </section>

            <aside className="watchlist" aria-label="服务观察列表">
              <header><div><p>WATCHLIST</p><h2>服务观察</h2></div><span>4 ITEMS</span></header>
              <div className="watchHead"><span>服务</span><span>最新</span><span>变化</span></div>
              {marketRows.map((row) => <div className="watchRow" key={row.name}>
                <span><i className={row.state === 'normal' ? 'statusUp' : 'statusDown'} />{row.name}</span>
                <strong>{row.value}</strong>
                <em className={row.state === 'normal' ? 'gain' : 'loss'}>{row.delta}</em>
              </div>)}
              <div className="marketDepth">
                <p><span>运行服务</span><strong>12</strong></p><p><span>活跃告警</span><strong className="loss">03</strong></p>
                <p><span>知识文档</span><strong>1,248</strong></p><p><span>今日诊断</span><strong>08</strong></p>
              </div>
            </aside>

            <div className="promptGrid">
              {[
                { index: '01', title: '检查当前系统告警', caption: '汇总当前活跃告警与影响范围' },
                { index: '02', title: '分析最近服务异常', caption: '关联日志与指标寻找异常信号' },
                { index: '03', title: '查询知识库方案', caption: '检索历史故障与处理手册' },
              ].map((item) => <button type="button" key={item.index} onClick={() => setQuestion(item.title)}>
                <span>{item.index}</span><strong>{item.title}</strong><small>{item.caption}</small><i aria-hidden="true">→</i>
              </button>)}
            </div>
          </div>}
          {messages.map((message, index) => <article className={`message ${message.role}`} key={`${message.role}-${index}`}>
            <span className="avatar">{message.role === 'user' ? 'YOU' : 'AI'}</span>
            <div><small>{message.role === 'user' ? 'OPERATOR' : 'ONECALL COPILOT'}</small><p>{message.content || (busy ? '正在分析遥测数据…' : '')}</p></div>
          </article>)}
        </div>
        <form className="composer" onSubmit={send}>
          <div className="composerHeader"><span><i /> ASK ONECALL</span><small>CONTEXT / LOCAL ENVIRONMENT</small></div>
          <textarea aria-label="输入排障问题" value={question} onKeyDown={handleComposerKeyDown}
            onChange={(event) => setQuestion(event.target.value)} placeholder="描述故障现象、告警信息或需要分析的服务…" />
          <div className="composerActions"><small>ENTER 发送 · SHIFT + ENTER 换行</small><button disabled={busy || !question.trim()}>{busy ? 'ANALYZING' : '发送指令'} <span>↗</span></button></div>
        </form>
      </section>}

      {view === 'aiops' && <section className="toolWorkspace">
        <div className="toolIntro"><span className="sectionNumber">01</span><div><p className="systemLabel"><i /> AUTOMATED RUNBOOK</p><h2>启动跨工具告警诊断</h2><p>OneCall 将调用本地 CLS 与 Monitor MCP，串联日志、指标和诊断步骤。</p></div><button className="primaryAction" disabled={busy} onClick={runDiagnosis}>{busy ? '诊断执行中…' : '开始诊断'} <span>→</span></button></div>
        <div className="integrationStrip"><span>DATA SOURCES</span><strong><i className="sourceDot neutral" /> CLS LOGS</strong><strong><i className="sourceDot orange" /> MONITOR METRICS</strong><em>2 / 2 CONNECTED</em></div>
        <div className="resultConsole" aria-live="polite">
          <header><span>DIAGNOSIS OUTPUT</span><small>{busy ? 'RUNNING' : diagnosis.length ? 'COMPLETED' : 'STANDBY'}</small></header>
          <div>{diagnosis.length ? diagnosis.map((text, index) => <p key={index}><span>{String(index + 1).padStart(2, '0')}</span>{text}</p>) : <div className="consoleEmpty"><i />等待诊断任务，执行结果将在此实时输出。</div>}</div>
        </div>
      </section>}

      {view === 'knowledge' && <section className="toolWorkspace">
        <div className="toolIntro"><span className="sectionNumber">01</span><div><p className="systemLabel"><i /> KNOWLEDGE INGESTION</p><h2>接入运维知识</h2><p>上传 Markdown 或 TXT 文档，自动切分内容并构建语义索引。</p></div></div>
        <form className="uploadZone" onSubmit={upload}>
          <label htmlFor="knowledge-file"><span className="uploadGlyph">↥</span><strong>选择知识文档</strong><small>支持 .md / .txt，单个文件不超过 10 MB</small></label>
          <input id="knowledge-file" name="file" type="file" accept=".md,.txt,text/markdown,text/plain" required />
          <button className="primaryAction" disabled={busy}>{busy ? '正在处理…' : '上传并建立索引'} <span>→</span></button>
        </form>
        <div className="knowledgeStatus" aria-live="polite"><span className={isHealthy ? 'okIcon' : 'warnIcon'}>{isHealthy ? '✓' : '!'}</span><div><strong>{isHealthy ? '向量索引已就绪' : '向量能力暂不可用'}</strong><p>{uploadStatus || (isHealthy ? '等待接入新的知识文档。' : '请先完成 pgvector 扩展安装与数据库迁移。')}</p></div></div>
      </section>}
    </section>
  </main>;
}
