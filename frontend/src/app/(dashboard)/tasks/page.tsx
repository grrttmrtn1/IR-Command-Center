"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  DndContext, DragOverlay, pointerWithin, rectIntersection,
  PointerSensor, useSensor, useSensors, useDroppable,
  type DragEndEvent, type DragStartEvent, type CollisionDetection,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import api from "@/lib/api";
import type { Task, TaskStatus, Priority } from "@/lib/types";
import { PRIORITY_COLORS } from "@/lib/utils";
import { Plus, GripVertical, Trash2 } from "lucide-react";
import { toast } from "sonner";

const kanbanCollision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length > 0 ? hits : rectIntersection(args);
};

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

export default function OrgTasksPage() {
  const qc = useQueryClient();
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [addModal, setAddModal] = useState<{ status: TaskStatus | null; title: string; priority: Priority; description: string }>({
    status: null, title: "", priority: "MEDIUM", description: "",
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ["org-tasks"],
    queryFn: () => api.get<Task[]>("/tasks").then((r) => r.data),
  });

  const moveMutation = useMutation({
    mutationFn: ({ taskId, status, sort_order }: { taskId: string; status: TaskStatus; sort_order: number }) =>
      api.patch(`/tasks/${taskId}/move`, { status, sort_order }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["org-tasks"] }),
  });

  const addMutation = useMutation({
    mutationFn: (data: { title: string; priority: string; status: string; description: string }) =>
      api.post("/tasks", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org-tasks"] });
      setAddModal({ status: null, title: "", priority: "MEDIUM", description: "" });
      toast.success("Task added");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (taskId: string) => api.delete(`/tasks/${taskId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org-tasks"] });
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
    if (draggedTask.status !== targetStatus || draggedTask.sort_order !== targetTasks.length) {
      moveMutation.mutate({ taskId: draggedTask.id, status: targetStatus, sort_order: targetTasks.length });
    }
  }

  const tasksByColumn = (status: TaskStatus) =>
    tasks.filter((t) => t.status === status).sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Organization Task Board</h1>
          <p className="text-sm text-muted-foreground mt-1">{tasks.length} tasks · {tasks.filter((t) => t.status === "DONE").length} completed</p>
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={kanbanCollision} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {COLUMNS.map((col) => (
            <KanbanColumn
              key={col.id}
              status={col.id}
              label={col.label}
              color={col.color}
              tasks={tasksByColumn(col.id)}
              onAdd={(status) => setAddModal({ status, title: "", priority: "MEDIUM", description: "" })}
              onDelete={(taskId) => deleteMutation.mutate(taskId)}
            />
          ))}
        </div>
        <DragOverlay>
          {activeTask && <TaskCard task={activeTask} overlay />}
        </DragOverlay>
      </DndContext>

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
              <textarea
                value={addModal.description}
                onChange={(e) => setAddModal({ ...addModal, description: e.target.value })}
                rows={2}
                placeholder="Description (optional)..."
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none resize-none"
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
                onClick={() => addMutation.mutate({ title: addModal.title, priority: addModal.priority, status: addModal.status!, description: addModal.description })}
                disabled={!addModal.title || addMutation.isPending}
                className="flex-1 py-2 bg-primary text-primary-foreground text-sm rounded-lg disabled:opacity-50"
              >
                Add Task
              </button>
              <button onClick={() => setAddModal({ status: null, title: "", priority: "MEDIUM", description: "" })} className="px-4 py-2 border border-border text-sm rounded-lg">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
