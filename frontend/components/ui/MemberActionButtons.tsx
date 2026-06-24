'use client';

import type { CSSProperties } from 'react';

type MemberActionButtonsProps = {
  isActive: boolean;
  disabled?: boolean;
  onToggle: () => void;
  onSaveStart?: () => void;
};

const gridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(112px, 1fr))',
  gap: '8px',
  minWidth: '232px'
};

const buttonStyle: CSSProperties = {
  minHeight: '34px',
  width: '100%',
  borderRadius: '8px',
  borderWidth: '1px',
  borderStyle: 'solid',
  padding: '6px 10px',
  fontSize: '12px',
  fontWeight: 700,
  lineHeight: '18px',
  cursor: 'pointer'
};

const saveStyle: CSSProperties = { ...buttonStyle, borderColor: '#cbd5e1', background: '#f1f5f9', color: '#334155' };
const enableStyle: CSSProperties = { ...buttonStyle, borderColor: '#86efac', background: '#f0fdf4', color: '#166534' };
const disableStyle: CSSProperties = { ...buttonStyle, borderColor: '#fda4af', background: '#fff1f2', color: '#9f1239' };

export default function MemberActionButtons({ isActive, disabled = false, onToggle, onSaveStart }: MemberActionButtonsProps) {
  return (
    <div style={gridStyle}>
      {onSaveStart ? (
        <button type="button" style={saveStyle} onClick={onSaveStart} disabled={disabled}>
          Simpan Mulai
        </button>
      ) : null}
      <button type="button" style={{ ...(isActive ? disableStyle : enableStyle), gridColumn: onSaveStart ? undefined : 2 }} onClick={onToggle} disabled={disabled}>
        {isActive ? 'Nonaktifkan' : 'Aktifkan'}
      </button>
    </div>
  );
}
