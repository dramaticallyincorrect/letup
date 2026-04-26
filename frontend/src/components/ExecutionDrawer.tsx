import { useEffect, useRef, useState } from "react";
import type { ExecutionStatus, LogLine } from "../api/types";

function StatusBadge({ status }: { status: ExecutionStatus }) {
  const styles: Record<ExecutionStatus, string> = {
    pending: "bg-yellow-100 text-yellow-700",
    running: "bg-blue-100 text-blue-700",
    success: "bg-green-100 text-green-700",
    failed: "bg-red-100 text-red-700",
  };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${styles[status]}`}>
      {status}
    </span>
  );
}

function LogEntry({ log }: { log: LogLine }) {
  const color =
    log.stream === "stderr"
      ? "text-red-400"
      : log.stream === "agent"
      ? "text-indigo-400"
      : "text-gray-300";
  return (
    <div className={`font-mono text-xs leading-5 ${color} whitespace-pre-wrap break-all`}>
      {log.text}
    </div>
  );
}

export function ExecutionDrawer({
  executionId,
  onClose,
}: {
  executionId: string;
  onClose: () => void;
}) {
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [status, setStatus] = useState<ExecutionStatus>("pending");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLogs([]);
    setStatus("pending");

    const source = new EventSource(`/api/executions/${executionId}/logs`);

    source.addEventListener("log", (e) => {
      const log: LogLine = JSON.parse(e.data);
      setLogs((prev) => [...prev, log]);
    });

    source.addEventListener("done", (e) => {
      const { status: finalStatus } = JSON.parse(e.data) as { status: ExecutionStatus };
      setStatus(finalStatus);
      source.close();
    });

    source.onerror = () => {
      setStatus("failed");
      source.close();
    };

    return () => source.close();
  }, [executionId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 flex justify-center pb-4 px-4 pointer-events-none">
      <div className="w-full max-w-3xl bg-gray-900 rounded-xl shadow-2xl border border-gray-700 pointer-events-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400 font-mono">execution</span>
            <StatusBadge status={status} />
            {status === "running" && (
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-sm leading-none"
          >
            ✕
          </button>
        </div>
        <div className="h-56 overflow-y-auto px-4 py-3">
          {logs.length === 0 && status === "pending" && (
            <p className="text-xs text-gray-500">Starting…</p>
          )}
          {logs.map((log) => (
            <LogEntry key={log.id} log={log} />
          ))}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}

// Small inline badge for cards that have a recent execution
export function ExecutionStatusDot({ status }: { status: ExecutionStatus }) {
  const color: Record<ExecutionStatus, string> = {
    pending: "bg-yellow-400",
    running: "bg-blue-400 animate-pulse",
    success: "bg-green-400",
    failed: "bg-red-400",
  };
  return <span className={`inline-block w-2 h-2 rounded-full ${color[status]} shrink-0`} />;
}
