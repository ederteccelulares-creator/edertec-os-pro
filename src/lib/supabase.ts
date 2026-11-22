import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null

export type OrganizationRole =
  | 'owner'
  | 'admin'
  | 'manager'
  | 'attendant'
  | 'technician'

export type Organization = {
  id: string
  name: string
  slug: string
  timezone: string
}

export type Branch = {
  id: string
  organization_id: string
  name: string
  code: string
  active: boolean
}
