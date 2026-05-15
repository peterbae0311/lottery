import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export async function GET() {
  const supabase = createServerClient();

  const PAGE = 1000;
  const all: unknown[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('lotto_results')
      .select('*')
      .order('round', { ascending: false })
      .range(from, from + PAGE - 1);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  return NextResponse.json({ success: true, data: all });
}
