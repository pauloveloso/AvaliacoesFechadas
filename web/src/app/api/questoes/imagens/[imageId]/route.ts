import { get } from "@vercel/blob";

import { auth } from "@/lib/auth/server";
import { getDatabase } from "@/lib/db";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ imageId: string }> },
) {
  const { data } = await auth.getSession();
  const ownerEmail = process.env.APP_OWNER_EMAIL?.trim().toLowerCase();
  if (!data?.user || !ownerEmail || data.user.email?.toLowerCase() !== ownerEmail) {
    return new Response("Não autorizado", { status: 401 });
  }

  const { imageId } = await params;
  if (!uuidPattern.test(imageId)) return new Response("Imagem não encontrada", { status: 404 });

  const result = await getDatabase().query<{ blob_pathname: string; content_type: string }>(
    "select blob_pathname, content_type from public.question_images where id = $1",
    [imageId],
  );
  const image = result.rows[0];
  if (!image) return new Response("Imagem não encontrada", { status: 404 });

  try {
    const blob = await get(image.blob_pathname, { access: "private" });
    if (blob?.statusCode !== 200 || !blob.stream) {
      return new Response("Imagem não encontrada", { status: 404 });
    }

    return new Response(blob.stream, {
      headers: {
        "Content-Type": image.content_type,
        "Content-Disposition": "inline",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Cross-Origin-Resource-Policy": "same-origin",
      },
    });
  } catch {
    return new Response("Armazenamento de imagens indisponível", { status: 503 });
  }
}
