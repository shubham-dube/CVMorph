"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface ChatMessageContentProps {
  content: string;
  isUser?: boolean;
}

/**
 * Parses inline formatting:
 * - `inline code`
 * - **bold** or __bold__
 * - *italic* or _italic_
 */
export function renderInline(text: string, isUser: boolean = false): React.ReactNode[] {
  if (!text) return [];

  // Match code (`...`), bold (**...** or __...__), and italic (*...* or _..._)
  const regex = /(`[^`\n]+`|\*\*[^*]+?\*\*|__[^_]+?__|\*[^*\n]+?\*|_[^_\n]+?_)/g;
  const parts = text.split(regex);

  return parts.map((part, idx) => {
    if (!part) return null;

    // Inline Code: `code`
    if (part.startsWith("`") && part.endsWith("`") && part.length >= 2) {
      const code = part.slice(1, -1);
      return (
        <code
          key={idx}
          className={cn(
            "px-1 py-0.5 rounded text-[11px] font-mono mx-0.5",
            isUser
              ? "bg-white/20 text-white"
              : "bg-surface-hover border border-border/60 text-purple-600 dark:text-purple-300 font-medium"
          )}
        >
          {code}
        </code>
      );
    }

    // Bold: **text** or __text__
    if (
      (part.startsWith("**") && part.endsWith("**") && part.length >= 4) ||
      (part.startsWith("__") && part.endsWith("__") && part.length >= 4)
    ) {
      const boldText = part.slice(2, -2);
      return (
        <strong
          key={idx}
          className={cn(
            "font-bold",
            isUser ? "text-white font-semibold" : "text-text"
          )}
        >
          {boldText}
        </strong>
      );
    }

    // Italic: *text* or _text_
    if (
      ((part.startsWith("*") && part.endsWith("*")) ||
        (part.startsWith("_") && part.endsWith("_"))) &&
      part.length >= 2
    ) {
      const italicText = part.slice(1, -1);
      return (
        <em key={idx} className="italic">
          {italicText}
        </em>
      );
    }

    return <span key={idx}>{part}</span>;
  });
}

type Block =
  | { type: "paragraph"; lines: string[] }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "heading"; level: number; text: string }
  | { type: "code_block"; code: string; language?: string };

function parseBlocks(content: string): Block[] {
  const rawLines = content.split("\n");
  const blocks: Block[] = [];

  let currentPara: string[] = [];
  let currentUl: string[] = [];
  let currentOl: string[] = [];
  let inCodeBlock = false;
  let codeBlockLines: string[] = [];
  let codeBlockLang = "";

  function flushPara() {
    if (currentPara.length > 0) {
      blocks.push({ type: "paragraph", lines: [...currentPara] });
      currentPara = [];
    }
  }

  function flushUl() {
    if (currentUl.length > 0) {
      blocks.push({ type: "ul", items: [...currentUl] });
      currentUl = [];
    }
  }

  function flushOl() {
    if (currentOl.length > 0) {
      blocks.push({ type: "ol", items: [...currentOl] });
      currentOl = [];
    }
  }

  function flushAll() {
    flushPara();
    flushUl();
    flushOl();
  }

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    const trimmed = line.trim();

    // Code block fences: ```
    if (trimmed.startsWith("```")) {
      if (!inCodeBlock) {
        flushAll();
        inCodeBlock = true;
        codeBlockLang = trimmed.slice(3).trim();
        codeBlockLines = [];
      } else {
        blocks.push({
          type: "code_block",
          code: codeBlockLines.join("\n"),
          language: codeBlockLang,
        });
        inCodeBlock = false;
        codeBlockLines = [];
        codeBlockLang = "";
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(line);
      continue;
    }

    // Empty line separates blocks
    if (!trimmed) {
      flushAll();
      continue;
    }

    // Headings: ### or ## or #
    const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      flushAll();
      blocks.push({
        type: "heading",
        level: headingMatch[1].length,
        text: headingMatch[2],
      });
      continue;
    }

    // Unordered list item: - , * , •
    const ulMatch = trimmed.match(/^[-*•]\s+(.+)$/);
    if (ulMatch) {
      flushPara();
      flushOl();
      currentUl.push(ulMatch[1]);
      continue;
    }

    // Ordered list item: 1. , 2.
    const olMatch = trimmed.match(/^\d+\.\s+(.+)$/);
    if (olMatch) {
      flushPara();
      flushUl();
      currentOl.push(olMatch[1]);
      continue;
    }

    // Regular paragraph line
    flushUl();
    flushOl();
    currentPara.push(line);
  }

  if (inCodeBlock && codeBlockLines.length > 0) {
    blocks.push({
      type: "code_block",
      code: codeBlockLines.join("\n"),
      language: codeBlockLang,
    });
  }

  flushAll();
  return blocks;
}

export function ChatMessageContent({ content, isUser = false }: ChatMessageContentProps) {
  const blocks = parseBlocks(content);

  return (
    <div className={cn("space-y-2 text-xs leading-relaxed", isUser ? "text-white" : "text-text")}>
      {blocks.map((block, bIdx) => {
        switch (block.type) {
          case "paragraph":
            return (
              <p key={bIdx} className="leading-relaxed">
                {block.lines.map((l, lIdx) => (
                  <React.Fragment key={lIdx}>
                    {renderInline(l, isUser)}
                    {lIdx < block.lines.length - 1 && <br />}
                  </React.Fragment>
                ))}
              </p>
            );

          case "ul":
            return (
              <ul key={bIdx} className="space-y-1.5 my-1 pl-0.5">
                {block.items.map((item, itemIdx) => (
                  <li key={itemIdx} className="flex items-start gap-2 leading-relaxed">
                    <span
                      className={cn(
                        "font-bold shrink-0 mt-0.5 text-xs select-none",
                        isUser ? "text-white/80" : "text-purple-500 dark:text-purple-400"
                      )}
                    >
                      •
                    </span>
                    <span className="flex-1">{renderInline(item, isUser)}</span>
                  </li>
                ))}
              </ul>
            );

          case "ol":
            return (
              <ol key={bIdx} className="space-y-1.5 my-1 pl-0.5">
                {block.items.map((item, itemIdx) => (
                  <li key={itemIdx} className="flex items-start gap-2 leading-relaxed">
                    <span
                      className={cn(
                        "font-semibold shrink-0 text-[11px] min-w-[1.2rem] select-none",
                        isUser ? "text-white/80" : "text-purple-600 dark:text-purple-400 font-mono"
                      )}
                    >
                      {itemIdx + 1}.
                    </span>
                    <span className="flex-1">{renderInline(item, isUser)}</span>
                  </li>
                ))}
              </ol>
            );

          case "heading":
            return (
              <h4
                key={bIdx}
                className={cn(
                  "font-bold text-xs mt-2 mb-1",
                  isUser ? "text-white" : "text-text"
                )}
              >
                {renderInline(block.text, isUser)}
              </h4>
            );

          case "code_block":
            return (
              <pre
                key={bIdx}
                className={cn(
                  "p-2.5 rounded-md overflow-x-auto text-[11px] font-mono my-1.5 border",
                  isUser
                    ? "bg-black/30 border-white/20 text-white"
                    : "bg-surface-hover border-border text-text"
                )}
              >
                <code>{block.code}</code>
              </pre>
            );

          default:
            return null;
        }
      })}
    </div>
  );
}
