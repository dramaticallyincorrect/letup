export interface Board {
  id: string;
  name: string;
  workspace_path: string;
  created_at: string;
}

export interface Column {
  id: string;
  board_id: string;
  name: string;
  position: number;
  created_at: string;
}

export interface Card {
  id: string;
  column_id: string;
  title: string;
  description: string;
  metadata_json: string;
  position: number;
  created_at: string;
}

export interface Pipeline {
  id: string;
  column_id: string;
  definition_json: string;
  created_at: string;
}

export type ExecutionStatus = "pending" | "running" | "success" | "failed";

export interface Execution {
  id: string;
  card_id: string;
  column_id: string;
  pipeline_snapshot_json: string;
  status: ExecutionStatus;
  started_at: string;
  finished_at: string | null;
  exit_code: number | null;
}

export interface LogLine {
  id: number;
  execution_id: string;
  ts: string;
  stream: "stdout" | "stderr" | "agent";
  text: string;
}

export interface MissingParam {
  key: string;
  label: string;
  description: string;
  type: "string" | "secret";
}
