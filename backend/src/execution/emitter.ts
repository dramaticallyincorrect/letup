import { EventEmitter } from "node:events";

export interface LogLine {
  id: number;
  execution_id: string;
  ts: string;
  stream: string;
  text: string;
}

export const executionEmitter = new EventEmitter();
executionEmitter.setMaxListeners(200);

export function emitLog(executionId: string, log: LogLine) {
  executionEmitter.emit(`log:${executionId}`, log);
}

export function emitDone(executionId: string) {
  executionEmitter.emit(`done:${executionId}`);
}
