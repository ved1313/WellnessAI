import { NextRequest } from 'next/server';
import { getServerClient } from '@/lib/supabase';

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Helper to extract auth token from Authorization header (Bearer).
function getAuthToken(req: NextRequest): string | null {
  const auth = req.headers.get('authorization');
  if (!auth) return null;
  const [scheme, token] = auth.split(' ');
  if (!token || scheme.toLowerCase() !== 'bearer') return null;
  return token;
}

type ServerClient = NonNullable<ReturnType<typeof getServerClient>>;

async function resolveUserId(supabase: ServerClient, token: string): Promise<string | null> {
  if (uuidRegex.test(token)) return token;

  const looksLikeEmail = token.includes('@');
  if (looksLikeEmail) {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('user_id')
      .ilike('email', token)
      .maybeSingle();
    if (error) return null;
    return data?.user_id ?? null;
  }

  const { data: userRow, error: userErr } = await supabase
    .from('user_profiles')
    .select('user_id')
    .ilike('username', token)
    .maybeSingle();
  if (!userErr && userRow?.user_id) return userRow.user_id;

  const { data: nameRow, error: nameErr } = await supabase
    .from('user_profiles')
    .select('user_id')
    .ilike('display_name', token)
    .maybeSingle();
  if (nameErr) return null;
  return nameRow?.user_id ?? null;
}

export async function GET(req: NextRequest) {
  try {
    const token = getAuthToken(req);
    if (!token) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
    const supabase = getServerClient();
    if (!supabase) return new Response(JSON.stringify({ error: 'supabase not configured' }), { status: 500 });

    const userId = await resolveUserId(supabase, token);
    if (!userId) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
    const { data, error } = await supabase
      .from('chat_sessions')
      .select('id,title,created_at,updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    return new Response(JSON.stringify({ sessions: data }), { headers: { 'content-type': 'application/json' } });
  } catch (e: unknown) {
    const msg = (e as { message?: string }).message || 'server error';
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { 'content-type': 'application/json' } });
  }
}

export async function POST(req: NextRequest) {
  try {
    const token = getAuthToken(req);
    if (!token) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
    const supabase = getServerClient();
    if (!supabase) return new Response(JSON.stringify({ error: 'supabase not configured' }), { status: 500 });

    const userId = await resolveUserId(supabase, token);
    if (!userId) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });

    const body = (await req.json().catch(() => ({}))) as { title?: string };
    const title = body.title?.trim() || 'New Conversation';

    const { data, error } = await supabase
      .from('chat_sessions')
      .insert({ user_id: userId, title })
      .select('id,title,created_at,updated_at')
      .single();

    if (error) throw error;
    return new Response(JSON.stringify({ session: data }), { status: 201, headers: { 'content-type': 'application/json' } });
  } catch (e: unknown) {
    const msg = (e as { message?: string }).message || 'server error';
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { 'content-type': 'application/json' } });
  }
}

export const dynamic = 'force-dynamic';
