import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRouter, type Route } from '../useRouter';

describe('useRouter', () => {
  const originalPushState = window.history.pushState;
  const originalReplaceState = window.history.replaceState;
  const originalLocation = window.location;

  beforeEach(() => {
    // Mock history API
    window.history.pushState = vi.fn();
    window.history.replaceState = vi.fn();

    // Reset location
    delete (window as any).location;
    window.location = { ...originalLocation, pathname: '/' } as Location;
  });

  afterEach(() => {
    window.history.pushState = originalPushState;
    window.history.replaceState = originalReplaceState;
    window.location = originalLocation;
  });

  it('should initialize with /chat as default route', () => {
    const { result } = renderHook(() => useRouter());
    expect(result.current.currentRoute).toBe('/chat');
  });

  it('should navigate to a valid route', () => {
    const { result } = renderHook(() => useRouter());

    act(() => {
      result.current.navigate('/usage');
    });

    expect(result.current.currentRoute).toBe('/usage');
    expect(window.history.pushState).toHaveBeenCalledWith(null, '', '/usage');
  });

  it('should support all required routes', () => {
    const { result } = renderHook(() => useRouter());
    const routes: Route[] = ['/chat', '/usage', '/memory', '/skills', '/settings'];

    routes.forEach((route) => {
      act(() => {
        result.current.navigate(route);
      });
      expect(result.current.currentRoute).toBe(route);
    });
  });

  it('should fallback to /chat for invalid routes', () => {
    const { result } = renderHook(() => useRouter());

    act(() => {
      result.current.navigate('/invalid' as Route);
    });

    expect(result.current.currentRoute).toBe('/chat');
  });

  it('should handle browser back/forward navigation', () => {
    const { result } = renderHook(() => useRouter());

    act(() => {
      result.current.navigate('/usage');
    });

    expect(result.current.currentRoute).toBe('/usage');

    // Simulate browser back button
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
    });

    // Should update route based on location
    expect(result.current.currentRoute).toBe('/chat');
  });

  it('should initialize from current URL pathname', () => {
    delete (window as any).location;
    window.location = { ...originalLocation, pathname: '/memory' } as Location;

    const { result } = renderHook(() => useRouter());
    expect(result.current.currentRoute).toBe('/memory');
  });

  it('should not push duplicate routes to history', () => {
    const { result } = renderHook(() => useRouter());

    act(() => {
      result.current.navigate('/usage');
    });

    const pushCallCount = (window.history.pushState as any).mock.calls.length;

    act(() => {
      result.current.navigate('/usage');
    });

    // Should not push again if already on the same route
    expect((window.history.pushState as any).mock.calls.length).toBe(pushCallCount);
  });

  it('should clean up popstate listener on unmount', () => {
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

    const { unmount } = renderHook(() => useRouter());

    expect(addEventListenerSpy).toHaveBeenCalledWith('popstate', expect.any(Function));

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith('popstate', expect.any(Function));

    addEventListenerSpy.mockRestore();
    removeEventListenerSpy.mockRestore();
  });
});
