// Tipe bersama untuk dialog Permissions (dipakai server dan klien).
export type PermKind = 'board' | 'library' | 'playbook' | 'course';
export type PermRow = { type: 'unit' | 'group' | 'user'; value: string; label: string };
// all = baris "Semua pengguna" di holding itu berstatus Pembaca. Bila false dan rows kosong: Tanpa akses.
export type PermHolding = { id: string; name: string; all: boolean; rows: PermRow[]; locked?: boolean };
export type PermState = { holdings: PermHolding[]; writers: { id: string; label: string }[] };
export type PermOptions = {
  kind: PermKind;
  nodeLabel: string;
  units: Record<string, string[]>;
  groups: { id: string; name: string; holding: string; holdingName: string }[];
  admins: { id: string; name: string; employeeNo: string }[];
  canWriters: boolean;
};
// Isi yang dikirim ke server (kolom "izin").
export type PermPayload = { holdings: { id: string; all: boolean; rows: { type: string; value: string }[] }[]; writers: string[] | null };
