import { NextRequest, NextResponse } from 'next/server';
import { setTaskDone } from '@/lib/githubTasks';
import { isOwner } from '@/lib/ownerAuth';

type Ctx = { params: Promise<{ id: string }> };

function errorMessage(e: unknown): string {
  return e instanceof Error && e.message.trim() ? e.message : 'Internal server error';
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    if (!(await isOwner())) return NextResponse.json({ error: 'Only owner can complete tasks' }, { status: 401 });

    const { id } = await params;
    const data = await req.json();
    const task = await setTaskDone(Number(id), Boolean(data.done));
    return NextResponse.json({ task });
  } catch (e: unknown) {
    return NextResponse.json({ error: errorMessage(e) }, { status: 500 });
  }
}
