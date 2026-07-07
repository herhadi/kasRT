'use client';

import type { CSSProperties } from 'react';

type MemberActionButtonsProps = {
  isActive: boolean;
  disabled?: boolean;
  onToggle: () => void;
};

const buttonStyle: CSSProperties = {
  minHeight: '34px',
  minWidth: '98px',
  borderRadius: '8px',
  borderWidth: '1px',
  borderStyle: 'solid',
  padding: '6px 12px',
  fontSize: '12px',
  fontWeight: 700,
  lineHeight: '18px',
  cursor: 'pointer'
};

const enableStyle: CSSProperties = { ...buttonStyle, borderColor: '#86efac', background: '#f0fdf4', color: '#166534' };
const disableStyle: CSSProperties = { ...buttonStyle, borderColor: '#fda4af', background: '#fff1f2', color: '#9f1239' };

export default function MemberActionButtons({ isActive, disabled = false, onToggle }: MemberActionButtonsProps) {
  return (
    <div className="inline-flex justify-end">
      <button type="button" style={isActive ? disableStyle : enableStyle} onClick={onToggle} disabled={disabled}>
        {isActive ? 'Nonaktifkan' : 'Aktifkan'}
      </button>
    </div>
  );
}
