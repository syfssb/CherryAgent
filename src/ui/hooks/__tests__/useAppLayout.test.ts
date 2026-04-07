import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useAppLayout } from '../useAppLayout';

function resizeWindow(width: number) {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: width,
  });
  window.dispatchEvent(new Event('resize'));
}

describe('useAppLayout', () => {
  beforeEach(() => {
    resizeWindow(1400);
  });

  afterEach(() => {
    resizeWindow(1400);
  });

  it('allows reopening the work panel in overlay mode on narrow screens', () => {
    const { result } = renderHook(() => useAppLayout('/tmp/workspace', 'session-1'));

    expect(result.current.fileExplorerCollapsed).toBe(false);
    expect(result.current.fileExplorerWidth).toBeGreaterThan(0);

    act(() => {
      resizeWindow(900);
    });

    expect(result.current.layout.autoCollapseFileExplorer).toBe(true);
    expect(result.current.fileExplorerCollapsed).toBe(true);
    expect(result.current.fileExplorerWidth).toBe(0);

    act(() => {
      result.current.setFileExplorerCollapsed(false);
    });

    expect(result.current.fileExplorerCollapsed).toBe(false);
    expect(result.current.fileExplorerWidth).toBe(0);
  });
});
