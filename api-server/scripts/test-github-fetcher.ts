/**
 * 测试 GitHub Skills Fetcher
 */
import { fetchSkillsFromRepo, DEFAULT_SKILL_REPOS } from '../src/services/github-skills-fetcher.js';

async function main() {
  console.log('[test] 开始测试 GitHub Skills Fetcher...\n');

  // 测试从 vercel-labs/skills 抓取
  console.log('[test] 测试从 vercel-labs/skills 抓取...');
  const skills = await fetchSkillsFromRepo('vercel-labs', 'skills', 'skills');

  console.log(`\n[test] ✓ 成功抓取 ${skills.length} 个 skills\n`);

  // 显示前 5 个 skills
  console.log('[test] 前 5 个 skills:');
  skills.slice(0, 5).forEach((skill, index) => {
    console.log(`\n${index + 1}. ${skill.name}`);
    console.log(`   Slug: ${skill.skillSlug}`);
    console.log(`   Description: ${skill.description || 'N/A'}`);
    console.log(`   Category: ${skill.category || 'N/A'}`);
    console.log(`   Version: ${skill.version}`);
  });
}

main().catch((error) => {
  console.error('[test] 测试失败:', error);
  process.exit(1);
});
