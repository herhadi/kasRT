'use client';

import MigrationIuranWargaForm from '@/components/migration/MigrationIuranWargaForm';
import MigrationSosialForm from '@/components/migration/MigrationSosialForm';
import MigrationWargaAmountForm from '@/components/migration/MigrationWargaAmountForm';
import {
  isFormAmountMigrationModule,
  type MigrationFormModule
} from '@/lib/migration2025';

type WargaOption = { id: string; nama: string; no_hp?: string };

type Props = {
  moduleKey: MigrationFormModule;
  wargaOptions: WargaOption[];
  selectedWargaId: string;
  onWargaChange: (wargaId: string) => void;
  busy: boolean;
  onBusyChange: (busy: boolean) => void;
  onSaved: () => void | Promise<void>;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
};

export default function MigrationFormPanel({
  moduleKey,
  wargaOptions,
  selectedWargaId,
  onWargaChange,
  busy,
  onBusyChange,
  onSaved,
  onError,
  onSuccess
}: Props) {
  if (moduleKey === 'iuran-2025') {
    return (
      <MigrationIuranWargaForm
        wargaOptions={wargaOptions}
        selectedWargaId={selectedWargaId}
        onWargaChange={onWargaChange}
        busy={busy}
        onBusyChange={onBusyChange}
        onSaved={onSaved}
        onError={onError}
        onSuccess={onSuccess}
      />
    );
  }

  if (moduleKey === 'sosial-2025') {
    return (
      <MigrationSosialForm
        busy={busy}
        onBusyChange={onBusyChange}
        onSaved={onSaved}
        onError={onError}
        onSuccess={onSuccess}
      />
    );
  }

  if (isFormAmountMigrationModule(moduleKey)) {
    return (
      <MigrationWargaAmountForm
        moduleKey={moduleKey}
        wargaOptions={wargaOptions}
        selectedWargaId={selectedWargaId}
        onWargaChange={onWargaChange}
        busy={busy}
        onBusyChange={onBusyChange}
        onSaved={onSaved}
        onError={onError}
        onSuccess={onSuccess}
      />
    );
  }

  return null;
}
