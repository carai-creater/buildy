import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getSupabaseServer } from "@/lib/supabase-server";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

type ExecuteBody = {
  agent_id: string;
  messages?: ChatMessage[];
  user_message?: string;
  conversation_id?: string;
  stream?: boolean;
};

function getClientId(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0].trim() : "unknown";
  const auth = req.headers.get("authorization");
  const token = auth?.replace(/^Bearer\s+/i, "").slice(0, 32) || "anon";
  return `rl:${ip}:${token}`;
}

export async function POST(req: NextRequest) {
  const clientId = getClientId(req);
  const { allowed, remaining } = checkRateLimit(clientId);
  if (!allowed) {
    return NextResponse.json(
      { error: "rate_limit_exceeded", message: "短時間のリクエストが多すぎます。しばらく待ってから再試行してください。" },
      { status: 429, headers: { "X-RateLimit-Remaining": "0" } }
    );
  }

  let body: ExecuteBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_body", message: "JSON body を送信してください。" },
      { status: 400 }
    );
  }

  const { agent_id, messages: bodyMessages, user_message, conversation_id, stream = true } = body;

  if (!agent_id || typeof agent_id !== "string") {
    return NextResponse.json(
      { error: "agent_id_required", message: "agent_id は必須です。" },
      { status: 400 }
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("[Buildy execute] OPENAI_API_KEY is not set");
    return NextResponse.json(
      { error: "server_error", message: "LLM が設定されていません。" },
      { status: 500 }
    );
  }

  try {
    const supabase = getSupabaseServer();
    const { data: agent, error: agentError } = await supabase
      .from("agents")
      .select("id, system_prompt")
      .eq("id", agent_id)
      .single();

    if (agentError || !agent) {
      console.warn("[Buildy execute] Agent not found:", agent_id, agentError?.message);
      return NextResponse.json(
        { error: "agent_not_found", message: "指定されたエージェントが見つかりません。" },
        { status: 404 }
      );
    }

    const systemPrompt = (agent.system_prompt as string) || "You are a helpful assistant.";

    let messages: ChatMessage[] = [];
    if (Array.isArray(bodyMessages) && bodyMessages.length > 0) {
      messages = [...bodyMessages];
    } else if (typeof user_message === "string" && user_message.trim()) {
      messages = [{ role: "user", content: user_message.trim() }];
    } else {
      return NextResponse.json(
        { error: "messages_required", message: "messages または user_message を送信してください。" },
        { status: 400 }
      );
    }

    // 会話履歴は Supabase から取得する拡張ポイント（conversation_id があればここで取得）
    const systemMessage: ChatMessage = { role: "system", content: systemPrompt };
    const openaiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      systemMessage,
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    const openai = new OpenAI({ apiKey });

    if (stream) {
      const stream = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
        messages: openaiMessages,
        stream: true,
      });

      const encoder = new TextEncoder();
      const readable = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of stream) {
              const delta = chunk.choices?.[0]?.delta?.content;
              if (delta) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: delta })}\n\n`));
              }
            }
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
          } catch (err) {
            console.error("[Buildy execute] Stream error:", err);
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ error: "stream_error", message: "ストリーム中にエラーが発生しました。" })}\n\n`
              )
            );
          } finally {
            controller.close();
          }
        },
      });

      return new Response(readable, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "X-RateLimit-Remaining": String(remaining),
        },
      });
    }

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      messages: openaiMessages,
      stream: false,
    });

    const content = completion.choices?.[0]?.message?.content ?? "";
    return NextResponse.json(
      { content, conversation_id },
      { headers: { "X-RateLimit-Remaining": String(remaining) } }
    );
  } catch (err) {
    console.error("[Buildy execute] Error:", err);
    return NextResponse.json(
      {
        error: "execution_failed",
        message: err instanceof Error ? err.message : "エージェント実行に失敗しました。",
      },
      { status: 500 }
    );
  }
}
