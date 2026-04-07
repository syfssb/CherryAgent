import { describe, expect, it } from 'vitest';
import { filterVisibleWorkingFiles } from './utils';

describe('filterVisibleWorkingFiles', () => {
  it('shows a file again when the same path is rewritten after being cleared', () => {
    const files = [
      { path: '/tmp/script.ts', timestamp: 300 },
    ];
    const deletedPaths = new Map<string, number>([
      ['/tmp/script.ts', 200],
    ]);

    expect(filterVisibleWorkingFiles(files, deletedPaths)).toEqual(files);
  });

  it('keeps hiding the older generation of a deleted file', () => {
    const files = [
      { path: '/tmp/script.ts', timestamp: 150 },
    ];
    const deletedPaths = new Map<string, number>([
      ['/tmp/script.ts', 200],
    ]);

    expect(filterVisibleWorkingFiles(files, deletedPaths)).toEqual([]);
  });
});
