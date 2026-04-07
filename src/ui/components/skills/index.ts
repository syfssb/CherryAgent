/**
 * Skills components barrel export file.
 * Import all skill components from a single location.
 *
 * @example
 * import { SkillCard, SkillEditor, SkillDetail } from "@/ui/components/skills"
 */

// SkillCard - 技能卡片组件
export { SkillCard, getSkillIcon } from './SkillCard';
export type { SkillCardProps } from './SkillCard';

// SkillEditor - 技能编辑器组件
export { SkillEditor } from './SkillEditor';
export type { SkillEditorProps } from './SkillEditor';

// SkillDetail - 技能详情组件
export { SkillDetail } from './SkillDetail';
export type { SkillDetailProps } from './SkillDetail';
