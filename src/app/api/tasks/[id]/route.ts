import { NextRequest, NextResponse } from 'next/server';
import { deleteCompletedTask, updateTask, type WorkflowStatus } from '@/lib/githubTasks';
import { isOwner } from '@/lib/ownerAuth';

type Ctx = { params: Promise<{ id: string }> };

function errorMessage(e: unknown): string {
  return e instanceof Error && e.message.trim() ? e.message : 'Internal server error';
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    if (!(await isOwner())) return NextResponse.json({ error: 'Only owner can update tasks' }, { status: 401 });

    const { id } = await params;
    const data = await req.json();
    const task = await updateTask(Number(id), {
      done: typeof data.done === 'boolean' ? data.done : undefined,
      status: typeof data.status === 'string' ? data.status as WorkflowStatus : undefined,
      assigneeId: typeof data.assigneeId === 'string' || data.assigneeId === null ? data.assigneeId : undefined,
      urgency: Number.isInteger(Number(data.urgency)) ? Number(data.urgency) : undefined,
    });
    return NextResponse.json({ task });
  } catch (e: unknown) {
    return NextResponse.json({ error: errorMessage(e) }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    if (!(await isOwner())) return NextResponse.json({ error: 'Only owner can delete completed tasks' }, { status: 401 });

    const { id } = await params;
    await deleteCompletedTask(Number(id));
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: errorMessage(e) }, { status: 500 });
  }
}
