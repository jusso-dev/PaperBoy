"use client";

import { useLayoutEffect, useRef } from "react";

type SandboxedHtmlPreviewProps = {
  html: string;
  title: string;
};

export function SandboxedHtmlPreview({ html, title }: SandboxedHtmlPreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useLayoutEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const write = () => {
      const doc = iframe.contentDocument;
      if (!doc) return false;
      doc.open();
      doc.write(html);
      doc.close();
      return true;
    };

    if (write()) return;

    const onLoad = () => {
      write();
    };
    iframe.addEventListener("load", onLoad);
    return () => iframe.removeEventListener("load", onLoad);
  }, [html]);

  return (
    <iframe
      ref={iframeRef}
      referrerPolicy="no-referrer"
      sandbox="allow-same-origin"
      src="about:blank"
      title={title}
    />
  );
}
