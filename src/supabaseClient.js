import { createClient } from '@supabase/supabase-js'

// Tamari Supabase URL ane Anon Key ahi muko
const supabaseUrl = 'https://zxuapcdquugtxlitjdcs.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp4dWFwY2RxdXVndHhsaXRqZGNzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU0NzQ3MDYsImV4cCI6MjEwMTA1MDcwNn0.FVwnJzJ84qghevq7fzZrbSacrWPGUcGEuFmxNKCB9N8'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)