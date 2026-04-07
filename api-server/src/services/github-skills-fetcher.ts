/**
 * GitHub Skills Fetcher
 * 从 GitHub 仓库抓取 skills
 */

interface GitHubFile {
  name: string;
  path: string;
  type: 'file' | 'dir';
  download_url: string | null;
  url: string;
}

interface SkillMetadata {
  name: string;
  description?: string;
  category?: string;
  icon?: string;
  version?: string;
  [key: string]: unknown;
}

interface FetchedSkill {
  source: string;
  repoUrl: string;
  skillSlug: string;
  name: string;
  description: string | null;
  category: string | null;
  skillContent: string;
  icon: string | null;
  version: string | null;
  metadata: Record<string, unknown>;
}

/**
 * 解析 SKILL.md 的 frontmatter
 */
function parseFrontmatter(content: string): { meta: SkillMetadata; body: string } {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return {
      meta: { name: 'Unknown' },
      body: content,
    };
  }

  const frontmatter = match[1] ?? '';
  const body = match[2] ?? '';
  const meta: SkillMetadata = { name: 'Unknown' };

  // 简单的 YAML 解析
  frontmatter.split('\n').forEach((line) => {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) return;

    const key = line.slice(0, colonIndex).trim();
    const value = line.slice(colonIndex + 1).trim();

    if (key && value) {
      meta[key] = value;
    }
  });

  return { meta, body };
}

/**
 * 从 GitHub 仓库获取 skills 列表
 */
export async function fetchSkillsFromRepo(
  owner: string,
  repo: string,
  skillsPath = 'skills'
): Promise<FetchedSkill[]> {
  const source = `${owner}/${repo}`;
  const repoUrl = `https://github.com/${owner}/${repo}`;
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${skillsPath}`;

  console.log(`[github-fetcher] Fetching skills from ${source}...`);

  try {
    // 获取 skills 目录列表
    const response = await fetch(apiUrl, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'Cherry-Agent-Skills-Fetcher',
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    const files = (await response.json()) as GitHubFile[];
    const skills: FetchedSkill[] = [];

    // 遍历每个 skill 目录
    for (const file of files) {
      if (file.type !== 'dir') continue;

      const skillSlug = file.name;
      const skillMdUrl = `https://raw.githubusercontent.com/${owner}/${repo}/main/${skillsPath}/${skillSlug}/SKILL.md`;

      try {
        // 获取 SKILL.md 内容
        const skillResponse = await fetch(skillMdUrl);
        if (!skillResponse.ok) {
          console.warn(`[github-fetcher] SKILL.md not found for ${skillSlug}`);
          continue;
        }

        const skillContent = await skillResponse.text();
        const { meta } = parseFrontmatter(skillContent);

        skills.push({
          source,
          repoUrl,
          skillSlug,
          name: meta.name || skillSlug,
          description: meta.description || null,
          category: meta.category || null,
          skillContent,
          icon: meta.icon || null,
          version: meta.version || '1.0.0',
          metadata: {
            githubUrl: `${repoUrl}/tree/main/${skillsPath}/${skillSlug}`,
          },
        });

        console.log(`[github-fetcher] ✓ Fetched skill: ${meta.name || skillSlug}`);
      } catch (error) {
        console.error(`[github-fetcher] Failed to fetch ${skillSlug}:`, error);
      }
    }

    console.log(`[github-fetcher] Fetched ${skills.length} skills from ${source}`);
    return skills;
  } catch (error) {
    console.error(`[github-fetcher] Failed to fetch from ${source}:`, error);
    throw error;
  }
}

/**
 * 从多个仓库批量抓取 skills
 */
export async function fetchSkillsFromMultipleRepos(
  repos: Array<{ owner: string; repo: string; skillsPath?: string }>
): Promise<FetchedSkill[]> {
  const allSkills: FetchedSkill[] = [];

  for (const { owner, repo, skillsPath } of repos) {
    try {
      const skills = await fetchSkillsFromRepo(owner, repo, skillsPath);
      allSkills.push(...skills);
    } catch (error) {
      console.error(`[github-fetcher] Failed to fetch from ${owner}/${repo}:`, error);
    }
  }

  return allSkills;
}

/**
 * 默认的 skills 仓库列表
 */
export const DEFAULT_SKILL_REPOS = [
  { owner: 'vercel-labs', repo: 'skills', skillsPath: 'skills' },
  { owner: 'anthropics', repo: 'anthropic-quickstarts', skillsPath: 'skills' },
];
