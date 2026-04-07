export function shouldLoadSkillsPlugin(contextInjection?: {
  skillContext?: string;
  fullSkillContext?: string;
}): boolean {
  return Boolean(
    contextInjection?.skillContext?.trim() ||
    contextInjection?.fullSkillContext?.trim(),
  );
}
