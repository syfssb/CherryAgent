/**
 * Widget HTML 清理器 + iframe srcdoc 构建器
 *
 * 安全模型（三层纵深防御）：
 *
 * 1. **流式预览**（sanitizeForStreaming）：
 *    - 剥离危险嵌套标签（iframe/object/embed/form 等）
 *    - 剥离所有 on* 事件处理器
 *    - 剥离所有 <script> 标签
 *    - 过滤 javascript:/data: URL
 *
 * 2. **完成态渲染**（sanitizeForIframe）：
 *    - 仅剥离危险嵌套标签
 *    - 保留 script（在 sandbox 内安全执行）
 *    - 保留 on* 处理器（在 sandbox 内安全执行）
 *
 * 3. **iframe sandbox**（由 WidgetRenderer 设置）：
 *    - sandbox="allow-scripts"（无 allow-same-origin/allow-top-navigation/allow-popups）
 *    - CSP meta：script-src 限制为 CDN 白名单 + inline；connect-src 'none' 阻断网络请求
 *    - 链接拦截，通过 postMessage 转发给父页面
 *    - 高度通过 ResizeObserver + postMessage 同步
 */

// ── CDN 白名单 ───────────────────────────────────────────────────────────────

export const CDN_WHITELIST = [
  's4.zstatic.net',          // Zstatic（阿里云基建，国内首选）
  'cdn.jsdelivr.net',        // jsDelivr（有国内备案，备选）
  'cdnjs.cloudflare.com',    // Cloudflare CDNJS（国际兼容）
  'unpkg.com',               // npm 包直接使用
  'esm.sh',                  // ESM 模块构建
];

// ── HTML 清理 ─────────────────────────────────────────────────────────────────

const DANGEROUS_TAGS = /<(iframe|object|embed|meta|link|base|form)[\s>][\s\S]*?<\/\1>/gi;
const DANGEROUS_VOID = /<(iframe|object|embed|meta|link|base)\b[^>]*\/?>/gi;

/**
 * 流式预览清理：剥离所有危险标签、事件处理器、脚本、js/data URL
 * 用于流式传输阶段，widget 只做纯视觉展示，不执行任何脚本
 */
export function sanitizeForStreaming(html: string): string {
  return html
    .replace(DANGEROUS_TAGS, '')
    .replace(DANGEROUS_VOID, '')
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>"']*)/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<script\b[^>]*\/?>/gi, '')
    .replace(
      /\s+(href|src|action)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']*))/gi,
      (match, _attr: string, dq?: string, sq?: string, uq?: string) => {
        const url = (dq ?? sq ?? uq ?? '').trim();
        if (/^\s*(javascript|data)\s*:/i.test(url)) return '';
        return match;
      },
    );
}

/**
 * 完成态清理：仅剥离可能嵌套/逃逸 sandbox 的标签
 * 保留 script 和 on* 处理器，因为它们在 sandbox iframe 内安全执行
 */
export function sanitizeForIframe(html: string): string {
  return html
    .replace(DANGEROUS_TAGS, '')
    .replace(DANGEROUS_VOID, '');
}

// ── show-widget 围栏解析 ──────────────────────────────────────────────────────

/** Widget 数据结构 */
export interface ShowWidgetData {
  title?: string;
  widget_code: string;
}

/** 消息分段：文本或 widget */
export interface WidgetSegment {
  type: 'text' | 'widget';
  content?: string;       // type==='text' 时有值
  data?: ShowWidgetData;  // type==='widget' 时有值
}

/**
 * 解析消息中所有已闭合的 show-widget 围栏，返回交替的文本/widget 分段
 */
export function parseAllShowWidgets(text: string): WidgetSegment[] {
  const segments: WidgetSegment[] = [];
  const fenceRegex = /```show-widget\s*\n?([\s\S]*?)\n?\s*```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let foundAny = false;

  while ((match = fenceRegex.exec(text)) !== null) {
    foundAny = true;
    const before = text.slice(lastIndex, match.index).trim();
    if (before) segments.push({ type: 'text', content: before });

    try {
      const json = JSON.parse(match[1]);
      if (json.widget_code) {
        segments.push({
          type: 'widget',
          data: {
            title: json.title || undefined,
            widget_code: String(json.widget_code),
          },
        });
      }
    } catch { /* 跳过格式错误的 widget */ }

    lastIndex = match.index + match[0].length;
  }

  if (!foundAny) return [];

  const remaining = text.slice(lastIndex).trim();
  if (remaining) {
    segments.push({ type: 'text', content: remaining });
  }

  return segments;
}

/**
 * 计算 partial widget 的稳定 React key
 * 保证 streaming→persisted 转换时 key 一致，避免 React remount
 */
export function computePartialWidgetKey(content: string): string {
  const lastFenceStart = content.lastIndexOf('```show-widget');
  if (lastFenceStart === -1) return 'w-0';
  const beforePart = content.slice(0, lastFenceStart).trim();
  if (!beforePart || !/```show-widget/.test(beforePart)) {
    return `w-${beforePart ? 1 : 0}`;
  }
  const completedSegments = parseAllShowWidgets(beforePart);
  return `w-${completedSegments.length}`;
}

/**
 * 从未闭合的 show-widget 围栏中提取 partial widget_code
 * 用于流式阶段的实时预览
 */
export function extractPartialWidgetCode(fenceBody: string): {
  code: string | null;
  title?: string;
  scriptsTruncated: boolean;
} {
  // 先尝试完整 JSON parse
  try {
    const json = JSON.parse(fenceBody);
    if (json.widget_code) {
      return { code: String(json.widget_code), title: json.title, scriptsTruncated: false };
    }
  } catch { /* 预期：JSON 未完成 */ }

  // 手动提取（JSON 仍在流式传输）
  const keyIdx = fenceBody.indexOf('"widget_code"');
  if (keyIdx === -1) return { code: null, scriptsTruncated: false };

  const colonIdx = fenceBody.indexOf(':', keyIdx + 13);
  if (colonIdx === -1) return { code: null, scriptsTruncated: false };

  const quoteIdx = fenceBody.indexOf('"', colonIdx + 1);
  if (quoteIdx === -1) return { code: null, scriptsTruncated: false };

  let raw = fenceBody.slice(quoteIdx + 1);
  raw = raw.replace(/"\s*\}\s*$/, '');
  if (raw.endsWith('\\')) raw = raw.slice(0, -1);

  // 反转义 JSON 字符串
  const widgetCode = raw
    .replace(/\\\\/g, '\x00BS\x00')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\r/g, '\r')
    .replace(/\\"/g, '"')
    .replace(/\x00BS\x00/g, '\\');

  if (widgetCode.length < 10) return { code: null, scriptsTruncated: false };

  // 截断未闭合的 <script>（防止 JS 代码显示为文本）
  let code = widgetCode;
  let scriptsTruncated = false;
  const lastScript = code.lastIndexOf('<script');
  if (lastScript !== -1) {
    const afterScript = code.slice(lastScript);
    if (!/<script[\s\S]*?<\/script>/i.test(afterScript)) {
      code = code.slice(0, lastScript).trim() || null!;
      scriptsTruncated = true;
    }
  }

  const titleMatch = fenceBody.match(/"title"\s*:\s*"([^"]*?)"/);
  return { code, title: titleMatch?.[1], scriptsTruncated };
}

// ── Receiver iframe srcdoc ────────────────────────────────────────────────────

/**
 * 构建 receiver iframe 的完整 HTML 文档
 *
 * 这个 iframe 在 widget 的整个生命周期内保持存活。内容通过 postMessage 推送：
 * 1. 流式阶段（widget:update）：清理后的 HTML，无脚本执行
 * 2. 完成阶段（widget:finalize）：完整 HTML，分离 script 元素后执行
 *
 * 还负责：高度同步、链接拦截、主题更新、sendMessage 桥接
 */
export function buildReceiverSrcdoc(
  styleBlock: string,
  isDark: boolean,
): string {
  const cspDomains = CDN_WHITELIST.map(d => 'https://' + d).join(' ');
  const csp = [
    "default-src 'none'",
    `script-src 'unsafe-inline' ${cspDomains}`,
    "style-src 'unsafe-inline'",
    "img-src * data: blob:",
    "font-src * data:",
    "connect-src 'none'",
  ].join('; ');

  // receiver 脚本：处理 postMessage 通信
  const receiverScript = `(function(){
var root=document.getElementById('__root');
var _t=null,_first=true;
function _h(){
if(_t)clearTimeout(_t);
_t=setTimeout(function(){
var h=document.body.scrollHeight;
if(h>0)parent.postMessage({type:'widget:resize',height:h,first:_first},'*');
_first=false;
},60);
}
var _ro=new ResizeObserver(_h);
_ro.observe(document.body);

function applyHtml(html){
root.innerHTML=html;
_h();
}

function finalizeHtml(html){
var tmp=document.createElement('div');
tmp.innerHTML=html;
var ss=tmp.querySelectorAll('script');
var scripts=[];
for(var i=0;i<ss.length;i++){
scripts.push({src:ss[i].src||'',text:ss[i].textContent||'',attrs:[]});
for(var j=0;j<ss[i].attributes.length;j++){
var a=ss[i].attributes[j];
if(a.name!=='src')scripts[scripts.length-1].attrs.push({name:a.name,value:a.value});
}
ss[i].remove();
}
var visualHtml=tmp.innerHTML;
if(root.innerHTML!==visualHtml)root.innerHTML=visualHtml;
for(var i=0;i<scripts.length;i++){
var n=document.createElement('script');
if(scripts[i].src)n.src=scripts[i].src;
else if(scripts[i].text)n.textContent=scripts[i].text;
for(var j=0;j<scripts[i].attrs.length;j++)n.setAttribute(scripts[i].attrs[j].name,scripts[i].attrs[j].value);
root.appendChild(n);
}
_h();
}

window.addEventListener('message',function(e){
if(!e.data)return;
switch(e.data.type){
case 'widget:update':applyHtml(e.data.html);break;
case 'widget:finalize':finalizeHtml(e.data.html);setTimeout(_h,150);break;
case 'widget:theme':
var r=document.documentElement,v=e.data.vars;
if(v)for(var k in v)r.style.setProperty(k,v[k]);
if(typeof e.data.isDark==='boolean')r.className=e.data.isDark?'dark':'';
setTimeout(_h,100);
break;
case 'widget:export':
try{
var w=root.scrollWidth||root.offsetWidth||680;
var ht=root.scrollHeight||root.offsetHeight||400;
var cv=root.querySelector('canvas');
if(cv){
parent.postMessage({type:'widget:exportResult',format:'png',data:cv.toDataURL('image/png')},'*');
break;
}
var clone=root.cloneNode(true);
var styles=document.querySelectorAll('style');
var styleStr='';
for(var si=0;si<styles.length;si++)styleStr+=styles[si].outerHTML;
var htmlStr='<div xmlns="http://www.w3.org/1999/xhtml" style="width:'+w+'px">'+styleStr+clone.innerHTML+'</div>';
var svgWrap='<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+ht+'"><foreignObject width="100%" height="100%">'+htmlStr+'</foreignObject></svg>';
parent.postMessage({type:'widget:exportResult',format:'svg-full',data:svgWrap,width:w,height:ht},'*');
}catch(ex){parent.postMessage({type:'widget:exportResult',format:'none'},'*');}
break;
}
});

document.addEventListener('click',function(e){
var a=e.target&&e.target.closest?e.target.closest('a[href]'):null;
if(!a)return;var h=a.getAttribute('href');
if(!h||h.charAt(0)==='#')return;
e.preventDefault();
parent.postMessage({type:'widget:link',href:h},'*');
});

window.__widgetSendMessage=function(t){
if(typeof t!=='string'||t.length>500)return;
parent.postMessage({type:'widget:sendMessage',text:t},'*');
};

parent.postMessage({type:'widget:ready'},'*');
})();`;

  return `<!DOCTYPE html>
<html class="${isDark ? 'dark' : ''}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<style>
${styleBlock}
</style>
</head>
<body style="margin:0;padding:0;">
<div id="__root"></div>
<script>${receiverScript}</script>
</body>
</html>`;
}
