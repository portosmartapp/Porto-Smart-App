import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { getT } from '../i18n/translations';
import { getEgyptTodayIsoDate, normalizeToEgyptDateString } from '../utils/egyptTime';
import {
  Chalet,
  HousekeepingStatus,
  HousekeepingTask,
  HousekeepingTaskType,
  Language,
  MaintenancePriority,
  MaintenanceStatus,
  MaintenanceTicket,
  MutationResult,
} from '../types/platform';

interface HousekeepingViewProps {
  tasks: HousekeepingTask[];
  chalets: Chalet[];
  lang: Language;
  canAssign: boolean;
  onCreateTask: (task: HousekeepingTask) => Promise<MutationResult | void> | MutationResult | void;
  onUpdateTaskStatus: (taskId: string, status: HousekeepingStatus) => Promise<MutationResult | void> | MutationResult | void;
}

export const HousekeepingView: React.FC<HousekeepingViewProps> = ({
  tasks,
  chalets,
  lang,
  canAssign,
  onCreateTask,
  onUpdateTaskStatus,
}) => {
  const t = getT(lang);
  const isAr = lang === 'ar';
  const [showCreate, setShowCreate] = useState(false);
  const [savingTask, setSavingTask] = useState(false);
  const [taskError, setTaskError] = useState('');
  const [chaletId, setChaletId] = useState(chalets[0]?.id || '');
  const [taskType, setTaskType] = useState<HousekeepingTaskType>('checkout_cleaning');
  const [assignedName, setAssignedName] = useState('Mona Ibrahim');
  const [notes, setNotes] = useState('');

  const chaletMap = new Map(chalets.map((c) => [c.id, c]));

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between">
        <div className="text-xs text-slate-600">
          {isAr
            ? 'جدول مهام التنظيف وتغيير المفروشات وفحص الجودة'
            : 'Housekeeping queue: check-out cleanings, deep cleans, and linen turns'}
        </div>
        {canAssign && (
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-cyan-800 hover:bg-cyan-900 text-white text-xs font-semibold rounded-lg cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t.actions.addTask}</span>
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-start">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                <th className="py-3 px-4 text-start font-semibold">{isAr ? 'الشاليه' : 'Chalet'}</th>
                <th className="py-3 px-4 text-start font-semibold">{isAr ? 'نوع المهمة' : 'Task Type'}</th>
                <th className="py-3 px-4 text-start font-semibold">{isAr ? 'الموظف المكلف' : 'Assigned To'}</th>
                <th className="py-3 px-4 text-start font-semibold">{isAr ? 'التاريخ' : 'Date'}</th>
                <th className="py-3 px-4 text-start font-semibold">{isAr ? 'ملاحظات' : 'Notes'}</th>
                <th className="py-3 px-4 text-start font-semibold">{isAr ? 'الحالة' : 'Status'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tasks.map((task) => (
                <tr key={task.id} className="hover:bg-slate-50/70">
                  <td className="py-3 px-4 font-mono-num font-semibold text-slate-900">
                    {chaletMap.get(task.chaletId)?.chaletNumber || '-'}
                  </td>
                  <td className="py-3 px-4 text-slate-800">{t.taskTypes[task.taskType]}</td>
                  <td className="py-3 px-4 text-slate-700">{task.assignedName || '-'}</td>
                  <td className="py-3 px-4 font-mono-num text-slate-500">
                    {task.completedAt
                      ? normalizeToEgyptDateString(task.completedAt)
                      : normalizeToEgyptDateString(task.scheduledDate)}
                  </td>
                  <td className="py-3 px-4 text-slate-600 max-w-xs truncate">{task.notes}</td>
                  <td className="py-3 px-4">
                    <select
                      value={task.status}
                      onChange={(e) =>
                        onUpdateTaskStatus(task.id, e.target.value as HousekeepingStatus)
                      }
                      className="px-2.5 py-1.5 border border-slate-300 rounded-md bg-white text-xs font-medium"
                    >
                      {(['pending', 'in_progress', 'needs_inspection', 'completed'] as const).map(
                        (st) => (
                          <option key={st} value={st}>
                            {t.status[st]}
                          </option>
                        )
                      )}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (savingTask) return;
              setTaskError('');
              setSavingTask(true);
              try {
                const res = await onCreateTask({
                  id: `hk-${Date.now()}`,
                  chaletId: chaletId || chalets[0]?.id || '',
                  taskType,
                  status: 'pending',
                  assignedName,
                  notes,
                  scheduledDate: getEgyptTodayIsoDate(),
                  completedAt: null,
                  isDemo: false,
                });
                if (res && !res.ok) {
                  setTaskError(res.error || (isAr ? 'تعذر حفظ مهمة التنظيف.' : 'Failed to create task.'));
                  return;
                }
                setNotes('');
                setShowCreate(false);
              } finally {
                setSavingTask(false);
              }
            }}
            className="bg-white w-full max-w-md rounded-xl border border-slate-200 shadow-xl"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900">{t.actions.addTask}</h3>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-3 text-sm">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {isAr ? 'الشاليه' : 'Chalet'}
                </label>
                <select
                  value={chaletId}
                  onChange={(e) => setChaletId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  {chalets.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.chaletNumber}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {isAr ? 'نوع المهمة' : 'Task Type'}
                </label>
                <select
                  value={taskType}
                  onChange={(e) => setTaskType(e.target.value as HousekeepingTaskType)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  {(Object.keys(t.taskTypes) as HousekeepingTaskType[]).map((tt) => (
                    <option key={tt} value={tt}>
                      {t.taskTypes[tt]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {isAr ? 'اسم الموظف' : 'Assigned Employee'}
                </label>
                <input
                  required
                  value={assignedName}
                  onChange={(e) => setAssignedName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {isAr ? 'ملاحظات التنظيف' : 'Cleaning Notes'}
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
            </div>
            {taskError && (
              <div className="mx-6 mb-3 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
                {taskError}
              </div>
            )}
            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-2">
              <button
                type="button"
                disabled={savingTask}
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 text-xs font-semibold border border-slate-300 rounded-lg bg-white text-slate-700 cursor-pointer"
              >
                {t.actions.cancel}
              </button>
              <button
                type="submit"
                disabled={savingTask}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-cyan-800 text-white hover:bg-cyan-900 cursor-pointer disabled:opacity-60"
              >
                {savingTask ? (isAr ? 'جاري الحفظ...' : 'Saving...') : t.actions.save}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

interface MaintenanceViewProps {
  tickets: MaintenanceTicket[];
  chalets: Chalet[];
  lang: Language;
  onCreateTicket: (ticket: MaintenanceTicket) => Promise<MutationResult | void> | MutationResult | void;
  onUpdateTicket: (ticketId: string, status: MaintenanceStatus, cost?: number) => Promise<MutationResult | void> | MutationResult | void;
}

const PRIORITY_COLOR: Record<MaintenancePriority, string> = {
  low: 'text-slate-600',
  medium: 'text-cyan-800',
  high: 'text-amber-700',
  emergency: 'text-red-700 font-bold',
};

export const MaintenanceView: React.FC<MaintenanceViewProps> = ({
  tickets,
  chalets,
  lang,
  onCreateTicket,
  onUpdateTicket,
}) => {
  const t = getT(lang);
  const isAr = lang === 'ar';
  const [showCreate, setShowCreate] = useState(false);
  const [savingTicket, setSavingTicket] = useState(false);
  const [ticketError, setTicketError] = useState('');
  const [chaletId, setChaletId] = useState(chalets[0]?.id || '');
  const [problemType, setProblemType] = useState('HVAC / Air Conditioning');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<MaintenancePriority>('medium');
  const [technicianName, setTechnicianName] = useState('Eng. Mahmoud Sayed');
  const [cost, setCost] = useState(0);

  const chaletMap = new Map(chalets.map((c) => [c.id, c]));

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between">
        <div className="text-xs text-slate-600">
          {isAr
            ? 'بلاغات الصيانة الفنية وتتبع التكلفة وأولوية التنفيذ'
            : 'Maintenance ticketing, technician assignment, and repair cost tracking'}
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-cyan-800 hover:bg-cyan-900 text-white text-xs font-semibold rounded-lg cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>{t.actions.addTicket}</span>
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-start">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                <th className="py-3 px-4 text-start font-semibold">{isAr ? 'الشاليه' : 'Chalet'}</th>
                <th className="py-3 px-4 text-start font-semibold">{isAr ? 'المشكلة' : 'Problem'}</th>
                <th className="py-3 px-4 text-start font-semibold">{isAr ? 'الأولوية' : 'Priority'}</th>
                <th className="py-3 px-4 text-start font-semibold">{isAr ? 'الفني' : 'Technician'}</th>
                <th className="py-3 px-4 text-start font-semibold">{isAr ? 'التكلفة' : 'Cost'}</th>
                <th className="py-3 px-4 text-start font-semibold">{isAr ? 'الحالة' : 'Status'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tickets.map((tk) => (
                <tr key={tk.id} className="hover:bg-slate-50/70">
                  <td className="py-3 px-4 font-mono-num font-semibold text-slate-900">
                    {chaletMap.get(tk.chaletId)?.chaletNumber || '-'}
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-semibold text-slate-900">{tk.problemType}</div>
                    <div className="text-slate-500 max-w-xs truncate">{tk.description}</div>
                  </td>
                  <td className={`py-3 px-4 font-medium ${PRIORITY_COLOR[tk.priority]}`}>
                    {t.priority[tk.priority]}
                  </td>
                  <td className="py-3 px-4 text-slate-700">{tk.technicianName || '-'}</td>
                  <td className="py-3 px-4 font-mono-num font-semibold text-slate-900">
                    {tk.cost.toLocaleString()} {t.currency}
                  </td>
                  <td className="py-3 px-4">
                    <select
                      value={tk.status}
                      onChange={(e) =>
                        onUpdateTicket(tk.id, e.target.value as MaintenanceStatus)
                      }
                      className="px-2.5 py-1.5 border border-slate-300 rounded-md bg-white text-xs font-medium"
                    >
                      {(['open', 'assigned', 'in_progress', 'completed', 'closed'] as const).map(
                        (st) => (
                          <option key={st} value={st}>
                            {t.status[st]}
                          </option>
                        )
                      )}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (savingTicket) return;
              setTicketError('');
              setSavingTicket(true);
              try {
                const res = await onCreateTicket({
                  id: `mnt-${Date.now()}`,
                  chaletId: chaletId || chalets[0]?.id || '',
                  problemType,
                  description,
                  photos: [],
                  priority,
                  status: technicianName ? 'assigned' : 'open',
                  technicianName,
                  cost,
                  notes: '',
                  createdAt: new Date().toISOString(),
                  completedAt: null,
                  isDemo: false,
                });
                if (res && !res.ok) {
                  setTicketError(res.error || (isAr ? 'تعذر حفظ بلاغ الصيانة.' : 'Failed to create ticket.'));
                  return;
                }
                setDescription('');
                setShowCreate(false);
              } finally {
                setSavingTicket(false);
              }
            }}
            className="bg-white w-full max-w-md rounded-xl border border-slate-200 shadow-xl"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900">{t.actions.addTicket}</h3>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-3 text-sm">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {isAr ? 'الشاليه' : 'Chalet'}
                </label>
                <select
                  value={chaletId}
                  onChange={(e) => setChaletId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  {chalets.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.chaletNumber}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {isAr ? 'نوع العطل' : 'Problem Type'}
                </label>
                <input
                  required
                  value={problemType}
                  onChange={(e) => setProblemType(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {isAr ? 'الأولوية' : 'Priority'}
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as MaintenancePriority)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  {(['low', 'medium', 'high', 'emergency'] as const).map((p) => (
                    <option key={p} value={p}>
                      {t.priority[p]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {isAr ? 'الفني المكلف' : 'Technician'}
                  </label>
                  <input
                    value={technicianName}
                    onChange={(e) => setTechnicianName(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {isAr ? 'التكلفة التقديرية' : 'Estimated Cost'}
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={cost}
                    onChange={(e) => setCost(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono-num"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {isAr ? 'وصف المشكلة' : 'Description'}
                </label>
                <textarea
                  rows={2}
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
            </div>
            {ticketError && (
              <div className="mx-6 mb-3 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
                {ticketError}
              </div>
            )}
            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-2">
              <button
                type="button"
                disabled={savingTicket}
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 text-xs font-semibold border border-slate-300 rounded-lg bg-white text-slate-700 cursor-pointer"
              >
                {t.actions.cancel}
              </button>
              <button
                type="submit"
                disabled={savingTicket}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-cyan-800 text-white hover:bg-cyan-900 cursor-pointer disabled:opacity-60"
              >
                {savingTicket ? (isAr ? 'جاري الحفظ...' : 'Saving...') : t.actions.save}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
