export function filterVisibleWorkingFiles(
  files: { path: string; timestamp: number }[],
  deletedPaths: Map<string, number>,
) {
  return files.filter((file) => {
    const deletedAt = deletedPaths.get(file.path);
    return deletedAt === undefined || file.timestamp > deletedAt;
  });
}
