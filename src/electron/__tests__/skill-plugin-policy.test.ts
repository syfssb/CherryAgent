import { describe, expect, it } from 'vitest';
import { shouldLoadSkillsPlugin } from '../libs/skill-plugin-policy.js';

describe('shouldLoadSkillsPlugin', () => {
  it('manual + 空技能上下文时返回 false', () => {
    expect(shouldLoadSkillsPlugin({ skillContext: '', fullSkillContext: '' })).toBe(false);
    expect(shouldLoadSkillsPlugin({ skillContext: '   ', fullSkillContext: undefined })).toBe(false);
    expect(shouldLoadSkillsPlugin(undefined)).toBe(false);
  });

  it('存在技能摘要时返回 true', () => {
    expect(shouldLoadSkillsPlugin({ skillContext: '- **pptx**: export slides' })).toBe(true);
  });

  it('存在完整技能内容时返回 true', () => {
    expect(shouldLoadSkillsPlugin({ fullSkillContext: '# Available Skills\n\n## pptx' })).toBe(true);
  });
});
