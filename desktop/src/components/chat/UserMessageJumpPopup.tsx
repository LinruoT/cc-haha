import { useEffect, useMemo, useRef } from 'react'
import { X, MessageSquare } from 'lucide-react'
import { useTranslation } from '../../i18n'
import type { UIMessage } from '../../types/chat'

type Props = {
  open: boolean
  onClose: () => void
  messages: UIMessage[]
  onJump: (messageId: string) => void
  anchorRef: React.RefObject<HTMLElement | null>
}

function truncateText(text: string, maxLen: number): string {
  const stripped = text.replace(/\s+/g, ' ').trim()
  if (stripped.length <= maxLen) return stripped
  return stripped.slice(0, maxLen) + '...'
}

export function UserMessageJumpPopup({ open, onClose, messages, onJump, anchorRef }: Props) {
  const t = useTranslation()
  const popupRef = useRef<HTMLDivElement>(null)

  const userMessages = useMemo(
    () => {
      const filtered = messages.filter(
        (m): m is Extract<UIMessage, { type: 'user_text' }> => m.type === 'user_text',
      )
      return [...filtered].reverse()
    },
    [messages],
  )

  useEffect(() => {
    if (!open) return

    const handleClick = (e: MouseEvent) => {
      if (
        popupRef.current &&
        !popupRef.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose()
      }
    }

    const handleKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }

    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)

    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open, onClose, anchorRef])

  if (!open || userMessages.length === 0) return null

  return (
    <div
      ref={popupRef}
      role="dialog"
      aria-label={t('session.jumpToMessage')}
      className="absolute left-1/2 top-full z-50 mt-1 w-[420px] max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-container-lowest)] shadow-[var(--shadow-popover)]"
      style={{ maxHeight: 'min(60vh, 480px)' }}
    >
      <div className="flex items-center justify-between border-b border-[var(--color-border)]/60 px-4 py-3">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
          {t('session.jumpToMessage')}
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-surface-container-highest)] hover:text-[var(--color-text-primary)]"
          aria-label={t('common.cancel')}
        >
          <X size={15} />
        </button>
      </div>
      <div className="overflow-y-auto py-1" style={{ maxHeight: 'calc(min(60vh, 480px) - 49px)' }}>
        {userMessages.map((msg, i) => (
          <button
            key={msg.id}
            type="button"
            onClick={() => {
              onJump(msg.id)
              onClose()
            }}
            className="flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[var(--color-surface-container-highest)]"
          >
            <span className="mt-0.5 shrink-0 text-[10px] font-semibold tabular-nums text-[var(--color-text-tertiary)]">
              {userMessages.length - i}
            </span>
            <MessageSquare size={14} className="mt-0.5 shrink-0 text-[var(--color-text-tertiary)]" />
            <span className="min-w-0 flex-1 text-[13px] leading-snug text-[var(--color-text-primary)] line-clamp-2 break-words">
              {truncateText(msg.content, 120)}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
