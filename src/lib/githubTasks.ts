import { randomUUID } from 'crypto';

export type WorkflowStatus = 'todo' | 'in-progress' | 'review' | 'completed';

export type Role = {
  id: string;
  name: string;
  color: string;
};

export type Person = {
  id: string;
  name: string;
  roleId: string;
  handle: string;
  active: boolean;
};

export type TeamConfig = {
  roles: Role[];
  people: Person[];
  updatedAt: string;
};

export type Task = {
  id: number;
  number: number;
  title: string;
  author: string;
  urgency: number;
  status: WorkflowStatus;
  assigneeId: string | null;
  done: boolean;
  createdAt: string;
  completedAt: string | null;
  url: string;
};

type GitHubIssue = {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  created_at: string;
  closed_at: string | null;
  html_url: string;
  labels: Array<string | { name?: string | null }>;
  pull_request?: unknown;
};

type TaskMeta = {
  author?: string;
  urgency?: number;
  status?: WorkflowStatus;
  assigneeId?: string | null;
};

export type TaskStatus = 'open' | 'completed' | 'all';

const TASK_LABEL = 'dashboard-task';
const CONFIG_LABEL = 'dashboard-config';
const CONFIG_TITLE = 'Task Dashboard Team Config';
const URGENCY_PREFIX = 'urgency-';
const TASK_META_RE = /<!--\s*task-dashboard-meta\s*([\s\S]*?)\s*-->/;
const CONFIG_META_RE = /<!--\s*task-dashboard-config\s*([\s\S]*?)\s*-->/;

export const WORKFLOW_STATUSES: Array<{ id: WorkflowStatus; label: string }> = [
  { id: 'todo', label: 'Нужно сделать' },
  { id: 'in-progress', label: 'В работе' },
  { id: 'review', label: 'Проверка' },
  { id: 'completed', label: 'Готово' },
];

const DEFAULT_TEAM: TeamConfig = {
  roles: [
    { id: 'owner', name: 'Владелец', color: '#68f4ff' },
    { id: 'design', name: 'Дизайн', color: '#ff3df2' },
    { id: 'dev', name: 'Разработка', color: '#b8ff4f' },
    { id: 'analytics', name: 'Аналитик', color: '#ffb84f' },
    { id: 'marketing', name: 'Маркетолог', color: '#497cff' },
    { id: 'quality', name: 'Менеджмент качества', color: '#9d7cff' },
  ],
  people: [],
  updatedAt: new Date(0).toISOString(),
};

function getConfig() {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;
  if (!token) throw new Error('GITHUB_TOKEN is not configured');
  if (!repo) throw new Error('GITHUB_REPO is not configured');
  return { token, repo };
}

async function github<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { token } = getConfig();
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.headers ?? {}),
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API error ${res.status}: ${text.slice(0, 240)}`);
  }

  return res.json() as Promise<T>;
}

async function ensureLabel(name: string, color: string, description: string): Promise<void> {
  const { repo } = getConfig();
  try {
    await github(`/repos/${repo}/labels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, color, description }),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : '';
    if (!message.includes('422')) throw e;
  }
}

function labelName(label: string | { name?: string | null }): string {
  return typeof label === 'string' ? label : label.name ?? '';
}

function normalizeWorkflowStatus(value: unknown): WorkflowStatus {
  if (value === 'in-progress' || value === 'review' || value === 'completed') return value;
  return 'todo';
}

function parseJsonBlock<T>(body: string | null, marker: RegExp): T | null {
  const match = body?.match(marker);
  if (!match?.[1]) return null;

  try {
    return JSON.parse(match[1]) as T;
  } catch {
    return null;
  }
}

function parseAuthor(body: string | null): string {
  const meta = parseJsonBlock<TaskMeta>(body, TASK_META_RE);
  if (typeof meta?.author === 'string' && meta.author.trim()) return meta.author.trim();

  const match = body?.match(/\*\*Автор:\*\*\s*(.+)/);
  return match?.[1]?.trim() || 'Гость';
}

function parseUrgency(issue: GitHubIssue): number {
  const meta = parseJsonBlock<TaskMeta>(issue.body, TASK_META_RE);
  if (Number.isInteger(meta?.urgency) && Number(meta?.urgency) >= 1 && Number(meta?.urgency) <= 5) return Number(meta?.urgency);

  const label = issue.labels.map(labelName).find((name) => name.startsWith(URGENCY_PREFIX));
  const urgency = Number(label?.replace(URGENCY_PREFIX, ''));
  return Number.isInteger(urgency) && urgency >= 1 && urgency <= 5 ? urgency : 3;
}

function parseAssigneeId(body: string | null): string | null {
  const meta = parseJsonBlock<TaskMeta>(body, TASK_META_RE);
  return typeof meta?.assigneeId === 'string' && meta.assigneeId.trim() ? meta.assigneeId.trim() : null;
}

function parseTaskStatus(issue: GitHubIssue): WorkflowStatus {
  if (issue.state === 'closed') return 'completed';

  const meta = parseJsonBlock<TaskMeta>(issue.body, TASK_META_RE);
  return normalizeWorkflowStatus(meta?.status);
}

function taskMeta(issue: GitHubIssue): Required<TaskMeta> {
  return {
    author: parseAuthor(issue.body),
    urgency: parseUrgency(issue),
    status: parseTaskStatus(issue),
    assigneeId: parseAssigneeId(issue.body),
  };
}

function buildTaskBody(meta: Required<TaskMeta>): string {
  const assignee = meta.assigneeId || 'Не назначен';
  const statusLabel = WORKFLOW_STATUSES.find((item) => item.id === meta.status)?.label ?? 'Нужно сделать';

  return [
    `**Автор:** ${meta.author}`,
    `**Срочность:** ${meta.urgency}/5`,
    `**Статус:** ${statusLabel}`,
    `**Исполнитель:** ${assignee}`,
    '',
    'Создано через публичный дашборд.',
    '',
    `<!-- task-dashboard-meta ${JSON.stringify(meta)} -->`,
  ].join('\n');
}

function toTask(issue: GitHubIssue): Task {
  const meta = taskMeta(issue);

  return {
    id: issue.id,
    number: issue.number,
    title: issue.title,
    author: meta.author,
    urgency: meta.urgency,
    status: issue.state === 'closed' ? 'completed' : meta.status,
    assigneeId: meta.assigneeId,
    done: issue.state === 'closed',
    createdAt: issue.created_at,
    completedAt: issue.closed_at,
    url: issue.html_url,
  };
}

function githubState(status: TaskStatus): 'open' | 'closed' | 'all' {
  if (status === 'completed') return 'closed';
  if (status === 'open') return 'open';
  return 'all';
}

function workflowRank(status: WorkflowStatus): number {
  if (status === 'in-progress') return 0;
  if (status === 'review') return 1;
  if (status === 'todo') return 2;
  return 3;
}

export function validateTaskInput(data: { title?: unknown; author?: unknown; urgency?: unknown; assigneeId?: unknown }): string | null {
  const title = typeof data.title === 'string' ? data.title.trim() : '';
  const author = typeof data.author === 'string' ? data.author.trim() : '';
  const urgency = Number(data.urgency);

  if (title.length < 3) return 'Задача должна быть не короче 3 символов';
  if (title.length > 180) return 'Задача должна быть не длиннее 180 символов';
  if (author.length > 80) return 'Имя автора должно быть не длиннее 80 символов';
  if (!Number.isInteger(urgency) || urgency < 1 || urgency > 5) return 'Срочность должна быть числом от 1 до 5';
  if (data.assigneeId != null && typeof data.assigneeId !== 'string') return 'Исполнитель указан неверно';

  return null;
}

export async function listTasks(status: TaskStatus = 'open'): Promise<Task[]> {
  const { repo } = getConfig();
  const issues = await github<GitHubIssue[]>(
    `/repos/${repo}/issues?state=${githubState(status)}&labels=${encodeURIComponent(TASK_LABEL)}&per_page=100`
  );

  return issues
    .filter((issue) => !issue.pull_request)
    .map(toTask)
    .sort((a, b) => Number(a.done) - Number(b.done) || workflowRank(a.status) - workflowRank(b.status) || b.urgency - a.urgency || +new Date(b.createdAt) - +new Date(a.createdAt));
}

export async function createTask(data: { title: string; author?: string; urgency: number; assigneeId?: string | null }): Promise<Task> {
  const { repo } = getConfig();
  const author = data.author?.trim() || 'Гость';
  const urgency = Number(data.urgency);
  const meta: Required<TaskMeta> = {
    author,
    urgency,
    status: 'todo',
    assigneeId: data.assigneeId?.trim() || null,
  };

  await ensureLabel(TASK_LABEL, '68f4ff', 'Tasks created from the public dashboard');
  await ensureLabel(`${URGENCY_PREFIX}${urgency}`, urgency >= 5 ? 'ff4b6a' : urgency >= 4 ? 'ff3df2' : '68f4ff', `Urgency ${urgency}/5`);

  const issue = await github<GitHubIssue>(`/repos/${repo}/issues`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: data.title.trim(),
      body: buildTaskBody(meta),
      labels: [TASK_LABEL, `${URGENCY_PREFIX}${urgency}`],
    }),
  });

  return toTask(issue);
}

export async function updateTask(
  number: number,
  data: { done?: boolean; status?: WorkflowStatus; assigneeId?: string | null; urgency?: number }
): Promise<Task> {
  const { repo } = getConfig();
  const issue = await github<GitHubIssue>(`/repos/${repo}/issues/${number}`);
  const previous = taskMeta(issue);
  const nextStatus = data.done === true ? 'completed' : data.done === false && previous.status === 'completed' ? 'todo' : normalizeWorkflowStatus(data.status ?? previous.status);
  const nextUrgency = Number.isInteger(data.urgency) && Number(data.urgency) >= 1 && Number(data.urgency) <= 5 ? Number(data.urgency) : previous.urgency;
  const nextMeta: Required<TaskMeta> = {
    author: previous.author,
    urgency: nextUrgency,
    status: nextStatus === 'completed' ? 'completed' : nextStatus,
    assigneeId: data.assigneeId === undefined ? previous.assigneeId : data.assigneeId?.trim() || null,
  };

  await ensureLabel(TASK_LABEL, '68f4ff', 'Tasks created from the public dashboard');
  await ensureLabel(`${URGENCY_PREFIX}${nextUrgency}`, nextUrgency >= 5 ? 'ff4b6a' : nextUrgency >= 4 ? 'ff3df2' : '68f4ff', `Urgency ${nextUrgency}/5`);

  const labels = issue.labels
    .map(labelName)
    .filter((name) => name && name !== TASK_LABEL && !name.startsWith(URGENCY_PREFIX));

  const updated = await github<GitHubIssue>(`/repos/${repo}/issues/${number}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      state: nextStatus === 'completed' ? 'closed' : 'open',
      body: buildTaskBody(nextMeta),
      labels: [TASK_LABEL, `${URGENCY_PREFIX}${nextUrgency}`, ...labels],
    }),
  });

  return toTask(updated);
}

export async function setTaskDone(number: number, done: boolean): Promise<Task> {
  return updateTask(number, { done });
}

export async function deleteCompletedTask(number: number): Promise<void> {
  const { repo } = getConfig();
  const issue = await github<GitHubIssue>(`/repos/${repo}/issues/${number}`);
  if (issue.state !== 'closed') throw new Error('Удалять можно только выполненные задачи');

  const labels = issue.labels
    .map(labelName)
    .filter((name) => name && name !== TASK_LABEL && !name.startsWith(URGENCY_PREFIX));

  await github<GitHubIssue>(`/repos/${repo}/issues/${number}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ labels }),
  });
}

function safeId(prefix: string, value?: string): string {
  const normalized = value?.trim().toLowerCase().replace(/[^a-z0-9а-яё]+/gi, '-').replace(/^-|-$/g, '').slice(0, 40);
  return `${prefix}-${normalized || randomUUID().slice(0, 8)}`;
}

function validColor(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value.trim()) ? value.trim() : fallback;
}

function sanitizeTeamConfig(data: Partial<TeamConfig>): TeamConfig {
  const roles = Array.isArray(data.roles) ? data.roles : [];
  const people = Array.isArray(data.people) ? data.people : [];
  const normalizedRoles = roles
    .map((role) => ({
      id: typeof role.id === 'string' && role.id.trim() ? role.id.trim().slice(0, 60) : safeId('role', role.name),
      name: typeof role.name === 'string' ? role.name.trim().slice(0, 50) : '',
      color: validColor(role.color, '#68f4ff'),
    }))
    .filter((role) => role.name);

  const roleIds = new Set(normalizedRoles.map((role) => role.id));
  const fallbackRoleId = normalizedRoles[0]?.id ?? 'owner';
  const normalizedPeople = people
    .map((person) => ({
      id: typeof person.id === 'string' && person.id.trim() ? person.id.trim().slice(0, 60) : safeId('person', person.name),
      name: typeof person.name === 'string' ? person.name.trim().slice(0, 60) : '',
      roleId: typeof person.roleId === 'string' && roleIds.has(person.roleId) ? person.roleId : fallbackRoleId,
      handle: typeof person.handle === 'string' ? person.handle.trim().slice(0, 60) : '',
      active: person.active !== false,
    }))
    .filter((person) => person.name);

  return {
    roles: normalizedRoles.length ? normalizedRoles.slice(0, 16) : DEFAULT_TEAM.roles,
    people: normalizedPeople.slice(0, 80),
    updatedAt: new Date().toISOString(),
  };
}

function buildConfigBody(config: TeamConfig): string {
  return [
    'Service issue for Task Dashboard team settings.',
    '',
    'Do not edit this issue manually unless you know the JSON schema.',
    '',
    `<!-- task-dashboard-config ${JSON.stringify(config)} -->`,
  ].join('\n');
}

async function findTeamConfigIssue(): Promise<GitHubIssue | null> {
  const { repo } = getConfig();
  const issues = await github<GitHubIssue[]>(
    `/repos/${repo}/issues?state=open&labels=${encodeURIComponent(CONFIG_LABEL)}&per_page=10`
  );

  return issues.find((issue) => !issue.pull_request && issue.title === CONFIG_TITLE) ?? issues.find((issue) => !issue.pull_request) ?? null;
}

export async function getTeamConfig(): Promise<TeamConfig> {
  const issue = await findTeamConfigIssue();
  const parsed = parseJsonBlock<Partial<TeamConfig>>(issue?.body ?? null, CONFIG_META_RE);
  if (!parsed) return { ...DEFAULT_TEAM, updatedAt: new Date().toISOString() };
  return sanitizeTeamConfig(parsed);
}

export async function saveTeamConfig(data: Partial<TeamConfig>): Promise<TeamConfig> {
  const { repo } = getConfig();
  const next = sanitizeTeamConfig(data);
  const issue = await findTeamConfigIssue();

  await ensureLabel(CONFIG_LABEL, '497cff', 'Service issue with dashboard team settings');

  if (!issue) {
    await github<GitHubIssue>(`/repos/${repo}/issues`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: CONFIG_TITLE,
        body: buildConfigBody(next),
        labels: [CONFIG_LABEL],
      }),
    });
    return next;
  }

  await github<GitHubIssue>(`/repos/${repo}/issues/${issue.number}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: CONFIG_TITLE,
      body: buildConfigBody(next),
      labels: [CONFIG_LABEL],
    }),
  });

  return next;
}
