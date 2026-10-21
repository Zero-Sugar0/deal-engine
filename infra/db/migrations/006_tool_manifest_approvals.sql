ALTER TABLE approvals
  ADD COLUMN IF NOT EXISTS tool_name text;

CREATE INDEX IF NOT EXISTS approvals_tool_name_idx
  ON approvals (tool_name)
  WHERE tool_name IS NOT NULL;
