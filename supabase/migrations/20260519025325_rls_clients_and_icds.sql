-- ─────────────────────────────────────────────────────────────────────────────
-- RLS policies for clients and icds reference tables.
-- All authenticated users can read; only admins can write.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── clients ──────────────────────────────────────────────────────────────────

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

-- All authenticated users can SELECT clients (needed for dropdowns everywhere).
CREATE POLICY "clients_select_authenticated"
  ON clients FOR SELECT
  TO authenticated
  USING (true);

-- Only admins can INSERT / UPDATE / DELETE clients.
CREATE POLICY "clients_write_admin"
  ON clients FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid() AND r.name = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid() AND r.name = 'admin'
    )
  );

-- ── icds ─────────────────────────────────────────────────────────────────────

ALTER TABLE icds ENABLE ROW LEVEL SECURITY;

-- All authenticated users can SELECT ICDs.
CREATE POLICY "icds_select_authenticated"
  ON icds FOR SELECT
  TO authenticated
  USING (true);

-- Only admins can write ICDs.
CREATE POLICY "icds_write_admin"
  ON icds FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid() AND r.name = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid() AND r.name = 'admin'
    )
  );
