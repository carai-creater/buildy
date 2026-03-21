"use client";

import { useCallback, useState } from "react";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type ExecuteOptions = {
  agent_id: string;
  messages?: ChatMessage[];
  user_message?: string;
  conversation_id?: string;
  stream?: boolean;
  /** Tempo 決済後のアクセストークン（有料エージェント）。省略時は sessionStorage `buildy_tempo_access_<agent_id>` を試す */
  payment_access_token?: string;
};

export type AgentExecutorState = {
  isLoading: boolean;
  error: string | null;
  content: string;
  done: boolean;
};

const defaultState: AgentExecutorState = {
  isLoading: false,
  error: null,
  content: "",
  done: false,
};

export function useAgentExecutor() {
  const [state, setState] = useState<AgentExecutorState>(defaultState);

  const execute = useCallback(async (options: ExecuteOptions) => {
    const {
      agent_id,
      messages,
      user_message,
      conversation_id,
      stream = true,
      payment_access_token: paymentAccess,
    } = options;

    setState((s) => ({ ...s, isLoading: true, error: null, content: "", done: false }));

    let paymentToken = paymentAccess;
    if (!paymentToken && typeof window !== "undefined") {
      try {
        paymentToken = sessionStorage.getItem(`buildy_tempo_access_${agent_id}`) ?? undefined;
      } catch {
        /* ignore */
      }
    }

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (paymentToken) headers["X-Buildy-Access-Token"] = paymentToken;

      const res = await fetch("/api/agent/execute", {
        method: "POST",
        headers,
        body: JSON.stringify({
          agent_id,
          messages,
          user_message,
          conversation_id,
          stream,
          payment_access_token: paymentToken,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const message =
          data?.message ?? data?.error ?? `HTTP ${res.status}`;
        setState((s) => ({
          ...s,
          isLoading: false,
          error: message,
          done: true,
        }));
        return;
      }

      if (!stream) {
        const data = await res.json();
        setState((s) => ({
          ...s,
          isLoading: false,
          content: data?.content ?? "",
          done: true,
        }));
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setState((s) => ({ ...s, isLoading: false, error: "No response body", done: true }));
        return;
      }

      const decoder = new TextDecoder();
      let content = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n").filter((line) => line.startsWith("data: "));

        for (const line of lines) {
          const payload = line.slice(6);
          if (payload === "[DONE]") continue;
          try {
            const data = JSON.parse(payload);
            if (data.done) {
              setState((s) => ({ ...s, isLoading: false, done: true }));
              return;
            }
            if (typeof data.text === "string") {
              content += data.text;
              setState((s) => ({ ...s, content, done: false }));
            }
            if (data.error) {
              setState((s) => ({
                ...s,
                isLoading: false,
                error: data.message ?? data.error,
                done: true,
              }));
              return;
            }
          } catch {
            // ignore malformed SSE lines
          }
        }
      }

      setState((s) => ({ ...s, isLoading: false, done: true }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "リクエストに失敗しました";
      setState((s) => ({
        ...s,
        isLoading: false,
        error: message,
        done: true,
      }));
    }
  }, []);

  const reset = useCallback(() => {
    setState(defaultState);
  }, []);

  return {
    ...state,
    execute,
    reset,
  };
}
