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
