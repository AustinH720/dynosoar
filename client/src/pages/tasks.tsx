import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProjectCombobox } from "@/components/ProjectCombobox";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { CheckSquare, ChevronDown, Plus, FolderOpen, MoreVertical, Repeat } from "lucide-react";

interface Task {
  row: number;
  task: string;
  category: string;
  dueDate: string;
  priority: string;
  status: string;
  source: string;
  dateAdded: string;
  project: string;
}

const FILTERS = ["Active", "Completed", "All"] as const;
type Filter = (typeof FILTERS)[number];

function isOverdue(dueDate: string, status: string) {
  if (!dueDate || status === "Completed") return false;
  const today = new Date().toISOString().slice(0, 10);
  return dueDate < today;
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function TaskRow({
  t,
  toggle,
  onEdit,
  onJumpToProject,
}: {
  t: Task;
  toggle: ReturnType<typeof useTaskToggle>;
  onEdit: (t: Task) => void;
  onJumpToProject: (project: string) => void;
}) {
  const done = t.status === "Completed";
  const overdue = isOverdue(t.dueDate, t.status);
  const isRecurring = t.project?.includes("Recurring");
  return (
    <div className="flex items-start gap-3 py-3" data-testid={`card-task-${t.row}`}>
      <Checkbox
        checked={done}
        onCheckedChange={(checked) =>
          toggle.mutate({ row: t.row, status: checked ? "Completed" : "Not Started" })
        }
        className="mt-0.5 shrink-0"
        data-testid={`checkbox-task-${t.row}`}
      />
      <div className="flex-1 min-w-0">
        <p className={cn("font-medium leading-snug", done && "line-through text-muted-foreground")}>
          {t.task}
        </p>
        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
          {t.category && (
            <Badge
              variant="secondary"
              className="cursor-pointer hover:bg-secondary/70 transition-colors"
              onClick={() => onJumpToProject(t.category)}
              data-testid={`badge-project-${t.row}`}
            >
              {t.category}
            </Badge>
          )}
          {isRecurring && (
            <Badge variant="outline" className="gap-1" data-testid={`badge-recurring-${t.row}`}>
              <Repeat className="h-3 w-3" />
              Recurring
            </Badge>
          )}
          {t.dueDate && (
            <Badge variant={overdue ? "destructive" : "outline"}>
              {overdue ? "Overdue: " : "Due "}
              {t.dueDate}
            </Badge>
          )}
          {t.priority === "High" && !done && <Badge variant="destructive">High priority</Badge>}
        </div>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 shrink-0 -mt-0.5 -mr-1.5"
            data-testid={`button-task-menu-${t.row}`}
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" data-testid={`menu-task-${t.row}`}>
          <DropdownMenuItem onClick={() => onEdit(t)} data-testid={`menuitem-edit-${t.row}`}>
            Edit task
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function useTaskToggle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ row, status }: { row: number; status: string }) => {
      await apiRequest("PATCH", `/api/tasks/${row}`, { status });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/tasks"] });
      qc.invalidateQueries({ queryKey: ["/api/player"] });
      qc.invalidateQueries({ queryKey: ["/api/skills"] });
      qc.invalidateQueries({ queryKey: ["/api/shop"] });
    },
  });
}

export default function Tasks() {
  const [filter, setFilter] = useState<Filter>("Active");
  const [addOpen, setAddOpen] = useState(false);
  const [newTask, setNewTask] = useState("");
  const [newProject, setNewProject] = useState("");
  const [newDueDate, setNewDueDate] = useState("");
  const [newPriority, setNewPriority] = useState("Medium");

  const [editTask, setEditTask] = useState<Task | null>(null);
  const [editText, setEditText] = useState("");
  const [editProject, setEditProject] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editPriority, setEditPriority] = useState("Medium");
  const [editStatus, setEditStatus] = useState("Not Started");

  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set());
  const groupRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading, isError } = useQuery<Task[]>({ queryKey: ["/api/tasks"] });

  const toggle = useTaskToggle();

  const createTask = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/tasks", {
        task: newTask.trim(),
        project: newProject.trim(),
        dueDate: newDueDate,
        priority: newPriority,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/tasks"] });
      qc.invalidateQueries({ queryKey: ["/api/player"] });
      setAddOpen(false);
      setNewTask("");
      setNewProject("");
      setNewDueDate("");
      setNewPriority("Medium");
      toast({ title: "Task added" });
    },
    onError: (err: any) => {
      toast({ title: "Couldn't add task", description: err?.message, variant: "destructive" });
    },
  });

  const editTaskMutation = useMutation({
    mutationFn: async () => {
      if (!editTask) return;
      await apiRequest("PATCH", `/api/tasks/${editTask.row}`, {
        task: editText.trim(),
        category: editProject.trim(),
        dueDate: editDueDate,
        priority: editPriority,
        status: editStatus,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/tasks"] });
      qc.invalidateQueries({ queryKey: ["/api/player"] });
      qc.invalidateQueries({ queryKey: ["/api/skills"] });
      qc.invalidateQueries({ queryKey: ["/api/shop"] });
      setEditTask(null);
      toast({ title: "Task updated" });
    },
    onError: (err: any) => {
      toast({ title: "Couldn't update task", description: err?.message, variant: "destructive" });
    },
  });

  const openEdit = (t: Task) => {
    setEditTask(t);
    setEditText(t.task);
    setEditProject(t.category);
    setEditDueDate(t.dueDate);
    setEditPriority(t.priority || "Medium");
    setEditStatus(t.status || "Not Started");
  };

  const existingProjects = useMemo(() => {
    const set = new Set<string>(["General"]);
    if (data) {
      for (const t of data) {
        if (t.category?.trim()) set.add(t.category.trim());
      }
    }
    return Array.from(set).sort();
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const sorted = [...data].sort((a, b) => {
      const aDue = a.dueDate || "9999-99-99";
      const bDue = b.dueDate || "9999-99-99";
      return aDue.localeCompare(bDue);
    });
    if (filter === "Active") return sorted.filter((t) => t.status !== "Completed");
    if (filter === "Completed") return sorted.filter((t) => t.status === "Completed");
    return sorted;
  }, [data, filter]);

  // Projects are driven by each task's category tag (e.g. "Job Search",
  // "Real Estate"). Tasks with no category fold into a real "General"
  // group instead of a special-cased "No Project" section, so uncategorized
  // tasks behave the same way (collapsible, sortable, counted) as any other
  // project. Clicking a task's project badge jumps to and expands that
  // project's group below.
  const GENERAL = "General";
  const projectGroups = useMemo(() => {
    if (!data) return [] as { project: string; total: number; done: number }[];
    const byProject = new Map<string, Task[]>();
    for (const t of data) {
      const key = t.category?.trim() || GENERAL;
      if (!byProject.has(key)) byProject.set(key, []);
      byProject.get(key)!.push(t);
    }
    return Array.from(byProject.entries())
      .map(([project, tasks]) => ({
        project,
        total: tasks.length,
        done: tasks.filter((t) => t.status === "Completed").length,
      }))
      .sort((a, b) => {
        if (a.project === GENERAL) return 1;
        if (b.project === GENERAL) return -1;
        return a.project.localeCompare(b.project);
      });
  }, [data]);

  const visibleForProject = (project: string) =>
    filtered.filter((t) => (t.category?.trim() || GENERAL) === project);
  const hasAnyVisible = projectGroups.some((g) => visibleForProject(g.project).length > 0);

  const jumpToProject = (project: string) => {
    setCollapsedProjects((prev) => {
      if (!prev.has(project)) return prev;
      const next = new Set(prev);
      next.delete(project);
      return next;
    });
    // Wait a tick for the collapsible to open before scrolling.
    requestAnimationFrame(() => {
      groupRefs.current[project]?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  return (
    <Layout title="Tasks">
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex gap-2">
          {FILTERS.map((f) => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? "default" : "outline"}
              onClick={() => setFilter(f)}
              data-testid={`button-filter-${f.toLowerCase()}`}
            >
              {f}
            </Button>
          ))}
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="icon" className="rounded-full shrink-0" data-testid="button-add-task">
              <Plus className="h-4 w-4" />
            </Button>
          </DialogTrigger>
          <DialogContent data-testid="dialog-add-task">
            <DialogHeader>
              <DialogTitle>Add a task</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="new-task-text">Task</Label>
                <Input
                  id="new-task-text"
                  value={newTask}
                  onChange={(e) => setNewTask(e.target.value)}
                  placeholder="Clean the fish tank glass"
                  data-testid="input-new-task"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-task-project">Project (optional)</Label>
                <ProjectCombobox
                  value={newProject}
                  onChange={setNewProject}
                  options={existingProjects}
                  placeholder="General"
                  testId="input-new-task-project"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="new-task-due">Due date (optional)</Label>
                  <Input
                    id="new-task-due"
                    type="date"
                    value={newDueDate}
                    onChange={(e) => setNewDueDate(e.target.value)}
                    data-testid="input-new-task-due"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Priority</Label>
                  <Select value={newPriority} onValueChange={setNewPriority}>
                    <SelectTrigger data-testid="select-new-task-priority">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Medium">Normal</SelectItem>
                      <SelectItem value="High">High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={() => createTask.mutate()}
                disabled={!newTask.trim() || createTask.isPending}
                data-testid="button-save-new-task"
              >
                Add task
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading && (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-16 w-full rounded-lg" />
        </div>
      )}

      {isError && (
        <Card className="border-card-border">
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            Couldn't load tasks. Pull to refresh in a moment.
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && !hasAnyVisible && (
        <Card className="border-card-border">
          <CardContent className="py-10 text-center">
            <CheckSquare className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              {filter === "Completed" ? "No completed tasks yet." : "You're all caught up."}
            </p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {projectGroups.map((g) => {
          const items = visibleForProject(g.project);
          if (items.length === 0) return null;
          const pct = g.total > 0 ? Math.round((g.done / g.total) * 100) : 0;
          const isOpen = !collapsedProjects.has(g.project);
          return (
            <div key={g.project} ref={(el) => (groupRefs.current[g.project] = el)}>
              <Collapsible
                open={isOpen}
                onOpenChange={(open) =>
                  setCollapsedProjects((prev) => {
                    const next = new Set(prev);
                    if (open) next.delete(g.project);
                    else next.add(g.project);
                    return next;
                  })
                }
                data-testid={`group-project-${slug(g.project)}`}
              >
                <Card className="border-card-border">
                  <CollapsibleTrigger asChild>
                    <button
                      className="w-full flex items-center gap-3 px-4 pt-3.5 pb-2 text-left group"
                      data-testid={`button-toggle-project-${slug(g.project)}`}
                    >
                      <FolderOpen className="h-4 w-4 text-primary shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-display font-semibold text-sm">{g.project}</p>
                          <span className="text-xs text-muted-foreground shrink-0">
                            {g.done}/{g.total} done
                          </span>
                        </div>
                        <Progress value={pct} className="h-1.5 mt-1.5" />
                      </div>
                      <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 transition-transform group-data-[state=open]:rotate-180" />
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent className="pt-0 pb-2 divide-y divide-border">
                      {items.map((t) => (
                        <TaskRow key={t.row} t={t} toggle={toggle} onEdit={openEdit} onJumpToProject={jumpToProject} />
                      ))}
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            </div>
          );
        })}
      </div>

      <Dialog open={!!editTask} onOpenChange={(open) => !open && setEditTask(null)}>
        <DialogContent data-testid="dialog-edit-task">
          <DialogHeader>
            <DialogTitle>Edit task</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-task-text">Task</Label>
              <Input
                id="edit-task-text"
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                data-testid="input-edit-task"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-task-project">Project</Label>
              <ProjectCombobox
                value={editProject}
                onChange={setEditProject}
                options={existingProjects}
                placeholder="General"
                testId="input-edit-task-project"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-task-due">Due date</Label>
                <Input
                  id="edit-task-due"
                  type="date"
                  value={editDueDate}
                  onChange={(e) => setEditDueDate(e.target.value)}
                  data-testid="input-edit-task-due"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select value={editPriority} onValueChange={setEditPriority}>
                  <SelectTrigger data-testid="select-edit-task-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Medium">Normal</SelectItem>
                    <SelectItem value="High">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={editStatus} onValueChange={setEditStatus}>
                <SelectTrigger data-testid="select-edit-task-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Not Started">Not Started</SelectItem>
                  <SelectItem value="Completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => editTaskMutation.mutate()}
              disabled={!editText.trim() || editTaskMutation.isPending}
              data-testid="button-save-edit-task"
            >
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
