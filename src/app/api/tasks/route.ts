import { NextRequest, NextResponse } from 'next/server';
import { createTask, listTasks, validateTaskInput } from '@/lib/githubTasks';

function errorMessage(e: unknown): string {
  return e instanceof Error && e.message.trim() ? e.message : 'Internal server error';
}

export async function GET() {
  try {
    return NextResponse.json({ tasks: await listTasks() });
  } catch (e: unknown) {
    return NextResponse.json({ error: errorMessage(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    const error = validateTaskInput(data);
    if (error) return NextResponse.json({ error }, { status: 400 });

    const task = await createTask({
      title: String(data.title),
      author: typeof data.author === 'string' ? data.author : undefined,
      urgency: Number(data.urgency),
    });
    return NextResponse.json({ task }, { status: 201 });
  } catch (e: unknown) {
    return NextResponse.json({ error: errorMessage(e) }, { status: 500 });
  }
}
