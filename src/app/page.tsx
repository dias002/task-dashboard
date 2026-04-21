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
  return ['','низкая','спокойная','средняя','важная','максимальная'][value] ?? 'средняя';
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
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [urgency, setUrgency] = useState(3);
  const [password, setPassword] = useState('');
  const [owner, setOwner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const stats = useMemo(() => {
    const open = tasks.filter((task) => !task.done).length;
    return { open, done: tasks.length - open, urgent: tasks.filter((task) => !task.done && task.urgency === 5).length };
  }, [tasks]);

  async function loadTasks() {
    setLoading(true);
    try {
      const res = await fetch('/api/tasks', { cache: 'no-store' });
      if (!res.ok) throw new Error(await apiError(res, 'Не удалось загрузить задачи'));
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

  async function createTask(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, author, urgency }),
      });
      if (!res.ok) throw new Error(await apiError(res, 'Не удалось добавить задачу'));
      const data = await res.json() as { task: Task };
      setTasks((current) => [data.task, ...current].sort((a, b) => Number(a.done) - Number(b.done) || b.urgency - a.urgency));
      setTitle('');
      setAuthor('');
      setUrgency(3);
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

  async function toggleTask(task: Task) {
    if (!owner) {
      setNotice({ type: 'error', text: 'Только владелец может отмечать выполнение' });
      return;
    }

    const nextDone = !task.done;
    setTasks((current) => current.map((item) => item.number === task.number ? { ...item, done: nextDone } : item));
    const res = await fetch(`/api/tasks/${task.number}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ done: nextDone }),
    });
    if (!res.ok) {
      setTasks((current) => current.map((item) => item.number === task.number ? task : item));
      setNotice({ type: 'error', text: await apiError(res, 'Не удалось обновить задачу') });
      return;
    }
    const data = await res.json() as { task: Task };
    setTasks((current) => current.map((item) => item.number === task.number ? data.task : item));
  }

  return (
    <main className="page">
      <section className="hero">
        <div>
          <p className="eyebrow">Публичный дашборд задач</p>
          <h1>Напишите задачу, я отмечу выполнение</h1>
          <p className="lead">Любой посетитель может добавить задачу и выбрать срочность от 1 до 5. Выполнено может поставить только владелец.</p>
        </div>
        <div className="stats">
          <div><strong>{stats.open}</strong><span>открыто</span></div>
          <div><strong>{stats.urgent}</strong><span>срочно 5/5</span></div>
          <div><strong>{stats.done}</strong><span>готово</span></div>
        </div>
      </section>

      <section className="layout">
        <aside className="side">
          <form className="panel form" onSubmit={createTask}>
            <h2>Добавить задачу</h2>
            <label><span>Задача</span><textarea value={title} onChange={(e) => setTitle(e.target.value)} maxLength={180} required placeholder="Что мне нужно сделать?" /></label>
            <label><span>Ваше имя</span><input value={author} onChange={(e) => setAuthor(e.target.value)} maxLength={80} placeholder="Гость" /></label>
            <label><span>Срочность: {urgency}/5</span><input type="range" min="1" max="5" value={urgency} onChange={(e) => setUrgency(Number(e.target.value))} /></label>
            <div className="scale"><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span></div>
            <button disabled={saving}>{saving ? 'Добавляем...' : 'Добавить'}</button>
          </form>

          <div className="panel owner">
            <h2>Владелец</h2>
            <p>{owner ? 'Можно закрывать и возвращать задачи.' : 'Войдите, чтобы отмечать выполнение.'}</p>
            {owner ? <button onClick={logout}>Выйти</button> : <form onSubmit={login}><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Пароль" required /><button>Войти</button></form>}
          </div>
          {notice && <p className={`notice ${notice.type}`}>{notice.text}</p>}
        </aside>

        <section className="panel tasks">
          <div className="tasksHead"><div><p className="eyebrow">Очередь</p><h2>Список задач</h2></div><button onClick={loadTasks}>Обновить</button></div>
          {loading ? <div className="empty">Загружаю задачи...</div> : tasks.length === 0 ? <div className="empty">Пока задач нет.</div> : (
            <div className="list">
              {tasks.map((task) => <article className={`task ${task.done ? 'done' : ''}`} key={task.id}>
                <button className="check" onClick={() => toggleTask(task)} aria-label="Переключить выполнение">{task.done ? '✓' : ''}</button>
                <div>
                  <div className="meta"><span className={`urgency u${task.urgency}`}>Срочность {task.urgency}/5 · {urgencyText(task.urgency)}</span><span>{formatDate(task.createdAt)}</span></div>
                  <h3>{task.title}</h3>
                  <p>Добавил: {task.author}</p>
                  {task.completedAt && <p>Выполнено: {formatDate(task.completedAt)}</p>}
                </div>
              </article>)}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
