'use client';

import { useEffect, useMemo, useState } from 'react';

type WorkflowStatus = 'todo' | 'in-progress' | 'review' | 'completed';

type Role = {
  id: string;
  name: string;
  color: string;
};

type Person = {
  id: string;
  name: string;
  roleId: string;
  handle: string;
  active: boolean;
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

const STATUS_META: Record<WorkflowStatus, { label: string; short: string; className: string }> = {
  todo: { label: 'Нужно сделать', short: 'To do', className: 'statusTodo' },
  'in-progress': { label: 'В работе', short: 'Active', className: 'statusProgress' },
  review: { label: 'Проверка', short: 'Review', className: 'statusReview' },
  completed: { label: 'Готово', short: 'Done', className: 'statusDone' },
};

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

const ROLE_COLORS = ['#68f4ff', '#ff3df2', '#b8ff4f', '#ffb84f', '#497cff', '#9d7cff', '#ff4b6a'];

function createId(prefix: string, name: string): string {
  const base = name.trim().toLowerCase().replace(/[^a-z0-9а-яё]+/gi, '-').replace(/^-|-$/g, '').slice(0, 30);
  const suffix = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().slice(0, 6) : String(Date.now()).slice(-6);
  return `${prefix}-${base || 'item'}-${suffix}`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

async function apiError(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json() as { error?: unknown };
    if (typeof data.error === 'string') return data.error;
  } catch {}
  return fallback;
}

export default function AdminPage() {
  const [team, setTeam] = useState<TeamConfig>(DEFAULT_TEAM);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [password, setPassword] = useState('');
  const [owner, setOwner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [roleName, setRoleName] = useState('');
  const [roleColor, setRoleColor] = useState(ROLE_COLORS[0]);
  const [personName, setPersonName] = useState('');
  const [personHandle, setPersonHandle] = useState('');
  const [personRoleId, setPersonRoleId] = useState('');

  const rolesById = useMemo(() => new Map(team.roles.map((role) => [role.id, role])), [team.roles]);
  const peopleById = useMemo(() => new Map(team.people.map((person) => [person.id, person])), [team.people]);

  const stats = useMemo(() => {
    return {
      roles: team.roles.length,
      people: team.people.filter((person) => person.active).length,
      unassigned: tasks.filter((task) => !task.assigneeId).length,
      active: tasks.filter((task) => task.status === 'in-progress').length,
    };
  }, [tasks, team.people, team.roles]);

  async function loadAll() {
    setLoading(true);
    try {
      const [teamRes, tasksRes, ownerRes] = await Promise.all([
        fetch('/api/team', { cache: 'no-store' }),
        fetch('/api/tasks?status=open', { cache: 'no-store' }),
        fetch('/api/owner'),
      ]);
      if (!teamRes.ok) throw new Error(await apiError(teamRes, 'Не удалось загрузить команду'));
      if (!tasksRes.ok) throw new Error(await apiError(tasksRes, 'Не удалось загрузить задачи'));
      const teamData = await teamRes.json() as { team?: TeamConfig };
      const taskData = await tasksRes.json() as { tasks?: Task[] };
      const ownerData = await ownerRes.json() as { owner?: boolean };
      const nextTeam = teamData.team ?? DEFAULT_TEAM;
      setTeam(nextTeam);
      setTasks(taskData.tasks ?? []);
      setOwner(Boolean(ownerData.owner));
      if (!personRoleId) setPersonRoleId(nextTeam.roles[0]?.id ?? '');
    } catch (e) {
      setNotice({ type: 'error', text: e instanceof Error ? e.message : 'Ошибка загрузки админки' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    setNotice({ type: 'ok', text: 'Админ-режим включён' });
  }

  async function logout() {
    await fetch('/api/owner', { method: 'DELETE', credentials: 'include' });
    setOwner(false);
  }

  async function saveTeam(nextTeam = team, message = 'Команда сохранена') {
    if (!owner) {
      setNotice({ type: 'error', text: 'Сначала войдите как владелец' });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(nextTeam),
      });
      if (!res.ok) throw new Error(await apiError(res, 'Не удалось сохранить команду'));
      const data = await res.json() as { team: TeamConfig };
      setTeam(data.team);
      setNotice({ type: 'ok', text: message });
    } catch (e) {
      setNotice({ type: 'error', text: e instanceof Error ? e.message : 'Ошибка сохранения' });
    } finally {
      setSaving(false);
    }
  }

  function addRole(e: React.FormEvent) {
    e.preventDefault();
    const name = roleName.trim();
    if (!name) return;
    const next = { ...team, roles: [...team.roles, { id: createId('role', name), name, color: roleColor }] };
    setTeam(next);
    setRoleName('');
    saveTeam(next, 'Роль добавлена');
  }

  function removeRole(roleId: string) {
    if (team.roles.length <= 1) {
      setNotice({ type: 'error', text: 'Должна остаться хотя бы одна роль' });
      return;
    }
    const fallback = team.roles.find((role) => role.id !== roleId)?.id ?? team.roles[0].id;
    const next = {
      ...team,
      roles: team.roles.filter((role) => role.id !== roleId),
      people: team.people.map((person) => person.roleId === roleId ? { ...person, roleId: fallback } : person),
    };
    setTeam(next);
    saveTeam(next, 'Роль удалена');
  }

  function addPerson(e: React.FormEvent) {
    e.preventDefault();
    const name = personName.trim();
    if (!name) return;
    const roleId = personRoleId || team.roles[0]?.id || 'owner';
    const next = {
      ...team,
      people: [...team.people, { id: createId('person', name), name, handle: personHandle.trim(), roleId, active: true }],
    };
    setTeam(next);
    setPersonName('');
    setPersonHandle('');
    setPersonRoleId(roleId);
    saveTeam(next, 'Исполнитель добавлен');
  }

  function removePerson(personId: string) {
    const next = { ...team, people: team.people.filter((person) => person.id !== personId) };
    setTeam(next);
    saveTeam(next, 'Исполнитель удалён');
  }

  async function patchTask(task: Task, payload: Partial<Pick<Task, 'status' | 'assigneeId' | 'urgency'>> & { done?: boolean }) {
    if (!owner) {
      setNotice({ type: 'error', text: 'Сначала войдите как владелец' });
      return;
    }

    const previous = tasks;
    setTasks((current) => payload.done === true || payload.status === 'completed'
      ? current.filter((item) => item.number !== task.number)
      : current.map((item) => item.number === task.number ? { ...item, ...payload, done: false } : item)
    );

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
    setTasks((current) => data.task.done ? current.filter((item) => item.number !== task.number) : current.map((item) => item.number === task.number ? data.task : item));
  }

  return (
    <main className="page">
      <section className="hero compactHero">
        <div>
          <p className="eyebrow">Админ-панель</p>
          <h1>Команда и назначения</h1>
          <p className="lead">Создавайте роли и людей, редактируйте состав команды и назначайте задачи в одном рабочем пространстве.</p>
        </div>
        <div className="stats fourStats">
          <div><strong>{stats.roles}</strong><span>роли</span></div>
          <div><strong>{stats.people}</strong><span>люди</span></div>
          <div><strong>{stats.unassigned}</strong><span>без исполнителя</span></div>
          <a className="statLink" href="/"><strong>←</strong><span>к задачам</span></a>
        </div>
      </section>

      <nav className="shellNav">
        <a href="/">Задачи</a>
        <a href="/completed">Архив</a>
        <a className="active" href="/admin">Команда и роли</a>
      </nav>

      <section className="adminWorkspace">
        <aside className="side adminSide">
          <div className="panel owner">
            <h2>Доступ</h2>
            <p>{owner ? 'Можно сохранять команду и назначать задачи.' : 'Войдите, чтобы редактировать админ-панель.'}</p>
            {owner ? <button onClick={logout}>Выйти</button> : <form onSubmit={login}><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Пароль" required /><button>Войти</button></form>}
          </div>
          {notice && <p className={`notice ${notice.type}`}>{notice.text}</p>}
        </aside>

        <section className="adminMain">
          <div className="adminGrid">
            <div className="panel adminPanel">
              <div className="tasksHead">
                <div><p className="eyebrow smallEyebrow">Роли</p><h2>Матрица ролей</h2></div>
                <button disabled={!owner || saving} onClick={() => saveTeam()}>{saving ? 'Сохраняю...' : 'Сохранить'}</button>
              </div>
              <form className="inlineForm" onSubmit={addRole}>
                <input disabled={!owner} value={roleName} onChange={(e) => setRoleName(e.target.value)} placeholder="Например: QA" />
                <input aria-label="Цвет роли" className="colorInput" disabled={!owner} type="color" value={roleColor} onChange={(e) => setRoleColor(e.target.value)} />
                <button disabled={!owner || !roleName.trim()}>Добавить роль</button>
              </form>
              <div className="editableList">
                {team.roles.map((role) => <div className="editableRow" key={role.id}>
                  <span className="roleColor" style={{ backgroundColor: role.color }} />
                  <input disabled={!owner} value={role.name} onChange={(e) => setTeam((current) => ({ ...current, roles: current.roles.map((item) => item.id === role.id ? { ...item, name: e.target.value } : item) }))} />
                  <input aria-label="Цвет роли" className="colorInput" disabled={!owner} type="color" value={role.color} onChange={(e) => setTeam((current) => ({ ...current, roles: current.roles.map((item) => item.id === role.id ? { ...item, color: e.target.value } : item) }))} />
                  <button className="danger" disabled={!owner || team.roles.length <= 1} onClick={() => removeRole(role.id)}>Удалить</button>
                </div>)}
              </div>
            </div>

            <div className="panel adminPanel">
              <div className="tasksHead">
                <div><p className="eyebrow smallEyebrow">Люди</p><h2>Исполнители</h2></div>
                <button disabled={!owner || saving} onClick={() => saveTeam()}>{saving ? 'Сохраняю...' : 'Сохранить'}</button>
              </div>
              <form className="inlineForm personForm" onSubmit={addPerson}>
                <input disabled={!owner} value={personName} onChange={(e) => setPersonName(e.target.value)} placeholder="Имя" />
                <input disabled={!owner} value={personHandle} onChange={(e) => setPersonHandle(e.target.value)} placeholder="@username или контакт" />
                <select disabled={!owner} value={personRoleId || team.roles[0]?.id || ''} onChange={(e) => setPersonRoleId(e.target.value)}>
                  {team.roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
                </select>
                <button disabled={!owner || !personName.trim()}>Добавить</button>
              </form>
              <div className="editableList">
                {team.people.length === 0 ? <div className="empty compactEmpty">Исполнителей пока нет.</div> : team.people.map((person) => {
                  const role = rolesById.get(person.roleId);
                  return <div className="editableRow personEditRow" key={person.id}>
                    <span className="avatarDot" style={{ backgroundColor: role?.color ?? '#68f4ff' }}>{person.name[0] || '?'}</span>
                    <input disabled={!owner} value={person.name} onChange={(e) => setTeam((current) => ({ ...current, people: current.people.map((item) => item.id === person.id ? { ...item, name: e.target.value } : item) }))} />
                    <input disabled={!owner} value={person.handle} onChange={(e) => setTeam((current) => ({ ...current, people: current.people.map((item) => item.id === person.id ? { ...item, handle: e.target.value } : item) }))} placeholder="@handle" />
                    <select disabled={!owner} value={person.roleId} onChange={(e) => setTeam((current) => ({ ...current, people: current.people.map((item) => item.id === person.id ? { ...item, roleId: e.target.value } : item) }))}>
                      {team.roles.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                    <label className="toggleLine"><input disabled={!owner} type="checkbox" checked={person.active} onChange={(e) => setTeam((current) => ({ ...current, people: current.people.map((item) => item.id === person.id ? { ...item, active: e.target.checked } : item) }))} /> Активен</label>
                    <button className="danger" disabled={!owner} onClick={() => removePerson(person.id)}>Удалить</button>
                  </div>;
                })}
              </div>
            </div>
          </div>

          <section className="panel adminPanel assignmentPanel">
            <div className="tasksHead">
              <div><p className="eyebrow smallEyebrow">Назначение</p><h2>Очередь задач</h2></div>
              <button onClick={loadAll}>Обновить</button>
            </div>
            {loading ? <div className="empty">Загружаю админ-панель...</div> : tasks.length === 0 ? <div className="empty">Открытых задач нет.</div> : (
              <div className="assignmentList">
                {tasks.map((task) => {
                  const assignee = task.assigneeId ? peopleById.get(task.assigneeId) : null;
                  const role = assignee ? rolesById.get(assignee.roleId) : null;
                  return <article className="assignmentRow" key={task.id}>
                    <div className="assignmentInfo">
                      <div className="meta">
                        <span className={`statusPill ${STATUS_META[task.status].className}`}>{STATUS_META[task.status].label}</span>
                        <span>P{task.urgency}</span>
                        <span>{formatDate(task.createdAt)}</span>
                      </div>
                      <h3>{task.title}</h3>
                      <p>{assignee ? `Назначено: ${assignee.name} · ${role?.name ?? 'роль не задана'}` : 'Исполнитель не назначен'}</p>
                    </div>
                    <div className="assignmentControls">
                      <select disabled={!owner} value={task.assigneeId ?? ''} onChange={(e) => patchTask(task, { assigneeId: e.target.value || null })}>
                        <option value="">Без исполнителя</option>
                        {team.people.filter((person) => person.active).map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
                      </select>
                      <select disabled={!owner} value={task.urgency} onChange={(e) => patchTask(task, { urgency: Number(e.target.value) })}>
                        {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>P{value}</option>)}
                      </select>
                      <div className="segmented compactSegment">
                        {(['todo', 'in-progress', 'review'] as WorkflowStatus[]).map((status) => <button disabled={!owner} className={task.status === status ? 'active' : ''} key={status} onClick={() => patchTask(task, { status })}>{STATUS_META[status].short}</button>)}
                      </div>
                      <button disabled={!owner} onClick={() => patchTask(task, { done: true })}>Готово</button>
                    </div>
                  </article>;
                })}
              </div>
            )}
          </section>
        </section>
      </section>
    </main>
  );
}
