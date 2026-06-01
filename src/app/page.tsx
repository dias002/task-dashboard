'use client';

import { useEffect, useMemo, useState } from 'react';

type WorkflowStatus = 'todo' | 'in-progress' | 'review' | 'completed';

type RolePermissions = {
  viewAllTasks: boolean;
  manageTasks: boolean;
  manageTeam: boolean;
};

type Role = {
  id: string;
  name: string;
  color: string;
  permissions: RolePermissions;
};

type Person = {
  id: string;
  name: string;
  roleId: string;
  handle: string;
  login: string;
  active: boolean;
  hasPassword?: boolean;
};

type TeamConfig = {
  roles: Role[];
  people: Person[];
  updatedAt: string;
};

type Task = {
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

type Notice = { type: 'ok' | 'error'; text: string } | null;

type CurrentUser = {
  id: string;
  name: string;
  login: string;
  roleName: string;
  roleColor: string;
  permissions: RolePermissions;
} | null;

const STATUS_META: Record<WorkflowStatus, { label: string; short: string; className: string }> = {
  todo: { label: 'Нужно сделать', short: 'To do', className: 'statusTodo' },
  'in-progress': { label: 'В работе', short: 'Active', className: 'statusProgress' },
  review: { label: 'Проверка', short: 'Review', className: 'statusReview' },
  completed: { label: 'Готово', short: 'Done', className: 'statusDone' },
};

const DEFAULT_TEAM: TeamConfig = {
  roles: [
    { id: 'owner', name: 'Владелец', color: '#68f4ff', permissions: { viewAllTasks: true, manageTasks: true, manageTeam: true } },
    { id: 'design', name: 'Дизайн', color: '#ff3df2', permissions: { viewAllTasks: false, manageTasks: false, manageTeam: false } },
    { id: 'dev', name: 'Разработка', color: '#b8ff4f', permissions: { viewAllTasks: false, manageTasks: false, manageTeam: false } },
    { id: 'analytics', name: 'Аналитик', color: '#ffb84f', permissions: { viewAllTasks: false, manageTasks: false, manageTeam: false } },
    { id: 'marketing', name: 'Маркетолог', color: '#497cff', permissions: { viewAllTasks: false, manageTasks: false, manageTeam: false } },
    { id: 'quality', name: 'Менеджмент качества', color: '#9d7cff', permissions: { viewAllTasks: false, manageTasks: false, manageTeam: false } },
  ],
  people: [],
  updatedAt: new Date(0).toISOString(),
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function urgencyText(value: number): string {
  return ['', 'низкая', 'спокойная', 'средняя', 'важная', 'максимальная'][value] ?? 'средняя';
}

function sortTasks(items: Task[]): Task[] {
  const statusRank: Record<WorkflowStatus, number> = { 'in-progress': 0, review: 1, todo: 2, completed: 3 };
  return [...items].sort((a, b) => statusRank[a.status] - statusRank[b.status] || b.urgency - a.urgency || +new Date(b.createdAt) - +new Date(a.createdAt));
}

async function apiError(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json() as { error?: unknown };
    if (typeof data.error === 'string') return data.error;
  } catch {}
  return fallback;
}

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [team, setTeam] = useState<TeamConfig>(DEFAULT_TEAM);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [urgency, setUrgency] = useState(3);
  const [newAssigneeId, setNewAssigneeId] = useState('');
  const [password, setPassword] = useState('');
  const [accountLogin, setAccountLogin] = useState('');
  const [accountPassword, setAccountPassword] = useState('');
  const [owner, setOwner] = useState(false);
  const [currentUser, setCurrentUser] = useState<CurrentUser>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [statusFilter, setStatusFilter] = useState<WorkflowStatus | 'all'>('all');
  const [assigneeFilter, setAssigneeFilter] = useState('all');

  const peopleById = useMemo(() => new Map(team.people.map((person) => [person.id, person])), [team.people]);
  const rolesById = useMemo(() => new Map(team.roles.map((role) => [role.id, role])), [team.roles]);
  const activePeople = useMemo(() => team.people.filter((person) => person.active), [team.people]);
  const canManageTasks = owner || Boolean(currentUser?.permissions.manageTasks);

  const stats = useMemo(() => {
    const open = tasks.filter((task) => !task.done).length;
    const progress = tasks.filter((task) => task.status === 'in-progress').length;
    const review = tasks.filter((task) => task.status === 'review').length;
    const unassigned = tasks.filter((task) => !task.assigneeId).length;
    return { open, progress, review, unassigned };
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (statusFilter !== 'all' && task.status !== statusFilter) return false;
      if (currentUser && !owner && !currentUser.permissions.viewAllTasks && !currentUser.permissions.manageTasks && task.assigneeId !== currentUser.id) return false;
      if (assigneeFilter === 'unassigned' && task.assigneeId) return false;
      if (assigneeFilter !== 'all' && assigneeFilter !== 'unassigned' && task.assigneeId !== assigneeFilter) return false;
      return true;
    });
  }, [assigneeFilter, currentUser, owner, statusFilter, tasks]);

  async function loadTeam() {
    try {
      const res = await fetch('/api/team', { cache: 'no-store' });
      if (!res.ok) throw new Error(await apiError(res, 'Не удалось загрузить команду'));
      const data = await res.json() as { team?: TeamConfig };
      setTeam(data.team ?? DEFAULT_TEAM);
    } catch (e) {
      setNotice({ type: 'error', text: e instanceof Error ? e.message : 'Ошибка загрузки команды' });
    }
  }

  async function loadTasks() {
    setLoading(true);
    try {
      const res = await fetch('/api/tasks?status=open', { cache: 'no-store' });
      if (!res.ok) throw new Error(await apiError(res, 'Не удалось загрузить задачи'));
      const data = await res.json() as { tasks?: Task[] };
      setTasks(sortTasks(data.tasks ?? []));
    } catch (e) {
      setNotice({ type: 'error', text: e instanceof Error ? e.message : 'Ошибка загрузки' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTeam();
    loadTasks();
    fetch('/api/owner').then((res) => res.json()).then((data) => setOwner(Boolean(data.owner))).catch(() => setOwner(false));
    fetch('/api/session', { cache: 'no-store' }).then((res) => res.json()).then((data) => setCurrentUser(data.user ?? null)).catch(() => setCurrentUser(null));
  }, []);

  useEffect(() => {
    if (currentUser && !owner && !currentUser.permissions.viewAllTasks && !currentUser.permissions.manageTasks) {
      setAssigneeFilter(currentUser.id);
    }
  }, [currentUser, owner]);

  async function createTask(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ title, author: author || currentUser?.name, urgency, assigneeId: canManageTasks ? newAssigneeId : undefined }),
      });
      if (!res.ok) throw new Error(await apiError(res, 'Не удалось добавить задачу'));
      const data = await res.json() as { task: Task };
      setTasks((current) => sortTasks([data.task, ...current]));
      setTitle('');
      setAuthor('');
      setUrgency(3);
      setNewAssigneeId('');
      setNotice({ type: 'ok', text: 'Задача добавлена' });
    } catch (e) {
      setNotice({ type: 'error', text: e instanceof Error ? e.message : 'Не удалось добавить задачу' });
    } finally {
      setSaving(false);
    }
  }

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setNotice(null);
    const res = await fetch('/api/owner', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      setNotice({ type: 'error', text: 'Неверный пароль владельца' });
      return;
    }
    setOwner(true);
    setPassword('');
    setNotice({ type: 'ok', text: 'Режим владельца включён' });
  }

  async function logout() {
    await fetch('/api/owner', { method: 'DELETE', credentials: 'include' });
    setOwner(false);
  }

  async function loginAccount(e: React.FormEvent) {
    e.preventDefault();
    setNotice(null);
    const res = await fetch('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ login: accountLogin, password: accountPassword }),
    });
    if (!res.ok) {
      setNotice({ type: 'error', text: await apiError(res, 'Неверный логин или пароль') });
      return;
    }
    const data = await res.json() as { user: CurrentUser };
    setCurrentUser(data.user);
    setAccountLogin('');
    setAccountPassword('');
    setNotice({ type: 'ok', text: 'Аккаунт исполнителя открыт' });
  }

  async function logoutAccount() {
    await fetch('/api/session', { method: 'DELETE', credentials: 'include' });
    setCurrentUser(null);
    setAssigneeFilter('all');
  }

  async function patchTask(task: Task, payload: Partial<Pick<Task, 'status' | 'assigneeId' | 'urgency'>> & { done?: boolean }) {
    const canEditTask = owner || currentUser?.permissions.manageTasks || task.assigneeId === currentUser?.id;
    if (!canEditTask) {
      setNotice({ type: 'error', text: 'Можно менять только свои задачи' });
      return;
    }

    const previous = tasks;
    setTasks((current) => {
      if (payload.done === true || payload.status === 'completed') return current.filter((item) => item.number !== task.number);
      return sortTasks(current.map((item) => item.number === task.number ? { ...item, ...payload, done: false } : item));
    });

    const res = await fetch(`/api/tasks/${task.number}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      setTasks(previous);
      setNotice({ type: 'error', text: await apiError(res, 'Не удалось обновить задачу') });
      return;
    }

    const data = await res.json() as { task: Task };
    setTasks((current) => data.task.done ? current.filter((item) => item.number !== task.number) : sortTasks(current.map((item) => item.number === task.number ? data.task : item)));
  }

  return (
    <main className="page">
      <section className="hero appHero">
        <div>
          <p className="eyebrow">Операционный трекер</p>
          <h1>Задачи, роли, исполнители</h1>
          <p className="lead">Публичная очередь остаётся простой, а в режиме владельца появляется управление командой, статусами и назначениями.</p>
        </div>
        <div className="stats fourStats">
          <div><strong>{stats.open}</strong><span>активные</span></div>
          <div><strong>{stats.progress}</strong><span>в работе</span></div>
          <div><strong>{stats.review}</strong><span>проверка</span></div>
          <a className="statLink" href="/admin"><strong>⚙</strong><span>админка</span></a>
        </div>
      </section>

      <nav className="shellNav">
        <a className="active" href="/">Задачи</a>
        <a href="/completed">Архив</a>
        <a href="/admin">Команда и роли</a>
      </nav>

      <section className="layout trackerLayout">
        <aside className="side">
          <form className="panel form" onSubmit={createTask}>
            <div className="panelTitleRow">
              <div>
                <p className="eyebrow smallEyebrow">Новая карточка</p>
                <h2>Добавить задачу</h2>
              </div>
            </div>
            <label><span>Задача</span><textarea value={title} onChange={(e) => setTitle(e.target.value)} maxLength={180} required placeholder="Что нужно сделать?" /></label>
            <label><span>Автор</span><input value={author} onChange={(e) => setAuthor(e.target.value)} maxLength={80} placeholder="Гость" /></label>
            {canManageTasks ? (
              <label><span>Исполнитель</span><select value={newAssigneeId} onChange={(e) => setNewAssigneeId(e.target.value)}><option value="">Не назначать</option>{activePeople.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
            ) : null}
            <label><span>Срочность: {urgency}/5</span><input type="range" min="1" max="5" value={urgency} onChange={(e) => setUrgency(Number(e.target.value))} /></label>
            <div className="scale"><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span></div>
            <button disabled={saving}>{saving ? 'Добавляем...' : 'Добавить'}</button>
          </form>

          <div className="panel owner">
            <h2>Аккаунт</h2>
            <p>{currentUser ? `Вы вошли как ${currentUser.name}.` : 'Войдите, чтобы видеть свои задачи и менять их статус.'}</p>
            {currentUser ? (
              <div className="ownerActions">
                <span className="roleChip" style={{ borderColor: currentUser.roleColor, color: currentUser.roleColor }}>{currentUser.roleName}</span>
                <button onClick={logoutAccount}>Выйти</button>
              </div>
            ) : (
              <form className="accountLogin" onSubmit={loginAccount}>
                <input value={accountLogin} onChange={(e) => setAccountLogin(e.target.value)} placeholder="Логин" required />
                <input type="password" value={accountPassword} onChange={(e) => setAccountPassword(e.target.value)} placeholder="Пароль" required />
                <button>Войти</button>
              </form>
            )}
          </div>

          <div className="panel owner">
            <h2>Владелец</h2>
            <p>{owner ? 'Можно назначать исполнителей, менять статусы и вести команду.' : 'Войдите, чтобы открыть управление задачами.'}</p>
            {owner ? (
              <div className="ownerActions">
                <a className="buttonLink" href="/admin">Админка</a>
                <button onClick={logout}>Выйти</button>
              </div>
            ) : <form onSubmit={login}><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Пароль" required /><button>Войти</button></form>}
          </div>

          <div className="panel teamMini">
            <div className="tasksHead compactHead"><div><p className="eyebrow smallEyebrow">Команда</p><h2>Исполнители</h2></div></div>
            {activePeople.length === 0 ? <p className="mutedText">Команда пока не заполнена. Добавьте людей в админке.</p> : (
              <div className="peopleStack">
                {activePeople.slice(0, 8).map((person) => {
                  const role = rolesById.get(person.roleId);
                  return <div className="personLine" key={person.id}><span className="avatarDot" style={{ backgroundColor: role?.color ?? '#68f4ff' }}>{person.name[0]}</span><div><strong>{person.name}</strong><p>{role?.name ?? 'Без роли'}</p></div></div>;
                })}
              </div>
            )}
          </div>

          {notice && <p className={`notice ${notice.type}`}>{notice.text}</p>}
        </aside>

        <section className="panel tasks trackerPanel">
          <div className="tasksHead">
            <div>
              <p className="eyebrow">Очередь</p>
              <h2>Активные задачи</h2>
            </div>
            <div className="headActions"><a href="/completed">Архив</a><button onClick={() => { loadTeam(); loadTasks(); }}>Обновить</button></div>
          </div>

          <div className="filterBar">
            <div className="segmented">
              <button className={statusFilter === 'all' ? 'active' : ''} onClick={() => setStatusFilter('all')}>Все</button>
              {(['todo', 'in-progress', 'review'] as WorkflowStatus[]).map((status) => <button className={statusFilter === status ? 'active' : ''} key={status} onClick={() => setStatusFilter(status)}>{STATUS_META[status].label}</button>)}
            </div>
            <select value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)}>
              <option value="all">Все исполнители</option>
              {currentUser ? <option value={currentUser.id}>Мои задачи</option> : null}
              <option value="unassigned">Без исполнителя</option>
              {activePeople.filter((person) => person.id !== currentUser?.id).map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
            </select>
          </div>

          {loading ? <div className="empty">Загружаю задачи...</div> : filteredTasks.length === 0 ? <div className="empty">Задач по выбранным фильтрам нет.</div> : (
            <div className="taskGrid">
              {filteredTasks.map((task) => {
                const assignee = task.assigneeId ? peopleById.get(task.assigneeId) : null;
                const role = assignee ? rolesById.get(assignee.roleId) : null;
                const canEditTask = owner || currentUser?.permissions.manageTasks || task.assigneeId === currentUser?.id;

                return (
                  <article className={`task issueCard ${task.done ? 'done' : ''}`} key={task.id}>
                    <button className="check" disabled={!canEditTask} onClick={() => patchTask(task, { done: true })} aria-label="Завершить задачу">✓</button>
                    <div className="issueContent">
                      <div className="meta">
                        <span className={`statusPill ${STATUS_META[task.status].className}`}>{STATUS_META[task.status].label}</span>
                        <span>{formatDate(task.createdAt)}</span>
                      </div>
                      <h3>{task.title}</h3>
                      <div className="issueMetaGrid">
                        <p>Автор: {task.author}</p>
                        <p>Срочность: {task.urgency}/5 · {urgencyText(task.urgency)}</p>
                        <p>Исполнитель: {assignee ? assignee.name : 'не назначен'}</p>
                        <p>Роль: {role ? role.name : '-'}</p>
                      </div>
                      <div className="chipRow">
                        <span className={`urgency u${task.urgency}`}>P{task.urgency}</span>
                        {assignee ? <span className="roleChip" style={{ borderColor: role?.color, color: role?.color }}>{assignee.name}</span> : <span className="roleChip mutedChip">Без исполнителя</span>}
                      </div>
                      {canManageTasks ? (
                        <div className="taskControls">
                          <select value={task.assigneeId ?? ''} onChange={(e) => patchTask(task, { assigneeId: e.target.value || null })}>
                            <option value="">Без исполнителя</option>
                            {activePeople.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
                          </select>
                          <select value={task.urgency} onChange={(e) => patchTask(task, { urgency: Number(e.target.value) })}>
                            {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>P{value}</option>)}
                          </select>
                          <div className="segmented compactSegment">
                            {(['todo', 'in-progress', 'review'] as WorkflowStatus[]).map((status) => <button className={task.status === status ? 'active' : ''} key={status} onClick={() => patchTask(task, { status })}>{STATUS_META[status].short}</button>)}
                          </div>
                        </div>
                      ) : canEditTask ? (
                        <div className="taskControls taskControlsSolo">
                          <div className="segmented compactSegment">
                            {(['todo', 'in-progress', 'review'] as WorkflowStatus[]).map((status) => <button className={task.status === status ? 'active' : ''} key={status} onClick={() => patchTask(task, { status })}>{STATUS_META[status].short}</button>)}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
