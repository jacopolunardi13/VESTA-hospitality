'use client'

import { useEffect, useRef, useState } from 'react'

interface Msg {
  role: 'user' | 'assistant'
  content: string
}

export default function Chat({ propertyId, propertyName }: { propertyId: string; propertyName: string }) {
  const storageKey = `vesta_conv_${propertyId}`
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: 'assistant',
      content: `Ciao! Sono il concierge di ${propertyName}. Posso darti informazioni sul soggiorno o preparare un preventivo per le tue date. Come posso aiutarti?`,
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setConversationId(localStorage.getItem(storageKey))
  }, [storageKey])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, loading])

  async function send() {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    setMessages((m) => [...m, { role: 'user', content: text }])
    setLoading(true)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ propertyId, conversationId, message: text }),
      })
      const data = await res.json()
      if (!res.ok) {
        const errMsg =
          data.error === 'rate_limited' ? 'Troppi messaggi in poco tempo, riprova tra un minuto.'
          : data.error === 'blocked' ? 'Accesso temporaneamente sospeso.'
          : data.error === 'message_too_long' ? 'Messaggio troppo lungo.'
          : 'Si è verificato un errore. Riprova.'
        setMessages((m) => [...m, { role: 'assistant', content: errMsg }])
        return
      }
      if (data.conversationId) {
        setConversationId(data.conversationId)
        localStorage.setItem(storageKey, data.conversationId)
      }
      if (data.reply) {
        setMessages((m) => [...m, { role: 'assistant', content: data.reply }])
      }
    } catch {
      setMessages((m) => [...m, { role: 'assistant', content: 'Errore di connessione. Riprova.' }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm ${
                m.role === 'user'
                  ? 'bg-slate-900 text-white'
                  : 'border border-slate-200 bg-white text-slate-800'
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-400">
              …
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-slate-200 bg-white p-3">
        <form
          onSubmit={(e) => { e.preventDefault(); send() }}
          className="flex items-end gap-2"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
            }}
            rows={1}
            maxLength={1000}
            placeholder="Scrivi un messaggio…"
            className="max-h-32 flex-1 resize-none rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-40"
          >
            Invia
          </button>
        </form>
      </div>
    </div>
  )
}
