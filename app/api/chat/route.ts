import { GoogleGenAI } from "@google/genai";
import { createClient } from "@/app/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const USAGE_SENTINEL = "__USAGE__";

type IncomingMessage = {
  role: "user" | "assistant";
  content: string;
};

type RequestBody = {
  messages?: IncomingMessage[];
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "GOOGLE_API_KEY is not configured on the server." },
      { status: 500 },
    );
  }

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return Response.json(
      { error: "messages must be a non-empty array" },
      { status: 400 },
    );
  }

  const contents = messages
    .filter((m) => typeof m?.content === "string" && m.content.trim().length > 0)
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

  if (contents.length === 0) {
    return Response.json(
      { error: "messages contain no text content" },
      { status: 400 },
    );
  }

  const ai = new GoogleGenAI({ apiKey });

  let geminiStream;
  try {
    geminiStream = await ai.models.generateContentStream({
      model: "gemini-2.5-flash-lite",
      contents,
    });
  } catch (err) {
    const { status, message, retryAfterSec } = mapGeminiError(err);
    return Response.json(
      { error: message, retryAfterSec },
      { status },
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let usage: {
        promptTokens?: number;
        outputTokens?: number;
        totalTokens?: number;
      } = {};

      try {
        for await (const chunk of geminiStream) {
          const text = chunk.text;
          if (text) {
            controller.enqueue(encoder.encode(text));
          }
          const meta = chunk.usageMetadata;
          if (meta) {
            usage = {
              promptTokens: meta.promptTokenCount,
              outputTokens: meta.candidatesTokenCount,
              totalTokens: meta.totalTokenCount,
            };
          }
        }
        controller.enqueue(
          encoder.encode(`\n${USAGE_SENTINEL}${JSON.stringify(usage)}`),
        );
        controller.close();
      } catch (err) {
        const { message } = mapGeminiError(err);
        controller.enqueue(encoder.encode(`\n\n⚠️ ${message}`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}

type GeminiErrorPayload = {
  error?: {
    code?: number;
    status?: string;
    message?: string;
    details?: Array<{
      "@type"?: string;
      retryDelay?: string;
    }>;
  };
};

function mapGeminiError(err: unknown): {
  status: number;
  message: string;
  retryAfterSec?: number;
} {
  const raw = err instanceof Error ? err.message : String(err);
  const parsed = tryParseJSON(raw);
  const apiError = (parsed as GeminiErrorPayload | null)?.error;

  const code = apiError?.code;
  const apiMessage = apiError?.message?.split("\n")[0]?.trim();

  const retryDelay = apiError?.details?.find(
    (d) => d?.["@type"]?.includes("RetryInfo") && typeof d.retryDelay === "string",
  )?.retryDelay;
  const retryAfterSec = retryDelay ? parseRetrySeconds(retryDelay) : undefined;

  if (code === 429) {
    return {
      status: 429,
      message: retryAfterSec
        ? `사용량 한도를 초과했습니다. 약 ${retryAfterSec}초 후 다시 시도하세요.`
        : "사용량 한도를 초과했습니다. 잠시 후 다시 시도하세요.",
      retryAfterSec,
    };
  }
  if (code === 401 || code === 403) {
    return { status: code, message: "API 키 인증에 실패했습니다." };
  }
  if (code === 400) {
    return { status: 400, message: apiMessage ?? "잘못된 요청입니다." };
  }
  if (typeof code === "number" && code >= 500) {
    return { status: 502, message: "Gemini 서버 오류가 발생했습니다." };
  }

  return {
    status: 502,
    message: apiMessage ?? "Gemini 호출 중 오류가 발생했습니다.",
  };
}

function tryParseJSON(input: string): unknown {
  const start = input.indexOf("{");
  if (start === -1) return null;
  try {
    return JSON.parse(input.slice(start));
  } catch {
    return null;
  }
}

function parseRetrySeconds(retryDelay: string): number | undefined {
  const match = retryDelay.match(/^([\d.]+)s$/);
  if (!match) return undefined;
  const n = Math.ceil(Number(match[1]));
  return Number.isFinite(n) ? n : undefined;
}
