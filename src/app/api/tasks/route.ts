import { NextRequest, NextResponse } from 'next/server';
import { createTask, listTasks, validateTaskInput, type TaskStatus } from '@/lib/githubTasks';
import { isOwner } from '@/lib/ownerAuth';
import { canViewTask, getCurrentUser } from '@/lib/userAuth';

function errorMessage(e: unknown): string {
  return e instanceof Error && e.message.trim() ? e.message : 'Internal server error';
}

function parseStatus(value: string | null): TaskStatus {
  if (value === 'completed' || value === 'all') return value;
  return 'open';
}

export async function GET(req: NextRequest) {
  try {
    const status = parseStatus(req.nextUrl.searchParams.get('status'));
    const tasks = await listTasks(status);
    if (req.nextUrl.searchParams.get('scope') !== 'mine') return NextResponse.json({ tasks });

    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Login required' }, { status: 401 });
    return NextResponse.json({ tasks: tasks.filter((task) => canViewTask(user, task)) });
  } catch (e: unknown) {
    return NextResponse.json({ error: errorMessage(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    const error = validateTaskInput(data);
    if (error) return NextResponse.json({ error }, { status: 400 });

    const hasManagerFields = typeof data.assigneeId === 'string' && data.assigneeId.trim();
    const owner = hasManagerFields ? await isOwner() : false;
    const user = owner || !hasManagerFields ? null : await getCurrentUser();
    if (hasManagerFields && !owner && !user?.permissions.manageTasks) return NextResponse.json({ error: 'Only owner can assign tasks' }, { status: 401 });

    const task = await createTask({
      title: String(data.title),
      author: typeof data.author === 'string' ? data.author : undefined,
      urgency: Number(data.urgency),
      assigneeId: (owner || user?.permissions.manageTasks) && typeof data.assigneeId === 'string' ? data.assigneeId : null,
    });
    return NextResponse.json({ task }, { status: 201 });
  } catch (e: unknown) {
    return NextResponse.json({ error: errorMessage(e) }, { status: 500 });
  }
}
