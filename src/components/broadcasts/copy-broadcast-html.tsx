"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

export function CopyBroadcastHtml({ html }: { html: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(html);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_500);
    } catch {
      setCopied(false);
    }
  }

  const Icon = copied ? Check : Copy;
  return (
    <button
      aria-label={copied ? "Broadcast HTML copied" : "Copy broadcast HTML"}
      onClick={() => void copy()}
      title={copied ? "Copied" : "Copy broadcast HTML"}
      type="button"
    >
      <Icon aria-hidden="true" strokeWidth={1.7} />
    </button>
  );
}
