'use client';
import { startTransition, useActionState, useEffect, useRef, type FormEvent } from 'react';

// Pengganti <form action={...}> untuk server action dengan useActionState.
// React 19 mengosongkan formulir setelah aksi selesai, termasuk saat gagal, sehingga ketikan pengguna hilang.
// Di sini formulir dikirim lewat onSubmit, jadi isian tetap ada kecuali resetOnOk dan aksi berhasil.
export function useForm<S>(action: (prev: S, fd: FormData) => Promise<S>, initial: S, opts: { resetOnOk?: boolean } = {}) {
  const [state, dispatch, pending] = useActionState(
    action as (prev: Awaited<S>, fd: FormData) => Promise<Awaited<S>>,
    initial as Awaited<S>,
  );
  const form = useRef<HTMLFormElement | null>(null);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    form.current = e.currentTarget;
    const sub = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    const fd = new FormData(e.currentTarget, sub);
    startTransition(() => (dispatch as (p: FormData) => void)(fd));
  }
  useEffect(() => {
    if (opts.resetOnOk && (state as { ok?: string } | null)?.ok) form.current?.reset();
  }, [state, opts.resetOnOk]);

  return [state as S, onSubmit, pending] as const;
}
