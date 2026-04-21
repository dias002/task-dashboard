export type Task = {
  id: number;
  number: number;
  title: string;
  author: string;
  urgency: number;
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

export type TaskStatus = 'open' | 'completed' | 'all';

const TASK_LABEL = 'dashboard-task';
const URGENCY_PREFIX = 'urgency-';

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

function labelName(label: string | { name?: string | null }): string {
  return typeof label === 'string' ? label : label.name ?? '';
}

function parseAuthor(body: string | null): string {
  const match = body?.match(/\*\*Автор:\*\*\s*(.+)/);
  return match?.[1]?.trim() || 'Гость';
}

function parseUrgency(issue: GitHubIssue): number {
  const label = issue.labels.map(labelName).find((name) => name.startsWith(URGENCY_PREFIX));
  const urgency = Number(label?.replace(URGENCY_PREFIX, ''));
  return Number.isInteger(urgency) && urgency >= 1 && urgency <= 5 ? urgency : 3;
}

function toTask(issue: GitHubIssue): Task {
  return {
    id: issue.id,
    number: issue.number,
    title: issue.title,
    author: parseAuthor(issue.body),
    urgency: parseUrgency(issue),
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

export function validateTaskInput(data: { title?: unknown; author?: unknown; urgency?: unknown }): string | null {
  const title = typeof data.title === 'string' ? data.title.trim() : '';
  const author = typeof data.author === 'string' ? data.author.trim() : '';
  const urgency = Number(data.urgency);

  if (title.length < 3) return 'Задача должна быть не короче 3 символов';
  if (title.length > 180) return 'Задача должна быть не длиннее 180 символов';
  if (author.length > 80) return 'Имя автора должно быть не длиннее 80 символов';
  if (!Number.isInteger(urgency) || urgency < 1 || urgency > 5) return 'Срочность должна быть числом от 1 до 5';

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
    .sort((a, b) => Number(a.done) - Number(b.done) || b.urgency - a.urgency || +new Date(b.createdAt) - +new Date(a.createdAt));
}

export async function createTask(data: { title: string; author?: string; urgency: number }): Promise<Task> {
  const { repo } = getConfig();
  const author = data.author?.trim() || 'Гость';
  const urgency = Number(data.urgency);
  const issue = await github<GitHubIssue>(`/repos/${repo}/issues`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: data.title.trim(),
      body: `**Автор:** ${author}\n\n**Срочность:** ${urgency}/5\n\nСоздано через публичный дашборд.`,
      labels: [TASK_LABEL, `${URGENCY_PREFIX}${urgency}`],
    }),
  });

  return toTask(issue);
}

export async function setTaskDone(number: number, done: boolean): Promise<Task> {
  const { repo } = getConfig();
  const issue = await github<GitHubIssue>(`/repos/${repo}/issues/${number}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state: done ? 'closed' : 'open' }),
  });

  return toTask(issue);
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
