import { NextRequest, NextResponse } from 'next/server';
import { getTeamConfig, saveTeamConfig } from '@/lib/githubTasks';
import { isOwner } from '@/lib/ownerAuth';

function errorMessage(e: unknown): string {
  return e instanceof Error && e.message.trim() ? e.message : 'Internal server error';
}

export async function GET() {
  try {
    return NextResponse.json({ team: await getTeamConfig() });
  } catch (e: unknown) {
    return NextResponse.json({ error: errorMessage(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!(await isOwner())) return NextResponse.json({ error: 'Only owner can manage team' }, { status: 401 });

    const data = await req.json();
    const team = await saveTeamConfig(data);
    return NextResponse.json({ team });
  } catch (e: unknown) {
    return NextResponse.json({ error: errorMessage(e) }, { status: 500 });
  }
}
