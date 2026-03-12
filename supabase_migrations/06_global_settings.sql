-- Migration: Create Global Settings Table

CREATE TABLE IF NOT EXISTS global_settings (
    id smallint PRIMARY KEY DEFAULT 1,
    exchange_rate_usd_hnl numeric(10, 4) NOT NULL DEFAULT 25.0000,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    CONSTRAINT global_settings_singleton CHECK (id = 1)
);

-- RLS Policies
ALTER TABLE global_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read access to authenticated users" ON global_settings;
CREATE POLICY "Allow read access to authenticated users" 
    ON global_settings FOR SELECT 
    TO public 
    USING (true);

DROP POLICY IF EXISTS "Allow insert access to authenticated users" ON global_settings;
CREATE POLICY "Allow insert access to authenticated users" 
    ON global_settings FOR INSERT 
    TO public 
    WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update access to authenticated users" ON global_settings;
CREATE POLICY "Allow update access to authenticated users" 
    ON global_settings FOR UPDATE 
    TO public 
    USING (true);

-- Grant privileges to API roles
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE global_settings TO anon, authenticated, service_role;

-- Insert default row
INSERT INTO global_settings (id, exchange_rate_usd_hnl)
VALUES (1, 25.0000)
ON CONFLICT (id) DO NOTHING;
