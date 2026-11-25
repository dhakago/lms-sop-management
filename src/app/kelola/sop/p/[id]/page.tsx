import { redirect } from 'next/navigation';

export default async function Lama({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/sop/p/${id}`);
}
