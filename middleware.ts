import { NextRequest, NextResponse } from 'next/server'

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon') || pathname.startsWith('/public')) return NextResponse.next()
  if (pathname === '/login' || pathname.startsWith('/api/')) return NextResponse.next()
  const cookie = req.cookies.get('auth')?.value
  if (cookie === '1') return NextResponse.next()
  const url = req.nextUrl.clone()
  url.pathname = '/login'
  url.searchParams.set('next', pathname)
  return NextResponse.redirect(url)
}
