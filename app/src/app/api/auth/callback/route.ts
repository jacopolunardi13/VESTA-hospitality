import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  // SB-01 fix: reject protocol-relative URLs and anything that doesn't start with '/'.
  const rawNext = searchParams.get('next') ?? '/inbox'
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/inbox'

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`)
  }

  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
  }

  // Org check applies only to the signup confirmation flow (next=/inbox).
  // The recovery flow (next=/reset-password) must reach the reset page directly.
  if (next === '/inbox') {
    const { data: { user } } = await supabase.auth.getUser()

    if (user) {
      const { count } = await supabase
        .from('org_members')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)

      if (count === 0) {
        return NextResponse.redirect(`${origin}/onboarding`)
      }
    }
  }

  return NextResponse.redirect(`${origin}${next}`)
}
