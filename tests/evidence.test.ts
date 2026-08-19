import { describe, expect, it } from 'vitest';
import { appendEvidenceSection, extractEvidenceIds, validateEvidenceCitations } from '../src/services/evidenceService.js';

describe('evidence utilities', () => {
  it('extracts unique evidence ids from tool output', () => {
    expect(extractEvidenceIds('证据ID: abc (RRF: 0.1)\n证据ID: abc\n证据ID: def')).toEqual(['abc', 'def']);
  });

  it('appends a citation section only when evidence exists', () => {
    expect(appendEvidenceSection('## 结论\n数据库异常。', '证据ID: abc')).toContain('- abc');
    expect(appendEvidenceSection('## 结论', '没有证据')).toBe('## 结论');
  });

  it('flags citations that are not present in execution evidence', () => {
    const report = '## 结论\n故障已确认。\n\n## 证据引用\n- known\n- fabricated';
    const validated = validateEvidenceCitations(report, '证据ID: known');
    expect(validated).toContain('引用校验');
    expect(validated).toContain('fabricated');
  });
});
