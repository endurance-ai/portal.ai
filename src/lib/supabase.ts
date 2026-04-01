import "server-only"
import {createClient} from "@supabase/supabase-js"

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl) {
  throw new Error("Missing environment variable: SUPABASE_URL")
}
if (!supabaseKey) {
  throw new Error("Missing environment variable: SUPABASE_SERVICE_ROLE_KEY")
}

export const supabase = createClient(supabaseUrl, supabaseKey)
