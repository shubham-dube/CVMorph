"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bot,
  Send,
  X,
  Sparkles,
  RotateCcw,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  MessageSquare,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";
import { candidatesApi, ApiError } from "@/lib/api-client";
import type { AgentChatMessage, CandidateProfile } from "@/lib/types";
import { cn } from "@/lib/utils";

interface AIAgentDrawerProps {
  candidateId: string;
  profileId: string;
  candidateName: string;
  profileTitle: string;
  isOpen: boolean;
  onClose: () => void;
  onProfileUpdated: (newProfile: CandidateProfile, reply: string, changes: string[]) => void;
  onUndo: () => void;
  canUndo: boolean;
}

const SUGGESTED_PROMPTS = [
  "Condense Career Summary into 3 high-impact executive bullets",
  "Quantify bullet points with latency, revenue, and throughput metrics",
  "Strengthen action verbs and remove passive voice across all employment entries",
  "Add Kubernetes, Docker, and CI/CD pipelines to DevOps capabilities",
  "Rephrase tone to be strictly third-person and executive-level",
];

export function AIAgentDrawer({
  candidateId,
  profileId,
  candidateName,
  profileTitle,
  isOpen,
  onClose,
  onProfileUpdated,
  onUndo,
  canUndo,
}: AIAgentDrawerProps) {
  const [messages, setMessages] = useState<AgentChatMessage[]>([
    {
      id: "initial",
      role: "assistant",
      content: `Hello! I'm your AI profile editing copilot for **${candidateName}** (${profileTitle}).\n\nTell me what you'd like to adjust — from condensing a section, rewriting bullet points, adding missing tools, to re-framing achievements — and I'll update the profile instantly.`,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [expandedChanges, setExpandedChanges] = useState<Record<string, boolean>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        textareaRef.current?.focus();
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 150);
    }
  }, [isOpen, messages]);

  async function handleSend(promptText: string) {
    const text = promptText.trim();
    if (!text || loading) return;

    const userMsg: AgentChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setPrompt("");
    setLoading(true);

    try {
      // Build conversation history for context
      const history = messages
        .filter((m) => m.id !== "initial")
        .map((m) => ({ role: m.role, content: m.content }));

      const res = await candidatesApi.agentEditProfile(candidateId, profileId, {
        prompt: text,
        conversation_history: history,
      });

      const assistantMsg: AgentChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: res.reply,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        changes_summary: res.changes_summary,
      };

      setMessages((prev) => [...prev, assistantMsg]);
      onProfileUpdated(res.profile, res.reply, res.changes_summary);
      toast.success("Profile updated by AI Copilot.");
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to execute AI edit.";
      toast.error(message);
      const errorMsg: AgentChatMessage = {
        id: `err-${Date.now()}`,
        role: "assistant",
        content: `Sorry, I encountered an issue: ${message}. Please try again or rephrase your instruction.`,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend(prompt);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[460px] flex flex-col bg-surface border-l border-border shadow-2xl animate-fade-in">
      {/* Header */}
      <div className="p-4 border-b border-border bg-bg/60 backdrop-blur-xs flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-purple-600 to-indigo-600 text-white shadow-xs">
            <Bot className="h-4 w-4" />
            <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-surface" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="text-xs font-bold text-text">AI Profile Copilot</h3>
              <span className="text-[10px] px-1.5 py-0.2 rounded font-medium bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                Live
              </span>
            </div>
            <p className="text-[11px] text-text-muted truncate max-w-[240px]">
              {candidateName} &middot; {profileTitle}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {canUndo && (
            <Button
              variant="outline"
              size="sm"
              onClick={onUndo}
              className="text-[11px] h-7 px-2 text-text-muted hover:text-text"
              title="Undo the last AI change"
            >
              <RotateCcw className="h-3 w-3 mr-1" /> Undo
            </Button>
          )}
          <button
            onClick={onClose}
            className="p-1 rounded text-text-faint hover:text-text hover:bg-surface-hover transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Message Stream */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
        {messages.map((msg) => {
          const isUser = msg.role === "user";
          return (
            <div
              key={msg.id}
              className={cn("flex flex-col gap-1 max-w-[92%]", isUser ? "ml-auto items-end" : "mr-auto items-start")}
            >
              <div
                className={cn(
                  "rounded-[var(--radius-md)] p-3 leading-relaxed",
                  isUser
                    ? "bg-accent text-white shadow-xs"
                    : "bg-bg border border-border text-text shadow-2xs"
                )}
              >
                <p className="whitespace-pre-wrap">{msg.content}</p>

                {/* Changes Summary Pills */}
                {msg.changes_summary && msg.changes_summary.length > 0 && (
                  <div className="mt-2.5 pt-2 border-t border-border/60">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedChanges((prev) => ({
                          ...prev,
                          [msg.id]: !prev[msg.id],
                        }))
                      }
                      className="flex items-center gap-1 text-[11px] font-semibold text-purple-600 dark:text-purple-400 hover:underline cursor-pointer"
                    >
                      <CheckCircle2 className="h-3 w-3" />
                      {msg.changes_summary.length} {msg.changes_summary.length === 1 ? "change" : "changes"} applied
                      {expandedChanges[msg.id] ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </button>

                    {expandedChanges[msg.id] && (
                      <ul className="mt-1.5 space-y-1 text-[11px] text-text-muted bg-surface/80 rounded p-2 border border-border/50 animate-fade-in">
                        {msg.changes_summary.map((c, i) => (
                          <li key={i} className="flex items-start gap-1.5">
                            <span className="text-purple-500 font-bold">•</span>
                            <span>{c}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
              <span className="text-[10px] text-text-faint px-1">{msg.timestamp}</span>
            </div>
          );
        })}

        {loading && (
          <div className="flex items-center gap-2 p-3 rounded-[var(--radius-md)] bg-bg border border-border mr-auto text-text-muted max-w-[85%]">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-purple-500" />
            <span className="text-[11px]">Updating profile sections...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Quick Prompts */}
      <div className="px-3 py-2 border-t border-border bg-bg/40">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-text-faint mb-1.5 flex items-center gap-1">
          <Sparkles className="h-2.5 w-2.5 text-purple-400" /> Suggested Prompts
        </p>
        <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {SUGGESTED_PROMPTS.map((p, idx) => (
            <button
              key={idx}
              type="button"
              disabled={loading}
              onClick={() => handleSend(p)}
              className="shrink-0 text-[11px] px-2.5 py-1 rounded-full border border-border bg-surface hover:border-purple-500/50 hover:bg-purple-500/5 text-text-muted hover:text-text transition-all cursor-pointer truncate max-w-[240px]"
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Input Area */}
      <div className="p-3 border-t border-border bg-surface">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend(prompt);
          }}
          className="relative flex items-end gap-2"
        >
          <Textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask AI to edit, rephrase, add skills, condense bullets... (Enter to send)"
            rows={2}
            disabled={loading}
            className="text-xs bg-bg resize-none pr-10 focus:ring-purple-500"
          />
          <Button
            type="submit"
            size="sm"
            disabled={!prompt.trim() || loading}
            className="h-8 w-8 p-0 rounded-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shrink-0 shadow-xs"
            title="Send prompt (Enter)"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          </Button>
        </form>
        <p className="text-[10px] text-text-faint mt-1.5 text-center">
          Press <kbd className="px-1 py-0.2 bg-bg border border-border rounded font-mono">Enter</kbd> to submit, <kbd className="px-1 py-0.2 bg-bg border border-border rounded font-mono">Shift+Enter</kbd> for newline.
        </p>
      </div>
    </div>
  );
}
