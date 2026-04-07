/**
 * Skill Validator - 技能内容验证器
 *
 * 功能:
 * - 验证技能内容的基本语法
 * - 解析技能元数据
 * - 返回验证结果和警告
 */

/**
 * 验证结果类型
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * 技能元数据
 */
export interface SkillMetadata {
  title?: string;
  description?: string;
  author?: string;
  version?: string;
  tags?: string[];
  variables?: SkillVariable[];
}

/**
 * 技能变量定义
 */
export interface SkillVariable {
  name: string;
  type: "text" | "number" | "select" | "boolean";
  description?: string;
  required?: boolean;
  default?: string | number | boolean;
  options?: string[]; // 用于 select 类型
}

/**
 * 元数据块正则表达式
 */
const METADATA_BLOCK_REGEX = /^---\s*\n([\s\S]*?)\n---\s*\n?/;

/**
 * 变量占位符正则表达式
 */
const VARIABLE_PLACEHOLDER_REGEX = /\{\{(\w+)\}\}/g;

/**
 * 保留的变量名
 */
const RESERVED_VARIABLES = new Set([
  "input",
  "context",
  "memory",
  "user",
  "assistant",
  "system"
]);

/**
 * 验证技能内容语法
 */
export function validateSyntax(content: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 检查内容是否为空
  if (!content || content.trim().length === 0) {
    errors.push("Skill content cannot be empty");
    return { valid: false, errors, warnings };
  }

  // 检查内容最小长度
  if (content.trim().length < 10) {
    errors.push("Skill content is too short (minimum 10 characters)");
  }

  // 检查内容最大长度
  const MAX_CONTENT_LENGTH = 50000;
  if (content.length > MAX_CONTENT_LENGTH) {
    errors.push(`Skill content exceeds maximum length of ${MAX_CONTENT_LENGTH} characters`);
  }

  // 检查元数据块格式
  const hasMetadata = content.startsWith("---");
  if (hasMetadata) {
    const metadataMatch = content.match(METADATA_BLOCK_REGEX);
    if (!metadataMatch) {
      errors.push("Invalid metadata block format. Expected: ---\\n...\\n---");
    } else {
      // 验证元数据内容
      const metadataContent = metadataMatch[1];
      const metadataValidation = validateMetadataBlock(metadataContent);
      errors.push(...metadataValidation.errors);
      warnings.push(...metadataValidation.warnings);
    }
  }

  // 检查变量占位符
  const variableValidation = validateVariables(content);
  errors.push(...variableValidation.errors);
  warnings.push(...variableValidation.warnings);

  // 检查潜在的注入问题
  const securityValidation = validateSecurity(content);
  errors.push(...securityValidation.errors);
  warnings.push(...securityValidation.warnings);

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * 验证元数据块内容
 */
function validateMetadataBlock(metadataContent: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const lines = metadataContent.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === "") continue;

    // 检查基本的键值对格式
    if (!line.includes(":")) {
      errors.push(`Invalid metadata at line ${i + 1}: missing colon separator`);
      continue;
    }

    const colonIndex = line.indexOf(":");
    const key = line.substring(0, colonIndex).trim();
    const value = line.substring(colonIndex + 1).trim();

    // 检查空键
    if (key === "") {
      errors.push(`Invalid metadata at line ${i + 1}: empty key`);
    }

    // 检查键名格式
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
      warnings.push(`Metadata key "${key}" contains special characters`);
    }

    // 检查已知字段的值
    if (key === "version" && value) {
      if (!/^\d+(\.\d+)*(-[a-zA-Z0-9]+)?$/.test(value)) {
        warnings.push(`Version "${value}" does not follow semantic versioning`);
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * 验证变量占位符
 */
function validateVariables(content: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const matches = content.matchAll(VARIABLE_PLACEHOLDER_REGEX);
  const seenVariables = new Set<string>();

  for (const match of matches) {
    const variableName = match[1];

    // 检查保留变量名
    if (RESERVED_VARIABLES.has(variableName.toLowerCase())) {
      warnings.push(`Variable "{{${variableName}}}" uses a reserved name`);
    }

    // 检查变量名格式
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(variableName)) {
      errors.push(`Invalid variable name: "{{${variableName}}}"`);
    }

    // 检查重复变量（仅用于警告）
    if (seenVariables.has(variableName)) {
      // 重复使用同一变量是正常的，不需要警告
    }
    seenVariables.add(variableName);
  }

  // 检查未闭合的变量占位符
  // 仅在出现 "{{" 时才严格校验数量，避免把 JSON 等普通文本里的 "}}" 误判为占位符错误。
  const unbalancedOpen = (content.match(/\{\{/g) || []).length;
  const unbalancedClose = (content.match(/\}\}/g) || []).length;
  if (unbalancedOpen > 0 && unbalancedOpen !== unbalancedClose) {
    errors.push("Unbalanced variable placeholders: mismatched {{ and }}");
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * 安全验证
 */
function validateSecurity(content: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 检查可能的 prompt injection 模式
  const suspiciousPatterns = [
    { pattern: /ignore\s+(all\s+)?previous\s+instructions?/i, message: "Potential prompt injection: 'ignore previous instructions'" },
    { pattern: /disregard\s+(all\s+)?previous/i, message: "Potential prompt injection: 'disregard previous'" },
    { pattern: /system\s*:\s*you\s+are\s+now/i, message: "Potential prompt injection: system override attempt" }
  ];

  for (const { pattern, message } of suspiciousPatterns) {
    if (pattern.test(content)) {
      warnings.push(message);
    }
  }

  // 检查过长的连续字符串（可能是 token 注入尝试）
  if (/[a-zA-Z]{1000,}/.test(content)) {
    warnings.push("Content contains very long continuous strings");
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * 解析技能元数据
 */
export function parseSkillMetadata(content: string): SkillMetadata | null {
  if (!content.startsWith("---")) {
    return null;
  }

  const match = content.match(METADATA_BLOCK_REGEX);
  if (!match) {
    return null;
  }

  const metadataContent = match[1];
  const metadata: SkillMetadata = {};

  const lines = metadataContent.split("\n");
  let currentKey: string | null = null;
  let currentValue: string[] = [];
  let inMultiline = false;

  for (const line of lines) {
    const trimmedLine = line.trim();

    // 处理多行值
    if (inMultiline) {
      if (/^[a-zA-Z_][a-zA-Z0-9_]*:/.test(trimmedLine)) {
        // 遇到新的键，保存之前的多行值
        if (currentKey) {
          setMetadataValue(metadata, currentKey, currentValue.join("\n").trim());
        }
        inMultiline = false;
      } else {
        currentValue.push(line);
        continue;
      }
    }

    if (trimmedLine === "" && !inMultiline) continue;

    const colonIndex = trimmedLine.indexOf(":");
    if (colonIndex === -1) continue;

    currentKey = trimmedLine.substring(0, colonIndex).trim().toLowerCase();
    const value = trimmedLine.substring(colonIndex + 1).trim();

    // 检查是否是多行值开始
    if (value === "" || value === "|" || value === ">") {
      inMultiline = true;
      currentValue = [];
      continue;
    }

    setMetadataValue(metadata, currentKey, value);
  }

  // 保存最后的多行值
  if (inMultiline && currentKey) {
    setMetadataValue(metadata, currentKey, currentValue.join("\n").trim());
  }

  return metadata;
}

/**
 * 设置元数据值
 */
function setMetadataValue(metadata: SkillMetadata, key: string, value: string): void {
  switch (key) {
    case "title":
      metadata.title = value;
      break;
    case "description":
      metadata.description = value;
      break;
    case "author":
      metadata.author = value;
      break;
    case "version":
      metadata.version = value;
      break;
    case "tags":
      // 解析标签列表
      metadata.tags = value
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
      break;
  }
}

/**
 * 获取技能内容（不含元数据）
 */
export function getSkillBody(content: string): string {
  if (!content.startsWith("---")) {
    return content;
  }

  const match = content.match(METADATA_BLOCK_REGEX);
  if (!match) {
    return content;
  }

  return content.substring(match[0].length).trim();
}

/**
 * 提取技能中使用的变量
 */
export function extractVariables(content: string): string[] {
  const variables = new Set<string>();
  const matches = content.matchAll(VARIABLE_PLACEHOLDER_REGEX);

  for (const match of matches) {
    variables.add(match[1]);
  }

  return Array.from(variables);
}

/**
 * 替换技能中的变量
 */
export function replaceVariables(
  content: string,
  variables: Record<string, string | number | boolean>
): string {
  return content.replace(VARIABLE_PLACEHOLDER_REGEX, (match, variableName) => {
    if (variableName in variables) {
      return String(variables[variableName]);
    }
    return match; // 保留未找到的变量占位符
  });
}

/**
 * 验证技能并返回完整报告
 */
export function validateSkill(content: string): {
  validation: ValidationResult;
  metadata: SkillMetadata | null;
  body: string;
  variables: string[];
} {
  return {
    validation: validateSyntax(content),
    metadata: parseSkillMetadata(content),
    body: getSkillBody(content),
    variables: extractVariables(content)
  };
}

export default {
  validateSyntax,
  parseSkillMetadata,
  getSkillBody,
  extractVariables,
  replaceVariables,
  validateSkill
};
