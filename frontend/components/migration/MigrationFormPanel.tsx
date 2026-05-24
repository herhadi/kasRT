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
  year?: number;
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
  year = 2025,
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
        year={year}
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
        // sosial is global (no warga) but needs year for month grid
        // @ts-ignore pass year
        year={year}
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
        year={year}
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
