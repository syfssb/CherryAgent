import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { resolveThemeVars, getWidgetIframeStyleBlock } from '@/ui/lib/widget-css-bridge';
import {
  sanitizeForStreaming,
  sanitizeForIframe,
  buildReceiverSrcdoc,
} from '@/ui/lib/widget-sanitizer';
import { WidgetErrorBoundary } from './WidgetErrorBoundary';

interface WidgetRendererProps {
  widgetCode: string;
  isStreaming: boolean;
  title?: string;
  showOverlay?: boolean;
}

const MAX_IFRAME_HEIGHT = 2000;
const STREAM_DEBOUNCE = 120;
const CDN_PATTERN = /s4\.zstatic\.net|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com|esm\.sh/;

const _heightCache = new Map<string, number>();
function getHeightCacheKey(code: string): string {
  return code.slice(0, 200);
}

const ExpandIcon = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 1 1 1 1 6" /><line x1="1" y1="1" x2="6.5" y2="6.5" />
    <polyline points="10 15 15 15 15 10" /><line x1="15" y1="15" x2="9.5" y2="9.5" />
  </svg>
);

function WidgetRendererInner({
  widgetCode,
  isStreaming,
  title,
  showOverlay,
}: WidgetRendererProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSentRef = useRef<string>('');
  const [iframeReady, setIframeReady] = useState(false);
  const [iframeHeight, setIframeHeight] = useState(
    () => _heightCache.get(getHeightCacheKey(widgetCode)) || 0,
  );
  const [showCode, setShowCode] = useState(false);
  const [showFullscreen, setShowFullscreen] = useState(false);
  const [finalized, setFinalized] = useState(false);
  const finalizedRef = useRef(false);
  const hasReceivedFirstHeight = useRef(
    (_heightCache.get(getHeightCacheKey(widgetCode)) || 0) > 0,
  );
  const heightLockedRef = useRef(false);
  const widgetCodeRef = useRef(widgetCode);
  widgetCodeRef.current = widgetCode;

  const hasCDN = useMemo(() => CDN_PATTERN.test(widgetCode), [widgetCode]);

  const blobUrl = useMemo(() => {
    const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('theme-dark');
    const resolvedVars = resolveThemeVars();
    const styleBlock = getWidgetIframeStyleBlock(resolvedVars);
    const html = buildReceiverSrcdoc(styleBlock, isDark);
    return URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  }, []);

  const fullscreenBlobUrl = useMemo(() => {
    if (!showFullscreen) return '';
    const isDark = document.documentElement.classList.contains('theme-dark');
    const resolvedVars = resolveThemeVars();
    const styleBlock = getWidgetIframeStyleBlock(resolvedVars);
    const html = buildReceiverSrcdoc(styleBlock, isDark);
    return URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  }, [showFullscreen]);

  useEffect(() => () => URL.revokeObjectURL(blobUrl), [blobUrl]);

  const fullscreenIframeRef = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    if (!showFullscreen) return;
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === 'widget:ready' && fullscreenIframeRef.current && e.source === fullscreenIframeRef.current.contentWindow) {
        fullscreenIframeRef.current.contentWindow!.postMessage(
          { type: 'widget:finalize', html: sanitizeForIframe(widgetCode) }, '*',
        );
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [showFullscreen, widgetCode]);

  useEffect(() => {
    if (!showFullscreen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowFullscreen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showFullscreen]);

  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      if (!e.data || typeof e.data.type !== 'string') return;
      if (iframeRef.current && e.source !== iframeRef.current.contentWindow) return;

      switch (e.data.type) {
        case 'widget:ready':
          setIframeReady(true);
          break;
        case 'widget:resize':
          if (typeof e.data.height === 'number' && e.data.height > 0) {
            const newH = Math.min(e.data.height + 2, MAX_IFRAME_HEIGHT);
            const cacheKey = getHeightCacheKey(widgetCodeRef.current);
            if (heightLockedRef.current) {
              setIframeHeight((prev) => {
                const h = Math.max(prev, newH);
                _heightCache.set(cacheKey, h);
                return h;
              });
              break;
            }
            _heightCache.set(cacheKey, newH);
            if (!hasReceivedFirstHeight.current) {
              hasReceivedFirstHeight.current = true;
              const el = iframeRef.current;
              if (el) { el.style.transition = 'none'; void el.offsetHeight; }
              setIframeHeight(newH);
              requestAnimationFrame(() => { if (el) el.style.transition = 'height 0.3s ease-out'; });
            } else {
              setIframeHeight(newH);
            }
          }
          break;
        case 'widget:link': {
          const href = String(e.data.href || '');
          if (href && !/^\s*(javascript|data)\s*:/i.test(href)) {
            const api = (window as any).electronAPI;
            if (api?.openExternalUrl) api.openExternalUrl(href);
            else window.open(href, '_blank', 'noopener,noreferrer');
          }
          break;
        }
        case 'widget:sendMessage': {
          const text = String(e.data.text || '');
          const fn = (window as any).__widgetSendMessage;
          if (text && text.length <= 500 && typeof fn === 'function') fn(text);
          break;
        }
      }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const sendUpdate = useCallback((html: string) => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;
    if (html === lastSentRef.current) return;
    lastSentRef.current = html;
    iframe.contentWindow.postMessage({ type: 'widget:update', html }, '*');
  }, []);

  useEffect(() => {
    if (!isStreaming || !iframeReady) return;
    const sanitized = sanitizeForStreaming(widgetCode);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => sendUpdate(sanitized), STREAM_DEBOUNCE);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [widgetCode, isStreaming, iframeReady, sendUpdate]);

  useEffect(() => {
    if (isStreaming || !iframeReady || finalizedRef.current) return;
    const sanitized = sanitizeForIframe(widgetCode);
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;
    finalizedRef.current = true;
    lastSentRef.current = sanitized;
    heightLockedRef.current = true;
    iframe.contentWindow.postMessage({ type: 'widget:finalize', html: sanitized }, '*');
    setTimeout(() => { heightLockedRef.current = false; setFinalized(true); }, 400);
  }, [isStreaming, iframeReady, widgetCode]);

  useEffect(() => {
    if (!iframeReady) return;
    const observer = new MutationObserver(() => {
      const nowDark = document.documentElement.classList.contains('theme-dark');
      const vars = resolveThemeVars();
      iframeRef.current?.contentWindow?.postMessage({ type: 'widget:theme', vars, isDark: nowDark }, '*');
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, [iframeReady]);

  const showLoadingOverlay = hasCDN && !isStreaming && iframeReady && !finalized;
  const btnClass = 'opacity-0 group-hover/widget:opacity-100 transition-opacity text-[10px] px-1.5 py-0.5 rounded text-muted/50 hover:text-muted hover:bg-surface-secondary flex items-center gap-1';

  return (
    <>
      <div className="group/widget relative my-2">
        <iframe
          ref={iframeRef}
          sandbox="allow-scripts"
          src={blobUrl}
          title={title || 'Widget'}
          onLoad={() => setIframeReady(true)}
          style={{
            width: '100%', height: iframeHeight, border: 'none',
            display: showCode ? 'none' : 'block',
            overflow: 'hidden', colorScheme: 'auto', borderRadius: '12px',
          }}
        />

        {(showLoadingOverlay || showOverlay) && (
          <div className="absolute inset-0 pointer-events-none rounded-xl" style={{
            background: 'linear-gradient(90deg, transparent 0%, rgba(128,128,128,0.06) 50%, transparent 100%)',
            backgroundSize: '200% 100%', animation: 'shimmer 1.5s ease-in-out infinite',
          }} />
        )}

        {showCode && (
          <pre className="p-3 text-xs rounded-xl bg-surface-tertiary overflow-x-auto max-h-80 overflow-y-auto border border-ink-100">
            <code>{widgetCode}</code>
          </pre>
        )}

        {/* 工具栏 — hover 显示：放大 + 查看代码 */}
        <div className="absolute top-1 right-1 flex items-center gap-0.5">
          <button onClick={() => setShowFullscreen(true)} className={btnClass} title="放大查看">
            <ExpandIcon />
          </button>
          <button onClick={() => setShowCode(!showCode)} className={btnClass}>
            {showCode ? '隐藏代码' : '查看代码'}
          </button>
        </div>
      </div>

      {/* 全屏弹窗 */}
      {showFullscreen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowFullscreen(false); }}
        >
          <div className="relative w-[90vw] h-[85vh] bg-surface rounded-2xl overflow-hidden" style={{ boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}>
            <iframe
              ref={fullscreenIframeRef}
              sandbox="allow-scripts"
              src={fullscreenBlobUrl}
              title={`${title || 'Widget'} (fullscreen)`}
              style={{ width: '100%', height: '100%', border: 'none' }}
            />
            <button
              onClick={() => setShowFullscreen(false)}
              className="absolute top-3 right-3 w-8 h-8 rounded-lg bg-surface-secondary hover:bg-surface-tertiary text-ink-700 flex items-center justify-center transition-colors text-lg"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export function WidgetRenderer(props: WidgetRendererProps) {
  return (
    <WidgetErrorBoundary>
      <WidgetRendererInner {...props} />
    </WidgetErrorBoundary>
  );
}
