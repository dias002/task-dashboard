import { NextRequest, NextResponse } from 'next/server';
import { getTeamConfig, publicTeamConfig, saveTeamConfig } from '@/lib/githubTasks';
import { isOwner } from '@/lib/ownerAuth';
import { getCurrentUser } from '@/lib/userAuth';

function errorMessage(e: unknown): string {
  return e instanceof Error && e.message.trim() ? e.message : 'Internal server error';
}

export async function GET() {
  try {
    return NextResponse.json({ team: publicTeamConfig(await getTeamConfig()) });
  } catch (e: unknown) {
    return NextResponse.json({ error: errorMessage(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const owner = await isOwner();
    const user = owner ? null : await getCurrentUser();
    if (!owner && !user?.permissions.manageTeam) return NextResponse.json({ error: 'Only owner can manage team' }, { status: 401 });

    const data = await req.json();
    const team = await saveTeamConfig(data);
    return NextResponse.json({ team: publicTeamConfig(team) });
  } catch (e: unknown) {
    return NextResponse.json({ error: errorMessage(e) }, { status: 500 });
  }
}
