// Illustrated card faces (spec §16). Every card shows its name or value and its
// own symbol, so colour is never the only way to tell cards apart.

import type { ReactNode } from 'react';
import { cardName, type Card, type CardKind } from '../engine';

const ICONS: Record<string, ReactNode> = {
  money: (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="24" r="19" fill="rgba(255,255,255,.22)" stroke="currentColor" strokeWidth="3" />
      <circle cx="24" cy="24" r="13.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 3" />
      <text x="24" y="32" textAnchor="middle" fontSize="23" fontWeight="900" fill="currentColor">
        $
      </text>
    </svg>
  ),
  bankrupt: (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M24 5 4 17v4h40v-4z" fill="currentColor" />
      <path d="M8 24h6v14H8zm13 0h6v14h-6zm13 0h6v14h-6z" fill="currentColor" />
      <path d="M4 40h40v4H4z" fill="currentColor" />
      <path d="m27 3-6 13 7 4-7 11 6 4-5 11" fill="none" stroke="#2a0606" strokeWidth="3.4" strokeLinejoin="round" />
    </svg>
  ),
  vault_lock: (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M14 22v-7a10 10 0 0 1 20 0v7" fill="none" stroke="currentColor" strokeWidth="5" />
      <rect x="8" y="21" width="32" height="23" rx="5" fill="currentColor" />
      <circle cx="24" cy="30" r="3.6" fill="#16283d" />
      <path d="M22.4 31h3.2l1.2 8h-5.6z" fill="#16283d" />
    </svg>
  ),
  bank_thief: (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M17 6h14l-3 8h-8z" fill="currentColor" />
      <path d="M20 14h8c9 5 13 13 13 20 0 7-6 10-17 10S7 41 7 34c0-7 4-15 13-20z" fill="currentColor" />
      <rect x="18" y="13" width="12" height="3.4" rx="1.7" fill="#3b1c00" />
      <text x="24" y="38" textAnchor="middle" fontSize="19" fontWeight="900" fill="#3b1c00">
        $
      </text>
    </svg>
  ),
  sheriff: (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path
        d="m24 3 5.6 12.6L43 17.2l-10 9.2 2.8 13.6L24 33l-11.8 7 2.8-13.6-10-9.2 13.4-1.6z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <circle cx="24" cy="23" r="5.5" fill="#06302d" />
    </svg>
  ),
};

ICONS.bank_swap = (
  <svg viewBox="0 0 48 48" aria-hidden="true">
    <path d="M6 16h28" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
    <path d="m28 7 10 9-10 9" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M42 33H14" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
    <path d="m20 24-10 9 10 9" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

ICONS.lawyer = (
  <svg viewBox="0 0 48 48" aria-hidden="true">
    <path d="M24 6v34" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    <path d="M8 13h32" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    <path d="M14 43h20" fill="none" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" />
    <path d="m10 14-6 13a6.5 6.5 0 0 0 12 0zM38 14l-6 13a6.5 6.5 0 0 0 12 0z" fill="currentColor" />
    <circle cx="24" cy="7" r="3.4" fill="currentColor" />
  </svg>
);

const SUBTITLE: Record<CardKind, string> = {
  money: 'MONEY',
  bankrupt: 'ATTACK',
  vault_lock: 'DEFENSE',
  bank_thief: 'ATTACK',
  sheriff: 'DEFENSE',
  bank_swap: 'ATTACK',
  lawyer: 'DEFENSE',
};

type Props = {
  card?: Card; // omit for a face-down card
  size?: 'lg' | 'sm' | 'xs';
  selected?: boolean;
  onClick?: () => void;
  label?: string;
};

export function CardView({ card, size = 'lg', selected, onClick, label }: Props) {
  if (!card) {
    return (
      <span className={`card card--${size} card--back`} aria-hidden="true">
        <span className="card__face">
          <span className="card__backmark">B</span>
        </span>
      </span>
    );
  }

  const style = card.kind === 'money' ? `money${card.value}` : card.kind;
  const name = cardName(card);
  const className = `card card--${size} card--${style}${selected ? ' is-selected' : ''}`;
  const face = (
    <span className="card__face">
      <span className="card__corner">{card.kind === 'money' ? card.value : name[0]}</span>
      <span className="card__icon">{ICONS[card.kind]}</span>
      <span className="card__title">{name}</span>
      <span className="card__sub">{SUBTITLE[card.kind]}</span>
    </span>
  );
  const accessibleName = label ?? (card.kind === 'money' ? `${name} money card` : `${name} card`);

  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick} aria-pressed={selected} aria-label={accessibleName}>
        {face}
      </button>
    );
  }
  return (
    <span className={className} role="img" aria-label={accessibleName}>
      {face}
    </span>
  );
}
