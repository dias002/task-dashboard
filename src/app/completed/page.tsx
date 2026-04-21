'use client';

import { useEffect, useMemo, useState } from 'react';

type Task = {
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

type Notice = { type: 'ok' | 'error'; text: string } | null;

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function urgencyText(value: number): string {
  return ['', 'низкая', 'спокойная', 'средняя', 'важная', 'максимальная'][value] ?? 'средняя';
}

async function apiError(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json() as { error?: unknown };
    if (typeof data.error === 'string') return data.error;
  } catch {}
  return fallback;
}

export default function CompletedPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [password, setPassword] = useState('');
  const [owner, setOwner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice>(null);

  const stats = useMemo(() => {
    return { completed: tasks.length, urgent: tasks.filter((task) => task.urgency === 5).length };
  }, [tasks]);

  async function loadTasks() {
    setLoading(true);
    try {
      const res = await fetch('/api/tasks?status=completed', { cache: 'no-store' });
      if (!res.ok) throw new Error(await apiError(res, 'Не удалось загрузить выполненные задачи'));
      const data = await res.json() as { tasks?: Task[] };
      setTasks(data.tasks ?? []);
    } catch (e) {
      setNotice({ type: 'error', text: e instanceof Error ? e.message : 'Ошибка загрузки' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTasks();
    fetch('/api/owner').then((res) => res.json()).then((data) => setOwner(Boolean(data.owner))).catch(() => setOwner(false));
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
    setNotice({ type: 'ok', text: 'Режим владельца включён' });
  }

  async function logout() {
    await fetch('/api/owner', { method: 'DELETE', credentials: 'include' });
    setOwner(false);
  }

  async function restoreTask(task: Task) {
    if (!owner) {
      setNotice({ type: 'error', text: 'Только владелец может возвращать задачи' });
      return;
    }

    const res = await fetch(`/api/tasks/${task.number}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ done: false }),
    });
    if (!res.ok) {
      setNotice({ type: 'error', text: await apiError(res, 'Не удалось вернуть задачу') });
      return;
    }
    setTasks((current) => current.filter((item) => item.number !== task.number));
    setNotice({ type: 'ok', text: 'Задача возвращена в открытые' });
  }

  async function deleteTask(task: Task) {
    if (!owner) {
      setNotice({ type: 'error', text: 'Только владелец может удалять выполненные задачи' });
      return;
    }
    if (!confirm('Удалить выполненную задачу из дашборда?')) return;

    const res = await fetch(`/api/tasks/${task.number}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (!res.ok) {
      setNotice({ type: 'error', text: await apiError(res, 'Не удалось удалить задачу') });
      return;
    }
    setTasks((current) => current.filter((item) => item.number !== task.number));
    setNotice({ type: 'ok', text: 'Задача удалена из дашборда' });
  }

  return (
    <main className="page">
      <section className="hero compactHero">
        <div>
          <p className="eyebrow">Архив выполнения</p>
          <h1>Выполненные задачи</h1>
          <p className="lead">Здесь лежат закрытые задачи. Владелец может вернуть задачу в очередь или удалить её из дашборда.</p>
        </div>
        <div className="stats">
          <a className="statLink" href="/"><strong>←</strong><span>открытые</span></a>
          <div><strong>{stats.completed}</strong><span>выполнено</span></div>
          <div><strong>{stats.urgent}</strong><span>были 5/5</span></div>
        </div>
      </section>

      <section className="layout singleLayout">
        <aside className="side">
          <div className="panel owner">
            <h2>Владелец</h2>
            <p>{owner ? 'Можно удалить выполненные задачи или вернуть их в очередь.' : 'Войдите, чтобы управлять архивом.'}</p>
            {owner ? <button onClick={logout}>Выйти</button> : <form onSubmit={login}><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Пароль" required /><button>Войти</button></form>}
          </div>
          {notice && <p className={`notice ${notice.type}`}>{notice.text}</p>}
        </aside>

        <section className="panel tasks">
          <div className="tasksHead"><div><p className="eyebrow">Готово</p><h2>Архив задач</h2></div><div className="headActions"><a href="/">Открытые</a><button onClick={loadTasks}>Обновить</button></div></div>
          {loading ? <div className="empty">Загружаю выполненные задачи...</div> : tasks.length === 0 ? <div className="empty">Выполненных задач пока нет.</div> : (
            <div className="list">
              {tasks.map((task) => <article className="task done" key={task.id}>
                <button className="check" onClick={() => restoreTask(task)} aria-label="Вернуть задачу">↺</button>
                <div>
                  <div className="meta"><span className={`urgency u${task.urgency}`}>Срочность {task.urgency}/5 · {urgencyText(task.urgency)}</span><span>{task.completedAt ? formatDate(task.completedAt) : formatDate(task.createdAt)}</span></div>
                  <h3>{task.title}</h3>
                  <p>Добавил: {task.author}</p>
                  <div className="taskActions">
                    <button onClick={() => restoreTask(task)}>Вернуть</button>
                    <button className="danger" onClick={() => deleteTask(task)}>Удалить</button>
                  </div>
                </div>
              </article>)}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
