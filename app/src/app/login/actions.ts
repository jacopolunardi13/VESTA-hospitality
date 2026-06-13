'use server'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

export async function forgotPassword(formData: FormData) {
  const email = (formData.get('email') as string | null)?.trim()
  if (!email) redirect('/login?mode=forgot&error=missing_fields')

  const h = await headers()
  const host = h.get('host') ?? 'localhost:3000'
  const proto = h.get('x-forwarded-proto') ?? 'http'
  const appUrl = `${proto}://${host}`

  const supabase = await createClient()
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${appUrl}/api/auth/callback?next=/reset-password`,
  })

  // Always show sent=1 regardless of whether the email exists (prevents enumeration).
  redirect('/login?mode=forgot&sent=1')
}

export async function login(formData: FormData) {
  const supabase = await createClient()

  const { error } = await supabase.auth.signInWithPassword({
    email: formData.get('email') as string,
    password: formData.get('password') as string,
  })

  if (error) {
    redirect('/login?error=invalid_credentials')
  }

  // Redirect returning users who skipped onboarding back to it.
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    const { count } = await supabase
      .from('org_members')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)

    if (count === 0) {
      redirect('/onboarding')
    }
  }

  redirect('/inbox')
}

export async function signup(formData: FormData) {
  const email = (formData.get('email') as string | null)?.trim()
  const password = formData.get('password') as string | null

  if (!email || !password) {
    redirect('/login?mode=signup&error=missing_fields')
  }

  // Derive app URL from request headers — avoids a new env var.
  const h = await headers()
  const host = h.get('host') ?? 'localhost:3000'
  const proto = h.get('x-forwarded-proto') ?? 'http'
  const appUrl = `${proto}://${host}`

  const supabase = await createClient()
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${appUrl}/api/auth/callback`,
    },
  })

  if (error) {
    const msg = error.message?.toLowerCase() ?? ''
    if (msg.includes('already registered') || msg.includes('already exists')) {
      redirect('/login?mode=signup&error=email_taken')
    }
    redirect('/login?mode=signup&error=signup_failed')
  }

  redirect('/login?mode=signup&confirmed=1')
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
