/**
 * ImageViewer - 图片查看器组件
 * 包含缩略图网格和大图弹窗（支持下载、复制）
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ImageContent } from '@/ui/types';
import { cn } from '@/ui/lib/utils';
import { useTranslation } from 'react-i18next';

/** 缩略图尺寸 */
const THUMB_SIZE = 120;

interface ImageThumbnailGridProps {
  images: ImageContent[];
  className?: string;
}

/**
 * 将 base64 + mediaType 拼接为可用于 <img src> 的 data URL
 */
function toDataUrl(image: ImageContent): string {
  if (image.data.startsWith('data:')) return image.data;
  return `data:${image.mediaType};base64,${image.data}`;
}

/**
 * 图片缩略图网格
 * 正方形缩略图，object-fit: cover，水平排列
 */
export function ImageThumbnailGrid({ images, className }: ImageThumbnailGridProps) {
  const { t } = useTranslation();
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  if (!images || images.length === 0) return null;

  return (
    <>
      <div className={cn('flex flex-wrap gap-2 mt-2', className)}>
        {images.map((img, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => setViewerIndex(idx)}
            className="group/thumb relative overflow-hidden rounded-lg border border-ink-900/10 hover:border-accent/40 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent/40"
            style={{ width: THUMB_SIZE, height: THUMB_SIZE }}
            aria-label={t('chat.imageViewer.viewImage', '查看图片 {{index}}', { index: idx + 1 })}
          >
            <img
              src={toDataUrl(img)}
              alt={t('chat.imageViewer.imageAlt', '图片 {{index}}', { index: idx + 1 })}
              className="h-full w-full object-cover"
              loading="lazy"
            />
            {/* hover 遮罩 */}
            <div className="absolute inset-0 bg-black/0 group-hover/thumb:bg-black/20 transition-colors flex items-center justify-center">
              <svg
                viewBox="0 0 24 24"
                className="h-6 w-6 text-white opacity-0 group-hover/thumb:opacity-80 transition-opacity drop-shadow-md"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
                <path d="M11 8v6" />
                <path d="M8 11h6" />
              </svg>
            </div>
          </button>
        ))}
      </div>

      {/* 大图弹窗 */}
      {viewerIndex !== null && (
        <ImageLightbox
          images={images}
          currentIndex={viewerIndex}
          onClose={() => setViewerIndex(null)}
          onNavigate={setViewerIndex}
        />
      )}
    </>
  );
}

interface ImageLightboxProps {
  images: ImageContent[];
  currentIndex: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

/**
 * 大图弹窗
 * 支持导航、下载、复制、ESC 关闭
 */
function ImageLightbox({ images, currentIndex, onClose, onNavigate }: ImageLightboxProps) {
  const { t } = useTranslation();
  const image = images[currentIndex];
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < images.length - 1;

  /** ESC 关闭、左右箭头导航 */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && hasPrev) onNavigate(currentIndex - 1);
      if (e.key === 'ArrowRight' && hasNext) onNavigate(currentIndex + 1);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, onNavigate, currentIndex, hasPrev, hasNext]);

  /** 下载图片 */
  const handleDownload = useCallback(() => {
    const ext = image.mediaType.split('/')[1] || 'png';
    const filename = `image-${currentIndex + 1}.${ext}`;

    // 优先使用 Electron API
    if (window.electron?.shell) {
      const dataUrl = toDataUrl(image);
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = filename;
      link.click();
      return;
    }

    const link = document.createElement('a');
    link.href = toDataUrl(image);
    link.download = filename;
    link.click();
  }, [image, currentIndex]);

  /** 复制图片到剪贴板 */
  const handleCopy = useCallback(async () => {
    // Electron 环境：走主进程 nativeImage，避免渲染进程 ClipboardItem 权限限制
    if (window.electron?.clipboard?.writeImage) {
      await window.electron.clipboard.writeImage(image.data, image.mediaType);
      return;
    }
    // Web 环境降级：Clipboard API
    try {
      const dataUrl = toDataUrl(image);
      const response = await fetch(dataUrl);
      const blob = await response.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob }),
      ]);
    } catch {
      // 静默失败
    }
  }, [image]);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t('chat.imageViewer.title', '图片查看器')}
    >
      {/* 工具栏 */}
      <div
        className="absolute top-4 right-4 flex items-center gap-2 z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <LightboxButton
          onClick={handleCopy}
          label={t('chat.imageViewer.copy', '复制')}
          icon="copy"
        />
        <LightboxButton
          onClick={handleDownload}
          label={t('chat.imageViewer.download', '下载')}
          icon="download"
        />
        <LightboxButton
          onClick={onClose}
          label={t('chat.imageViewer.close', '关闭')}
          icon="close"
        />
      </div>

      {/* 图片计数 */}
      {images.length > 1 && (
        <div className="absolute top-4 left-4 text-white/80 text-sm font-medium bg-black/40 rounded-full px-3 py-1">
          {currentIndex + 1} / {images.length}
        </div>
      )}

      {/* 左侧导航 */}
      {hasPrev && (
        <button
          type="button"
          className="absolute left-4 top-1/2 -translate-y-1/2 h-10 w-10 flex items-center justify-center rounded-full bg-black/40 text-white/80 hover:bg-black/60 hover:text-white transition-colors"
          onClick={(e) => { e.stopPropagation(); onNavigate(currentIndex - 1); }}
          aria-label={t('chat.imageViewer.prev', '上一张')}
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
      )}

      {/* 右侧导航 */}
      {hasNext && (
        <button
          type="button"
          className="absolute right-4 top-1/2 -translate-y-1/2 h-10 w-10 flex items-center justify-center rounded-full bg-black/40 text-white/80 hover:bg-black/60 hover:text-white transition-colors"
          onClick={(e) => { e.stopPropagation(); onNavigate(currentIndex + 1); }}
          aria-label={t('chat.imageViewer.next', '下一张')}
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
      )}

      {/* 大图 */}
      <img
        src={toDataUrl(image)}
        alt={`图片 ${currentIndex + 1}`}
        className="max-h-[85vh] max-w-[90vw] object-contain rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

/** 弹窗工具栏按钮，支持点击后短暂显示成功状态 */
function LightboxButton({
  onClick,
  label,
  icon,
}: {
  onClick: () => void | Promise<void>;
  label: string;
  icon: 'copy' | 'download' | 'close';
}) {
  const [done, setDone] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleClick = async () => {
    await onClick();
    // close 按钮不需要成功反馈（弹窗直接关闭）
    if (icon === 'close') return;
    setDone(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setDone(false), 1500);
  };

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return (
    <button
      type="button"
      onClick={handleClick}
      className={[
        'h-9 w-9 flex items-center justify-center rounded-full transition-all duration-150',
        'active:scale-90',
        done
          ? 'bg-green-500/70 text-white'
          : 'bg-black/40 text-white/80 hover:bg-black/60 hover:text-white',
      ].join(' ')}
      title={label}
      aria-label={label}
    >
      {/* 成功状态统一显示勾 */}
      {done ? (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <>
          {icon === 'copy' && (
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
              <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
            </svg>
          )}
          {icon === 'download' && (
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" x2="12" y1="15" y2="3" />
            </svg>
          )}
          {icon === 'close' && (
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          )}
        </>
      )}
    </button>
  );
}
