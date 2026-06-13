'use server'

import { createClient } from './server'

export async function enrollUserInOrg(orgId: string): Promise<void> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) throw new Error('enrollUserInOrg: unauthenticated')

  const { error } = await supabase.rpc('enroll_user_in_org', {
    p_org_id: orgId,
    p_user_id: user.id,
  })

  if (error) throw error
}
