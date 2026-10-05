'use client';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { useEffect, useState } from 'react';
import { useViewer } from './ExploreShell.tsx';
function Photo({ src, alt }: { src: string; alt: string }) {
  const { token } = useViewer(); const [url, setUrl] = useState('');
  useEffect(() => { const controller = new AbortController(); let blobUrl = ''; setUrl('');
    void fetch(src, { headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: controller.signal }).then(async response => { if (!response.ok) throw new Error(); const blob = await response.blob(); if (!controller.signal.aborted) { blobUrl = URL.createObjectURL(blob); setUrl(blobUrl); } }).catch(() => {});
    return () => { controller.abort(); if (blobUrl) URL.revokeObjectURL(blobUrl); };
  }, [src, token]);
  return url ? <img src={url} alt={alt} className="my-5 max-h-[600px] max-w-full rounded-md border border-zinc-200" /> : <span className="text-sm text-zinc-500">사진을 불러올 수 없거나 불러오는 중입니다.</span>;
}
export default function MarkdownBody({ body }: { body: string }) {
  return <div className="markdown-body break-words text-sm leading-7 text-zinc-700"><Markdown skipHtml remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[[rehypeKatex, { trust: false, maxExpand: 1000 }]]} components={{
    a: ({ href, children }) => href && /^(https?:\/\/|#)/i.test(href) ? <a href={href} target={href.startsWith('#') ? undefined : '_blank'} rel="noopener noreferrer" className="underline">{children}</a> : <span>{children}</span>,
    img: ({ src, alt }) => typeof src === 'string' && /^\/api\/images\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(src) ? <Photo src={src} alt={alt || '기록 사진'} /> : <span>외부 사진은 표시하지 않습니다.</span>,
  }}>{body}</Markdown></div>;
}
