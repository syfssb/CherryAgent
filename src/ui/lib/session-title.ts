const MAX_TITLE_LENGTH = 48;

function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

export function buildFastSessionTitle(
  userInput: string | null | undefined,
  fallback = "New Session"
): string {
  if (!userInput) return fallback;

  const lines = userInput
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);

  if (lines.length === 0) return fallback;

  const baseTitle = lines[0];
  if (baseTitle.length <= MAX_TITLE_LENGTH) return baseTitle;
  return `${baseTitle.slice(0, MAX_TITLE_LENGTH).trim()}...`;
}

export const SESSION_TITLE_MAX_LENGTH = MAX_TITLE_LENGTH;
