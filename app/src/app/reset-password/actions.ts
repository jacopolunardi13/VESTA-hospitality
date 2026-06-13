'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function resetPassword(formData: FormData) {
  const password = formData.get('password') as string | null

  if (!password) redirect('/reset-password?error=missing_password')
  if (password.length < 8) redirect('/reset-password?error=password_too_short')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?error=session_expired')

  const { error } = await supabase.auth.updateUser({ password })
  if (error) redirect('/reset-password?error=update_failed')

  redirect('/login?reset=1')
}
