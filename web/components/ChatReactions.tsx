'use client';

import { Send } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { REACTION_EMOJIS } from '@shared/constants';
import { ChatMessage } from '@shared/types';

interface ChatReactionsProps {
  messages: ChatMessage[];
  onSendChat: (text: string) => void;
  onSendReaction: (emoji: string) => void;
}

export default function ChatReactions({
  messages,
  onSendChat,
  onSendReaction,
}: ChatReactionsProps) {
  const [text, setText] = useState('');
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSendChat(text);
    setText('');
  };

  return (
    <div className="flex h-80 flex-col rounded-2xl border border-slate-800 bg-slate-900/80 p-3.5 lg:h-full">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-bold tracking-wider text-slate-400 uppercase">
          Live Room Feed
        </h3>
        <div className="flex gap-1">
          {REACTION_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => onSendReaction(emoji)}
              className="rounded-lg bg-slate-800/80 px-1.5 py-1 text-sm transition hover:scale-110 hover:bg-slate-700"
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto pr-1 text-xs">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={
              msg.isSystem
                ? 'rounded-lg bg-slate-800/60 px-2.5 py-1.5 text-amber-300/90'
                : 'rounded-lg bg-slate-950/70 px-2.5 py-1.5 text-slate-200'
            }
          >
            {!msg.isSystem && (
              <span className="mr-1.5 font-bold text-sky-400">
                {msg.teamShortName ? `[${msg.teamShortName}] ` : ''}
                {msg.senderName}:
              </span>
            )}
            <span>{msg.text}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSubmit} className="mt-2 flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Say something..."
          maxLength={200}
          className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-xl bg-amber-400 px-3 py-2 text-slate-950 transition hover:bg-amber-300"
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </form>
    </div>
  );
}
