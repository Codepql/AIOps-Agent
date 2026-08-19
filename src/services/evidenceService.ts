const evidenceIdPattern = /证据ID:\s*([^\s(\n]+)/g;
const citationSectionPattern = /## 证据引用\s*([\s\S]*?)(?=\n## |$)/;

export function extractEvidenceIds(text: string): string[] {
  return [...new Set([...text.matchAll(evidenceIdPattern)].map((match) => match[1]).filter((id): id is string => Boolean(id)))];
}

export function appendEvidenceSection(report: string, sourceText: string): string {
  const ids = extractEvidenceIds(sourceText);
  if (!ids.length || report.includes('## 证据引用')) return report;
  return `${report.trimEnd()}\n\n## 证据引用\n${ids.map((id) => `- ${id}`).join('\n')}`;
}

export function validateEvidenceCitations(report: string, sourceText: string): string {
  const section = citationSectionPattern.exec(report)?.[1] ?? '';
  if (!section.trim()) return report;
  const available = new Set(extractEvidenceIds(sourceText));
  const cited = [...section.matchAll(/-\s*([^\s(\n]+)/g)].map((match) => match[1]).filter((id): id is string => Boolean(id));
  const unsupported = [...new Set(cited.filter((id) => !available.has(id)))];
  if (!unsupported.length || report.includes('引用校验')) return report;
  return `${report.trimEnd()}\n\n> ⚠️ 引用校验：以下证据 ID 未在工具执行记录中找到，不能作为已验证事实：${unsupported.join(', ')}`;
}
