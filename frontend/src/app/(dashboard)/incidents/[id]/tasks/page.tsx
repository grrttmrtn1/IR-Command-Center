"use client";

import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import api from "@/lib/api";
import type { Task, TaskStatus, Priority } from "@/lib/types";
import { PRIORITY_COLORS } from "@/lib/utils";
import { Plus, Sparkles, GripVertical, Trash2 } from "lucide-react";
import { toast } from "sonner";

const COLUMNS: { id: TaskStatus; label: string; color: string }[] = [
  { id: "BACKLOG", label: "Backlog", color: "bg-slate-100 dark:bg-slate-900/50" },
  { id: "TODO", label: "To Do", color: "bg-blue-50 dark:bg-blue-950/30" },
  { id: "IN_PROGRESS", label: "In Progress", color: "bg-yellow-50 dark:bg-yellow-950/30" },
  { id: "BLOCKED", label: "Blocked", color: "bg-red-50 dark:bg-red-950/30" },
  { id: "DONE", label: "Done", color: "bg-green-50 dark:bg-green-950/30" },
];

function TaskCard({ task, overlay = false, onDelete }: { task: Task; overlay?: boolean; onDelete?: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };

  return (
    <div
      ref={setNodeRef}
      style={overlay ? undefined : style}
      className={`group bg-card border border-border rounded-lg p-3 shadow-sm hover:border-primary/40 transition-colors ${overlay ? "shadow-lg rotate-1" : ""}`}
    >
      <div className="flex items-start gap-2">
        <button {...attributes} {...listeners} className="mt-0.5 text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing">
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground leading-tight">{task.title}</p>
          {task.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{task.description}</p>}
          <div className="flex items-center gap-2 mt-2">
            <span className={`text-xs font-semibold ${PRIORITY_COLORS[task.priority]}`}>{task.priority}</span>
            {task.due_at && <span className="text-xs text-muted-foreground">{new Date(task.due_at).toLocaleDateString()}</span>}
          </div>
        </div>
        {onDelete && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

function KanbanColumn({ status, label, color, tasks, onAdd, onDelete }: {
  status: TaskStatus; label: string; color: string;
  tasks: Task[]; onAdd: (status: TaskStatus) => void; onDelete: (taskId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div
      ref={setNodeRef}
      className={`rounded-xl ${color} border flex flex-col min-h-[500px] transition-colors ${isOver ? "border-primary/60 ring-1 ring-primary/30" : "border-border/50"}`}
      style={{ minWidth: "220px", flex: "1" }}
    >
      <div className="px-3 py-2.5 border-b border-border/50 flex items-center justify-between">
        <span className="text-sm font-semibold text-foreground">{label}</span>
        <span className="text-xs text-muted-foreground bg-background/60 px-1.5 py-0.5 rounded-full">{tasks.length}</span>
      </div>
      <div className="flex-1 p-2 space-y-2 overflow-y-auto">
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => <TaskCard key={task.id} task={task} onDelete={() => onDelete(task.id)} />)}
        </SortableContext>
      </div>
      <div className="p-2 border-t border-border/50">
        <button
          onClick={() => onAdd(status)}
          className="w-full flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-background/60 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" /> Add task
        </button>
      </div>
    </div>
  );
}

export default function IncidentTasksPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [addModal, setAddModal] = useState<{ status: TaskStatus | null; title: string; priority: Priority }>({ status: null, title: "", priority: "MEDIUM" });
  const [generatingTasks, setGeneratingTasks] = useState(false);

  const { data: incident } = useQuery({
    queryKey: ["incident", id],
    queryFn: () => api.get(`/incidents/${id}`).then((r) => r.data),
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ["incident-tasks", id],
    queryFn: () => api.get<Task[]>(`/incidents/${id}/tasks`).then((r) => r.data),
  });

  const moveMutation = useMutation({
    mutationFn: ({ taskId, status, sort_order }: { taskId: string; status: TaskStatus; sort_order: number }) =>
      api.patch(`/tasks/${taskId}/move`, { status, sort_order }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["incident-tasks", id] }),
  });

  const addMutation = useMutation({
    mutationFn: (data: { title: string; priority: string; status: string }) =>
      api.post(`/incidents/${id}/tasks`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["incident-tasks", id] });
      setAddModal({ status: null, title: "", priority: "MEDIUM" });
      toast.success("Task added");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (taskId: string) => api.delete(`/tasks/${taskId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["incident-tasks", id] });
      toast.success("Task deleted");
    },
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function handleDragStart(event: DragStartEvent) {
    const task = tasks.find((t) => t.id === event.active.id);
    if (task) setActiveTask(task);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveTask(null);
    const { active, over } = event;
    if (!over) return;

    const draggedTask = tasks.find((t) => t.id === active.id);
    if (!draggedTask) return;

    const overColumn = COLUMNS.find((c) => c.id === over.id);
    const overTask = tasks.find((t) => t.id === over.id);
    const targetStatus: TaskStatus = overColumn?.id ?? overTask?.status ?? draggedTask.status;
    const targetTasks = tasks.filter((t) => t.status === targetStatus && t.id !== draggedTask.id);
    const sort_order = targetTasks.length;

    if (draggedTask.status !== targetStatus || draggedTask.sort_order !== sort_order) {
      moveMutation.mutate({ taskId: draggedTask.id, status: targetStatus, sort_order });
    }
  }

  async function generateAITasks() {
    if (!incident) return;
    setGeneratingTasks(true);
    try {
      const { data } = await api.post("/ai/generate-tasks", {
        incident_title: incident.title,
        incident_type: incident.incident_type,
        incident_description: incident.description,
      });
      for (const task of (data.tasks || []).slice(0, 15)) {
        await api.post(`/incidents/${id}/tasks`, {
          title: task.title,
          description: task.description,
          priority: task.priority,
          status: "BACKLOG",
        });
      }
      qc.invalidateQueries({ queryKey: ["incident-tasks", id] });
      toast.success(`${data.tasks?.length ?? 0} AI-generated tasks added to Backlog`);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      toast.error(e.response?.data?.detail || "AI task generation failed");
    } finally {
      setGeneratingTasks(false);
    }
  }

  const tasksByColumn = (status: TaskStatus) =>
    tasks.filter((t) => t.status === status).sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold">Incident Kanban Board</h2>
          <p className="text-sm text-muted-foreground mt-1">{tasks.length} tasks · {tasks.filter((t) => t.status === "DONE").length} completed</p>
        </div>
        <button
          onClick={generateAITasks}
          disabled={generatingTasks}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Sparkles className="h-4 w-4" />
          {generatingTasks ? "Generating..." : "AI Generate Tasks"}
        </button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {COLUMNS.map((col) => (
            <KanbanColumn
              key={col.id}
              status={col.id}
              label={col.label}
              color={col.color}
              tasks={tasksByColumn(col.id)}
              onAdd={(status) => setAddModal({ status, title: "", priority: "MEDIUM" })}
              onDelete={(taskId) => deleteMutation.mutate(taskId)}
            />
          ))}
        </div>
        <DragOverlay>
          {activeTask && <TaskCard task={activeTask} overlay />}
        </DragOverlay>
      </DndContext>

      {/* Add task modal */}
      {addModal.status && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="font-semibold mb-4">Add Task to {addModal.status.replace("_", " ")}</h3>
            <div className="space-y-3">
              <input
                value={addModal.title}
                onChange={(e) => setAddModal({ ...addModal, title: e.target.value })}
                placeholder="Task title..."
                autoFocus
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <select
                value={addModal.priority}
                onChange={(e) => setAddModal({ ...addModal, priority: e.target.value as Priority })}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background"
              >
                <option value="CRITICAL">CRITICAL</option>
                <option value="HIGH">HIGH</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="LOW">LOW</option>
              </select>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => addMutation.mutate({ title: addModal.title, priority: addModal.priority, status: addModal.status! })}
                disabled={!addModal.title || addMutation.isPending}
                className="flex-1 py-2 bg-primary text-primary-foreground text-sm rounded-lg disabled:opacity-50"
              >
                Add Task
              </button>
              <button onClick={() => setAddModal({ status: null, title: "", priority: "MEDIUM" })} className="px-4 py-2 border border-border text-sm rounded-lg">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
