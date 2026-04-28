import React, { useMemo, Component, type ReactNode } from "react";
import type { Card } from "../api/types";

class RendererErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { error: boolean }
> {
  state = { error: false };

  static getDerivedStateFromError() {
    return { error: true };
  }

  render() {
    if (this.state.error) return this.props.fallback;
    return this.props.children;
  }
}

function MetadataFallback({ card }: { card: Card }) {
  const meta = useMemo(() => {
    try {
      const parsed = JSON.parse(card.metadata_json || "{}");
      if (Object.keys(parsed).length === 0) return null;
      return parsed;
    } catch {
      return null;
    }
  }, [card.metadata_json]);

  if (!meta) return null;

  return (
    <div className="mt-2 pt-2 border-t border-gray-100">
      <details>
        <summary className="cursor-pointer text-xs text-gray-400 hover:text-gray-600 select-none">
          metadata
        </summary>
        <pre className="mt-1 text-xs text-gray-600 whitespace-pre-wrap break-words font-mono max-h-40 overflow-auto">
          {JSON.stringify(meta, null, 2)}
        </pre>
      </details>
    </div>
  );
}

function CustomRendererInner({
  card,
  rendererJs,
  updateMetadata,
}: {
  card: Card;
  rendererJs: string;
  updateMetadata: (patch: object) => Promise<void>;
}) {
  const Component = useMemo(() => {
    try {
      // eslint-disable-next-line no-new-func
      const factory = new Function(
        "React",
        `${rendererJs}\nreturn typeof CardRenderer !== "undefined" ? CardRenderer : null;`
      );
      return factory(React) as React.ComponentType<{
        card: Card;
        updateMetadata: (patch: object) => Promise<void>;
      }> | null;
    } catch {
      return null;
    }
  }, [rendererJs]);

  if (!Component) return <MetadataFallback card={card} />;
  return <Component card={card} updateMetadata={updateMetadata} />;
}

export function CardContentRenderer({
  card,
  rendererJs,
  updateMetadata,
}: {
  card: Card;
  rendererJs?: string | null;
  updateMetadata: (patch: object) => Promise<void>;
}) {
  if (!rendererJs) return <MetadataFallback card={card} />;

  return (
    <RendererErrorBoundary fallback={<MetadataFallback card={card} />}>
      <CustomRendererInner card={card} rendererJs={rendererJs} updateMetadata={updateMetadata} />
    </RendererErrorBoundary>
  );
}
