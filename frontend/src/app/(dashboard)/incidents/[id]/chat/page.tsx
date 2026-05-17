"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useWarRoomWS } from "@/lib/useWarRoomWS";
import { timeAgo } from "@/lib/utils";
import type { ChatMessage } from "@/lib/types";
import { Send, MessageSquare } from "lucide-react";

export default function ChatPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: messages = [] } = useQuery<ChatMessage[]>({
    queryKey: ["incident-chat", id],
    queryFn: () => api.get<ChatMessage[]>(`/incidents/${id}/chat`).then((r) => r.data),
    staleTime: 10_000,
  });

  const sendMutation = useMutation({
    mutationFn: (message: string) => api.post(`/incidents/${id}/chat`, { message }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["incident-chat", id] });
      setDraft("");
    },
  });

  const handleWsEvent = useCallback((event: { type: string }) => {
    if (event.type === "chat_message") {
      qc.invalidateQueries({ queryKey: ["incident-chat", id] });
    }
  }, [qc, id]);

  useWarRoomWS(id, handleWsEvent);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function submit() {
    const text = draft.trim();
    if (!text || sendMutation.isPending) return;
    sendMutation.mutate(text);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  const deleteMsg = useMutation({
    mutationFn: (msgId: string) => api.delete(`/incidents/${id}/chat/${msgId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["incident-chat", id] }),
  });

  return (
    <div className="flex flex-col h-[calc(100vh-180px)]">
      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
            <MessageSquare className="h-10 w-10 mb-3 opacity-30" />
            <p className="font-medium">No messages yet</p>
            <p className="text-sm mt-1">Use this channel for real-time team coordination during this incident.</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isOwn = msg.author_id === user?.id;
            return (
              <div key={msg.id} className={`flex items-end gap-2 ${isOwn ? "flex-row-reverse" : ""}`}>
                {/* Avatar */}
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sidebar-accent text-sidebar-foreground text-xs font-semibold shrink-0">
                  {msg.author_initials}
                </div>

                {/* Bubble */}
                <div className={`max-w-xs md:max-w-md lg:max-w-lg group relative ${isOwn ? "items-end" : "items-start"} flex flex-col`}>
                  {!isOwn && (
                    <p className="text-xs text-muted-foreground mb-1 ml-1">{msg.author_name}</p>
                  )}
                  <div
                    className={`px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap break-words ${
                      isOwn
                        ? "bg-primary text-primary-foreground rounded-br-sm"
                        : "bg-card border border-border text-foreground rounded-bl-sm"
                    }`}
                  >
                    {msg.message}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <p className={`text-xs text-muted-foreground ${isOwn ? "text-right" : ""}`}>
                      {timeAgo(msg.created_at)}
                    </p>
                    {isOwn && (
                      <button
                        onClick={() => deleteMsg.mutate(msg.id)}
                        className="text-xs text-muted-foreground hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-border px-6 py-4 bg-card">
        <div className="flex items-end gap-3 max-w-4xl mx-auto">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message… (Enter to send, Shift+Enter for newline)"
            rows={1}
            className="flex-1 resize-none px-4 py-2.5 text-sm border border-border rounded-xl bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            style={{ minHeight: "42px", maxHeight: "120px" }}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = "auto";
              el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
            }}
          />
          <button
            onClick={submit}
            disabled={!draft.trim() || sendMutation.isPending}
            className="flex items-center justify-center h-10 w-10 rounded-xl bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity shrink-0"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
