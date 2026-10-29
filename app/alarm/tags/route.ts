import type { NextRequest } from 'next/server';
import { recentTags } from '@/lib/alarms';
import { text } from '@/lib/http';

// Tags seen in the last 30 days of alarms of a category. Used for autocompletion.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const [category, subcategory, event] = ['category', 'subcategory', 'event'].map((k) => q.get(k));
  if (!category || !subcategory || !event) return text('category, subcategory and event are required.\n', 400);
  try {
    return Response.json(await recentTags({ category, subcategory, event }));
  } catch (err) {
    console.error(err);
    return Response.json([]);
  }
}
