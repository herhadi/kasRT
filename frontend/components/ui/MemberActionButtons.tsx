'use client';

import Button from './Button';

type MemberActionButtonsProps = {
  isActive: boolean;
  disabled?: boolean;
  onToggle: () => void;
  onSaveStart?: () => void;
};

export default function MemberActionButtons({ isActive, disabled = false, onToggle, onSaveStart }: MemberActionButtonsProps) {
  return (
    <div className={`member-action-buttons ${onSaveStart ? 'member-action-buttons-with-save' : 'member-action-buttons-toggle-only'}`}>
      {onSaveStart ? (
        <Button type="button" variant="ghost" className="member-action-button member-action-button-save" onClick={onSaveStart} disabled={disabled}>
          Simpan Mulai
        </Button>
      ) : null}
      <Button type="button" variant="ghost" className={`member-action-button ${isActive ? 'member-action-button-disable' : 'member-action-button-enable'}`} onClick={onToggle} disabled={disabled}>
        {isActive ? 'Nonaktifkan' : 'Aktifkan'}
      </Button>
    </div>
  );
}
