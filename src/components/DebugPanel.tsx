import { useState, ReactNode } from 'react';

interface DebugPanelProps {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}

export function DebugPanel({ title, children, defaultOpen = true }: DebugPanelProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border border-surface-light rounded-lg overflow-hidden bg-surface/50">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 bg-surface hover:bg-surface-light transition-colors"
      >
        <span className="text-sm font-medium text-white">{title}</span>
        <span className="text-gray-400 text-xs">
          {isOpen ? '▼' : '▶'}
        </span>
      </button>
      {isOpen && (
        <div className="p-3 border-t border-surface-light">
          {children}
        </div>
      )}
    </div>
  );
}

interface JsonViewerProps {
  data: unknown;
  maxHeight?: string;
}

export function JsonViewer({ data, maxHeight = '200px' }: JsonViewerProps) {
  const [copied, setCopied] = useState(false);

  const jsonString = JSON.stringify(data, null, 2);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(jsonString);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="relative group">
      <pre
        className="text-xs text-gray-300 bg-background rounded p-2 overflow-auto font-mono"
        style={{ maxHeight }}
      >
        {jsonString}
      </pre>
      <button
        onClick={handleCopy}
        className="absolute top-1 right-1 px-2 py-1 text-xs bg-surface-light rounded opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-white"
      >
        {copied ? '✓ Copied' : 'Copy'}
      </button>
    </div>
  );
}
