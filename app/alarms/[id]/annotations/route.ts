import { es, esStatus, INDICES } from '@/lib/es';
import { readBody, text } from '@/lib/http';
import { getUser } from '@/lib/session';
import type { Annotation } from '@/lib/types';

type Ctx = { params: Promise<{ id: string }> };

// Adds an annotation to an alarm. Only for logged-in users.
export async function POST(req: Request, { params }: Ctx) {
  const user = await getUser();
  if (!user) return text('Login required.', 401);
  const { id } = await params;
  const b = await readBody(req);
  if (b instanceof Response) return b;
  const annotationText = typeof b.text === 'string' ? b.text.trim() : '';
  if (!annotationText) return text('text is required.\n', 400);
  if (annotationText.length > 5000) return text('text is too long.\n', 400);

  const annotation: Annotation = { user: user.name || user.username, text: annotationText, created_at: Date.now() };
  try {
    await es().update({
      index: INDICES.alarms,
      id,
      refresh: true,
      script: {
        lang: 'painless',
        source: 'if (ctx._source.annotations == null) { ctx._source.annotations = []; } ctx._source.annotations.add(params.annotation);',
        params: { annotation },
      },
    });
    return text('OK');
  } catch (err) {
    if (esStatus(err) === 404) return text('No alarm with that ID.', 404);
    console.error('cant annotate alarm:\n', err);
    return text('Error in adding annotation.', 500);
  }
}
