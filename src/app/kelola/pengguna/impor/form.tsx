'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from '@/components/use-form';
import { toCsv } from '@/lib/csv';
import { Notice } from '../../ui';
import { commitImport, previewImport, type ImportState } from './actions';

const HEADER = ['nama', 'nomor_induk', 'hp', 'email', 'holding', 'unit', 'jabatan', 'atasan_nomor_induk'];

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function ImportForm() {
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState('');
  const [prev, previewAction, previewing] = useForm<ImportState>(previewImport, {});
  const [done, commitAction, committing] = useForm<ImportState>(commitImport, {});

  async function pick(f: File | undefined) {
    if (!f) return;
    setFileName(f.name);
    setCsv(await f.text());
  }

  if (done.result) {
    const { created, failed } = done.result;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Notice ok={`${created.length} pengguna dibuat${failed.length ? `, ${failed.length} bermasalah` : ''}.`} />
        {created.length > 0 && (
          <div className="alert info" style={{ flexDirection: 'column' }}>
            <b>Unduh daftar kata sandi sementara sekarang.</b>
            <span>Daftar ini tidak bisa dibuka lagi setelah halaman ditutup. Kalau hilang, reset kata sandi satu per satu.</span>
            <button
              type="button"
              className="btn"
              onClick={() =>
                download(
                  'kata-sandi-sementara.csv',
                  toCsv([['nomor_induk', 'nama', 'masuk_dengan', 'holding', 'kata_sandi_sementara'], ...created.map((c) => [c.employeeNo, c.name, c.login, c.holding, c.password])]),
                )
              }
            >
              Unduh daftar kata sandi (CSV)
            </button>
          </div>
        )}
        {failed.length > 0 && (
          <div>
            <b>Baris yang gagal</b>
            <ul>{failed.map((f) => <li key={f.line}>Baris {f.line} ({f.employeeNo}): {f.problem}</li>)}</ul>
          </div>
        )}
        <Link className="btn sec" href="/kelola/pengguna" style={{ alignSelf: 'flex-start' }}>Kembali ke daftar</Link>
      </div>
    );
  }

  const p = prev.preview;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="alert info" style={{ flexDirection: 'column' }}>
        <span>Kolom: <b>{HEADER.join(', ')}</b>. Kolom hp atau email boleh salah satu. Kolom holding diisi PPL, SIB, BJO, atau BOS. Maksimal 300 baris.</span>
        <span>Jika hp dan email sama-sama diisi, hp dipakai untuk masuk dan email disimpan sebagai kontak.</span>
        <button
          type="button"
          className="btn sec"
          style={{ alignSelf: 'flex-start' }}
          onClick={() => download('templat-pengguna.csv', toCsv([HEADER, ['Budi Santoso', 'SIB-0142', '081234567890', '', 'SIB', 'Gudang', 'Staf Gudang', 'SIB-0100']]))}
        >
          Unduh templat
        </button>
      </div>

      <form method="post" onSubmit={previewAction} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Notice error={prev.error} />
        <label className="field">
          <span>File CSV</span>
          <input className="input" type="file" accept=".csv,text/csv" onChange={(e) => pick(e.target.files?.[0])} style={{ paddingTop: 12 }} />
        </label>
        <input type="hidden" name="csv" value={csv} />
        <button className="btn" type="submit" disabled={previewing || !csv} style={{ alignSelf: 'flex-start' }}>
          {previewing ? 'Memeriksa...' : 'Periksa file'}
        </button>
      </form>

      {p && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Notice error={done.error} />
          <p style={{ margin: 0 }}>
            <b>{fileName}</b>: <span className="chip ok">{p.valid} siap disimpan</span>{' '}
            {p.invalid > 0 && <span className="chip bad">{p.invalid} bermasalah</span>}
          </p>
          {p.invalid > 0 && (
            <div className="alert err" style={{ flexDirection: 'column' }}>
              <b>Baris bermasalah (tidak akan disimpan)</b>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {p.rows.filter((r) => r.problems.length > 0).map((r) => (
                  <li key={r.line}>Baris {r.line}{r.employeeNo ? ` (${r.employeeNo})` : ''}: {r.problems.join(' ')}</li>
                ))}
              </ul>
              <span>Perbaiki file lalu periksa lagi, atau simpan baris yang sudah benar saja.</span>
            </div>
          )}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 14 }}>
              <thead>
                <tr>{['Baris', 'Nama', 'Nomor induk', 'Masuk dengan', 'Holding', 'Unit', 'Jabatan', 'Atasan', 'Status'].map((h) => <th key={h} style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '2px solid var(--line)' }}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {p.rows.map((r) => (
                  <tr key={r.line} style={{ borderBottom: '1px solid var(--line)' }}>
                    <td style={{ padding: '6px 8px' }}>{r.line}</td>
                    <td style={{ padding: '6px 8px' }}>{r.name}</td>
                    <td style={{ padding: '6px 8px' }}>{r.employeeNo}</td>
                    <td style={{ padding: '6px 8px' }}>{r.login}</td>
                    <td style={{ padding: '6px 8px' }}>{r.holding}</td>
                    <td style={{ padding: '6px 8px' }}>{r.unit}</td>
                    <td style={{ padding: '6px 8px' }}>{r.jobTitle}</td>
                    <td style={{ padding: '6px 8px' }}>{r.managerNo}</td>
                    <td style={{ padding: '6px 8px' }}><span className={`chip ${r.problems.length ? 'bad' : 'ok'}`}>{r.problems.length ? 'Bermasalah' : 'Siap'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {p.valid > 0 && (
            <form method="post" onSubmit={commitAction}>
              <input type="hidden" name="csv" value={csv} />
              <button className="btn" type="submit" disabled={committing} style={{ minHeight: 52 }}>
                {committing ? 'Menyimpan...' : `Simpan ${p.valid} pengguna`}
              </button>
            </form>
          )}
        </section>
      )}
    </div>
  );
}
