import React from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import { rehypeHighlightLanguages } from "@/ui/lib/rehype-highlight-languages";

const remarkPluginsConfig = [remarkGfm];
const rehypePluginsConfig = [[rehypeHighlight, { languages: rehypeHighlightLanguages }]] as any;

const markdownComponents = {
  h1: (props: React.HTMLAttributes<HTMLHeadingElement>) => <h1 className="mt-4 text-xl font-semibold text-ink-900" {...props} />,
  h2: (props: React.HTMLAttributes<HTMLHeadingElement>) => <h2 className="mt-4 text-lg font-semibold text-ink-900" {...props} />,
  h3: (props: React.HTMLAttributes<HTMLHeadingElement>) => <h3 className="mt-3 text-base font-semibold text-ink-800" {...props} />,
  p: (props: React.HTMLAttributes<HTMLParagraphElement>) => <p className="mt-2 text-base leading-relaxed text-ink-700 break-words [overflow-wrap:anywhere]" {...props} />,
  ul: (props: React.HTMLAttributes<HTMLUListElement>) => <ul className="mt-2 ml-4 grid list-disc gap-1" {...props} />,
  ol: (props: React.HTMLAttributes<HTMLOListElement>) => <ol className="mt-2 ml-4 grid list-decimal gap-1" {...props} />,
  li: (props: React.HTMLAttributes<HTMLLIElement>) => <li className="min-w-0 text-ink-700" {...props} />,
  strong: (props: React.HTMLAttributes<HTMLElement>) => <strong className="text-ink-900 font-semibold" {...props} />,
  em: (props: React.HTMLAttributes<HTMLElement>) => <em className="text-ink-800" {...props} />,
  pre: (props: React.HTMLAttributes<HTMLPreElement>) => (
    <pre
      className="mt-3 max-w-full max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-xl bg-surface-tertiary p-3 text-sm text-ink-700"
      {...props}
    />
  ),
  img: ({ src, alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => (
    <img
      src={src}
      alt={alt ?? ''}
      loading="lazy"
      className="max-w-full h-auto rounded-lg"
      {...props}
    />
  ),
  code: (props: React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode }) => {
    const { children, className, ...rest } = props;
    const match = /language-(\w+)/.exec(className || "");
    const isInline = !match && !String(children).includes("\n");

    return isInline ? (
      <code className="inline-block max-w-full align-middle rounded bg-surface-tertiary px-1.5 py-0.5 text-accent font-mono text-base whitespace-pre-wrap break-words [overflow-wrap:anywhere]" {...rest}>
        {children}
      </code>
    ) : (
      <code className={`${className} font-mono`} {...rest}>
        {children}
      </code>
    );
  }
};

export default function MDContent({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={remarkPluginsConfig}
      rehypePlugins={rehypePluginsConfig}
      components={markdownComponents}
    >
      {String(text ?? "")}
    </ReactMarkdown>
  )
}
