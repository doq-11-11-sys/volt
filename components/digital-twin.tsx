'use client';
import { useState, type FormEvent } from 'react';
import { Activity, AlertTriangle, Box, Cable, Check, ClipboardCheck, Gauge, MapPin, Package, QrCode, ShieldCheck, Wrench, X } from 'lucide-react';
import type { PortalState, Ticket } from '@/lib/portal-types';

type ActionKind = 'inspection' | 'material' | 'energy' | 'permit' | 'incident';
const conditionLabel: Record<string, string> = { normal: 'Исправно', attention: 'Требует внимания', repair: 'В ремонте' };
const actionMeta: Record<ActionKind, { title: string; subtitle: string }> = {
  inspection: { title: 'Новый обход', subtitle: 'Зафиксируйте результат осмотра оборудования' },
  material: { title: 'Материал на складе', subtitle: 'Добавьте остаток или обновите карточку материала' },
  energy: { title: 'Показания электроэнергии', subtitle: 'Запишите показания по объекту учёта' },
  permit: { title: 'Новый наряд-допуск', subtitle: 'Создайте документ для безопасного выполнения работ' },
  incident: { title: 'Сообщение об аварии', subtitle: 'Передайте информацию диспетчеру' },
};

export default function DigitalTwin({ data, tickets }: { data: PortalState; tickets: Ticket[] }) {
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState<ActionKind | null>(null);
  const equipment = data.equipment;
  const overdue = tickets.filter(t => !['closed', 'cancelled'].includes(t.status) && t.due_date < new Date().toISOString().slice(0, 10));
  const active = tickets.filter(t => !['closed', 'cancelled'].includes(t.status));
  const nodes = equipment.slice(0, 8);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!action) return;
    const form = new FormData(event.currentTarget);
    const firstEquipment = equipment[0];
    const responsible = data.people.find(p => p.role === 'electrician');
    const payload: Record<string, unknown> = Object.fromEntries(form.entries());
    if (action === 'inspection') Object.assign(payload, { equipment_id: form.get('equipment_id') || firstEquipment?.id, status: 'passed' });
    if (action === 'material') Object.assign(payload, { stock: Number(payload.stock), min_stock: Number(payload.min_stock) });
    if (action === 'energy') Object.assign(payload, { reading_kwh: Number(payload.reading_kwh) });
    if (action === 'permit') Object.assign(payload, { number: `НД-${Date.now().toString().slice(-6)}`, responsible_id: form.get('responsible_id') || responsible?.id, status: 'draft' });
    if (action === 'incident') Object.assign(payload, { severity: 'high', status: 'open' });
    setBusy(true);
    try {
      const response = await fetch('/api/portal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: `create_${action}`, data: payload }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Операция не выполнена');
      setAction(null);
      window.location.reload();
    } catch (error) { window.alert(error instanceof Error ? error.message : 'Операция не выполнена'); } finally { setBusy(false); }
  }

  return <div className="digital-twin-page">
    <div className="twin-kpis"><div className="panel twin-kpi"><Box size={20}/><span>Объекты в модели</span><strong>{equipment.length}</strong></div><div className="panel twin-kpi"><AlertTriangle size={20}/><span>Требуют внимания</span><strong className="text-orange">{overdue.length + equipment.filter(e => e.condition !== 'normal').length}</strong></div><div className="panel twin-kpi"><Activity size={20}/><span>Активные работы</span><strong>{active.length}</strong></div><div className="panel twin-kpi"><Gauge size={20}/><span>Готовность обходов</span><strong>{equipment.length ? '0%' : '—'}</strong></div></div>
    <div className="twin-layout"><section className="panel twin-scene-panel"><div className="panel-heading"><div><h2>3D-модель электрослужбы</h2><p>Нажмите на объект, чтобы открыть его паспорт и историю обслуживания.</p></div><div className="twin-legend"><span className="legend-normal"/>Исправно <span className="legend-attention"/>Внимание <span className="legend-repair"/>Ремонт</div></div><div className="twin-scene" aria-label="Интерактивная 3D-модель объекта"><div className="twin-building"><div className="twin-roof"/><div className="twin-floor floor-one"/><div className="twin-floor floor-two"/><div className="twin-floor floor-three"/></div>{nodes.map((item, i) => <button key={item.id} className={`twin-node node-${i} node-${item.condition}`} title={`${item.code} · ${conditionLabel[item.condition]}`} onClick={() => window.location.assign('/equipment')}><span/><b>{item.code}</b></button>)}{!nodes.length && <div className="twin-empty"><Box size={34}/><strong>Модель пока пустая</strong><span>Добавьте оборудование, чтобы разместить его на объекте.</span></div>}</div><div className="twin-scene-actions"><button><MapPin size={16}/>Проблемные зоны</button><button><Cable size={16}/>Кабельные трассы</button><button onClick={() => setAction('inspection')}><Wrench size={16}/>Маршрут обхода</button></div></section>
      <aside className="twin-side"><section className="panel"><div className="panel-heading"><div><h2>Фильтры модели</h2><p>Слои и зоны отображения</p></div></div><div className="twin-filters"><label><input type="checkbox" defaultChecked/>Оборудование</label><label><input type="checkbox" defaultChecked/>Аварийные заявки</label><label><input type="checkbox"/>Кабельные трассы</label><label><input type="checkbox"/>ППР на 30 дней</label><label><input type="checkbox"/>Энергопотребление</label></div></section><section className="panel"><div className="panel-heading"><div><h2>Быстрые действия</h2><p>Оперативная работа на объекте</p></div></div><div className="twin-actions"><button disabled={busy} onClick={() => window.location.assign('/equipment')}><QrCode size={17}/><span><strong>Сканировать QR</strong><small>Открыть паспорт оборудования</small></span></button><button disabled={busy} onClick={() => setAction('inspection')}><ClipboardCheck size={17}/><span><strong>Начать обход</strong><small>Запустить чек-лист осмотра</small></span></button><button disabled={busy} onClick={() => setAction('material')}><Package size={17}/><span><strong>Проверить материалы</strong><small>Резерв и остатки по заявкам</small></span></button><button disabled={busy} onClick={() => setAction('permit')}><ShieldCheck size={17}/><span><strong>Наряд-допуск</strong><small>Создать электронный допуск</small></span></button><button disabled={busy} onClick={() => setAction('energy')}><Gauge size={17}/><span><strong>Внести показания</strong><small>Записать расход электроэнергии</small></span></button><button disabled={busy} onClick={() => setAction('incident')}><AlertTriangle size={17}/><span><strong>Сообщить об аварии</strong><small>Создать аварийное обращение</small></span></button></div></section></aside></div>
    <section className="panel twin-roadmap"><div className="panel-heading"><div><h2>Центр решений портала</h2><p>Функции для цифровой эксплуатации объекта.</p></div></div><div className="solution-grid">{[['QR и NFC-паспорта','Доступ к оборудованию и истории работ',QrCode],['Мобильные обходы','Чек-листы, фото, показания и подпись',ClipboardCheck],['Энергомониторинг','Потребление и отклонения',Gauge],['Аварийный центр','Уведомление и контроль реакции',AlertTriangle],['Склад материалов','Резервирование и списание',Package],['Наряды-допуски','Электронный допуск',ShieldCheck]].map(([title, text, Icon]) => <article key={String(title)}><span><Icon size={18}/></span><h3>{String(title)}</h3><p>{String(text)}</p></article>)}</div></section>
    {action && <div className="twin-modal-backdrop" role="presentation"><section className="twin-modal" role="dialog" aria-modal="true"><button className="twin-modal-close" onClick={() => setAction(null)} aria-label="Закрыть"><X size={18}/></button><div className="twin-modal-icon"><Check size={20}/></div><h2>{actionMeta[action].title}</h2><p>{actionMeta[action].subtitle}</p><form onSubmit={submit} className="twin-form">
      {action === 'inspection' && <><label>Оборудование<select name="equipment_id" required>{equipment.map(e => <option key={e.id} value={e.id}>{e.code} · {e.name}</option>)}</select></label><label>Чек-лист осмотра<textarea name="checklist" required defaultValue="Корпус, индикация, нагрев, соединения"/></label><label>Результат<select name="status" defaultValue="passed"><option value="passed">Исправно</option><option value="attention">Есть замечания</option><option value="failed">Неисправно</option></select></label></>}
      {action === 'material' && <><label>Название материала<input name="name" required placeholder="Автоматический выключатель"/></label><div className="twin-form-grid"><label>Артикул<input name="code" required placeholder="MAT-001"/></label><label>Единица<input name="unit" required defaultValue="шт."/></label></div><div className="twin-form-grid"><label>Остаток<input name="stock" type="number" min="0" step="0.01" required defaultValue="0"/></label><label>Минимум<input name="min_stock" type="number" min="0" step="0.01" required defaultValue="1"/></label></div></>}
      {action === 'energy' && <><label>Объект учёта<input name="location" required placeholder="Главный корпус"/></label><label>Показания, кВт·ч<input name="reading_kwh" type="number" min="0" step="0.01" required placeholder="0"/></label><label>Дата<input name="recorded_at" type="date" required defaultValue={new Date().toISOString().slice(0,10)}/></label></>}
      {action === 'permit' && <><label>Место работ<input name="location" required placeholder="ТП-1, ячейка 6 кВ"/></label><label>Вид работ<input name="work_type" required placeholder="Ремонт и проверка оборудования"/></label><label>Ответственный<select name="responsible_id" required>{data.people.filter(p => p.role === 'electrician').map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Срок действия<input name="valid_until" type="date" required defaultValue={new Date(Date.now()+86400000).toISOString().slice(0,10)}/></label></>}
      {action === 'incident' && <><label>Описание аварии<input name="title" required placeholder="Отключение вводного автомата"/></label><label>Место аварии<input name="location" required placeholder="Корпус, этаж, помещение"/></label></>}
      <button className="primary-button twin-submit" disabled={busy} type="submit">{busy ? 'Сохранение…' : 'Сохранить запись'}</button>
    </form></section></div>}
  </div>;
}
