import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const mockUseProgressSteps = vi.fn();
const mockUseAppStore = vi.fn();

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next');
  return {
    ...actual,
    useTranslation: () => ({
      t: (_key: string, fallback?: string) => fallback ?? _key,
    }),
  };
});

vi.mock('@/ui/hooks/useProgressSteps', () => ({
  useProgressSteps: () => mockUseProgressSteps(),
}));

vi.mock('@/ui/store/useAppStore', () => ({
  useAppStore: (selector: (state: { activeSessionId: string | null }) => unknown) =>
    selector(mockUseAppStore()),
}));

import { ProgressSection } from './ProgressSection';

describe('ProgressSection', () => {
  beforeEach(() => {
    mockUseProgressSteps.mockReset();
    mockUseAppStore.mockReset();
    mockUseAppStore.mockReturnValue({ activeSessionId: 'session-1' });
  });

  afterEach(() => {
    cleanup();
  });

  it('在运行中且无步骤时显示规划 loading 态', () => {
    mockUseProgressSteps.mockReturnValue({ steps: [], isRunning: true });

    render(<ProgressSection />);

    expect(screen.getByText('进度')).toBeInTheDocument();
    expect(screen.getByText('AI正在规划任务步骤...')).toBeInTheDocument();
  });

  it('在无步骤且未运行时不显示', () => {
    mockUseProgressSteps.mockReturnValue({ steps: [], isRunning: false });

    const { container } = render(<ProgressSection />);

    expect(container.firstChild).toBeNull();
  });

  it('有步骤时显示数量徽标与步骤内容', () => {
    mockUseProgressSteps.mockReturnValue({
      isRunning: false,
      steps: [
        { id: 1, label: '分析需求', status: 'completed' },
        { id: 2, label: '生成文件', status: 'active' },
      ],
    });

    render(<ProgressSection />);

    expect(screen.getByText('进度')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('分析需求')).toBeInTheDocument();
    expect(screen.getByText('生成文件')).toBeInTheDocument();
  });

  it('可以折叠和展开内容', () => {
    mockUseProgressSteps.mockReturnValue({
      isRunning: true,
      steps: [{ id: 1, label: '分析需求', status: 'active' }],
    });

    render(<ProgressSection />);
    expect(screen.getByText('分析需求')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button'));
    expect(screen.queryByText('分析需求')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('分析需求')).toBeInTheDocument();
  });

  it('任务开始运行时会自动展开', () => {
    mockUseProgressSteps.mockReturnValue({
      isRunning: false,
      steps: [{ id: 1, label: '分析需求', status: 'active' }],
    });

    const { rerender } = render(<ProgressSection />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.queryByText('分析需求')).not.toBeInTheDocument();

    mockUseProgressSteps.mockReturnValue({
      isRunning: true,
      steps: [{ id: 1, label: '分析需求', status: 'active' }],
    });
    rerender(<ProgressSection />);

    expect(screen.getByText('分析需求')).toBeInTheDocument();
  });

  it('同一会话开始新一轮任务时不会残留上一轮步骤', () => {
    mockUseProgressSteps.mockReturnValue({
      isRunning: false,
      steps: [{ id: 1, label: '上一轮步骤', status: 'completed' }],
    });

    const { rerender } = render(<ProgressSection />);
    expect(screen.getByText('上一轮步骤')).toBeInTheDocument();

    mockUseProgressSteps.mockReturnValue({
      isRunning: true,
      steps: [],
    });
    rerender(<ProgressSection />);

    expect(screen.queryByText('上一轮步骤')).not.toBeInTheDocument();
    expect(screen.getByText('AI正在规划任务步骤...')).toBeInTheDocument();
  });
});
