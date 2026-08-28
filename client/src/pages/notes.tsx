import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ProjectCombobox } from "@/components/ProjectCombobox";
import { RichTextEditor } from "@/components/RichTextEditor";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { NotebookPen, ChevronDown, ChevronLeft, Plus, FolderOpen, Trash2 } from "lucide-react";

interface Note {
  row: number;
  date: string;
  entry: string;
  tags: string;
  linked: string;
  project: string;
  details: string;
}

function NoteCard({ n, onOpen }: { n: Note; onOpen: (n: Note) => void }) {
  return (
    <button
      onClick={() => onOpen(n)}
      className="w-full text-left py-3.5 px-4 hover-elevate rounded-md"
      data-testid={`card-note-${n.row}`}
    >
      <p className="text-xs text-muted-foreground mb-1.5">{n.date}</p>
      <p className="leading-snug">{n.entry}</p>
      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
        {n.tags && <Badge variant="secondary">{n.tags}</Badge>}
        {n.details && <Badge variant="outline">See more</Badge>}
      </div>
    </button>
  );
}

export default function Notes() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading, isError } = useQuery<Note[]>({ queryKey: ["/api/notes"] });

  const [addOpen, setAddOpen] = useState(false);
  const [newEntry, setNewEntry] = useState("");
  const [newProject, setNewProject] = useState("");
  const [newDetails, setNewDetails] = useState("");

  const [activeNote, setActiveNote] = useState<Note | null>(null);
  const [detailsDraft, setDetailsDraft] = useState("");
  const [entryDraft, setEntryDraft] = useState("");
  const [projectDraft, setProjectDraft] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");

  // Tracks the last values actually written to the sheet (or freshly loaded
  // from it), so the autosave effect only fires on real edits rather than on
  // every render or on the initial load of a note.
  const lastSavedRef = useRef({ entry: "", project: "", details: "" });
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const createNote = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/notes", {
        entry: newEntry.trim(),
        project: newProject.trim(),
        details: newDetails.trim(),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/notes"] });
      qc.invalidateQueries({ queryKey: ["/api/player"] });
      setAddOpen(false);
      setNewEntry("");
      setNewProject("");
      setNewDetails("");
      toast({ title: "Note added" });
    },
    onError: (err: any) => {
      toast({ title: "Couldn't add note", description: err?.message, variant: "destructive" });
    },
  });

  // Autosaves in the background (Apple Notes style) so edits are never lost
  // no matter how the note is closed — Done, the back button, or a swipe.
  const saveDetails = useMutation({
    mutationFn: async () => {
      if (!activeNote) throw new Error("No note is open");
      const snapshot = {
        entry: entryDraft.trim(),
        project: projectDraft.trim(),
        details: detailsDraft,
      };
      await apiRequest("PATCH", `/api/notes/${activeNote.row}`, snapshot);
      return snapshot;
    },
    onSuccess: (snapshot) => {
      if (!snapshot) return;
      lastSavedRef.current = snapshot;
      setSaveState("saved");
      qc.invalidateQueries({ queryKey: ["/api/notes"] });
    },
    onError: (err: any) => {
      setSaveState("idle");
      toast({ title: "Couldn't save note", description: err?.message, variant: "destructive" });
    },
  });

  const hasUnsavedChanges = () => {
    const last = lastSavedRef.current;
    return (
      entryDraft.trim() !== last.entry ||
      projectDraft.trim() !== last.project ||
      detailsDraft !== last.details
    );
  };

  // Used by both the Done button and the back button — flushes any pending
  // autosave immediately, then closes. This is the fix for edits silently
  // disappearing when leaving via the back button instead of Done.
  const closeNote = () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (hasUnsavedChanges() && entryDraft.trim()) {
      saveDetails.mutate(undefined, {
        onSuccess: () => {
          setActiveNote(null);
          toast({ title: "Note saved" });
        },
      });
    } else {
      setActiveNote(null);
    }
  };

  const deleteNote = useMutation({
    mutationFn: async () => {
      if (!activeNote) return;
      await apiRequest("DELETE", `/api/notes/${activeNote.row}`);
    },
    onSuccess: () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      qc.invalidateQueries({ queryKey: ["/api/notes"] });
      setActiveNote(null);
      toast({ title: "Note deleted" });
    },
    onError: (err: any) => {
      toast({ title: "Couldn't delete note", description: err?.message, variant: "destructive" });
    },
  });

  const openNote = (n: Note) => {
    setActiveNote(n);
    setDetailsDraft(n.details ?? "");
    setEntryDraft(n.entry ?? "");
    setProjectDraft(n.project ?? "");
    lastSavedRef.current = {
      entry: (n.entry ?? "").trim(),
      project: (n.project ?? "").trim(),
      details: n.details ?? "",
    };
    setSaveState("idle");
  };

  // Debounced autosave: fires ~1s after the user stops typing so we don't
  // hammer the sheet on every keystroke, but nothing depends on an explicit
  // save action to persist.
  useEffect(() => {
    if (!activeNote) return;
    if (!hasUnsavedChanges() || !entryDraft.trim()) return;
    setSaveState("saving");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveDetails.mutate();
    }, 900);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryDraft, projectDraft, detailsDraft, activeNote]);

  // Title grows with its content, like the first line of an Apple Notes
  // entry, instead of scrolling inside a fixed-height box.
  const titleRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [entryDraft, activeNote]);

  const GENERAL = "General";

  const existingProjects = useMemo(() => {
    if (!data) return [GENERAL];
    const set = new Set<string>([GENERAL]);
    for (const n of data) if (n.project?.trim()) set.add(n.project.trim());
    return Array.from(set).sort();
  }, [data]);

  // Notes without a project are grouped into a real "General" folder rather
  // than a special-cased "No Project" section, so they behave the same way
  // (collapsible, sortable, counted) as every other project group.
  const projectGroups = useMemo(() => {
    if (!data) return [] as { project: string; notes: Note[] }[];
    const byProject = new Map<string, Note[]>();
    for (const n of data) {
      const key = n.project?.trim() || GENERAL;
      if (!byProject.has(key)) byProject.set(key, []);
      byProject.get(key)!.push(n);
    }
    return Array.from(byProject.entries())
      .map(([project, notes]) => ({ project, notes }))
      .sort((a, b) => {
        if (a.project === GENERAL) return 1;
        if (b.project === GENERAL) return -1;
        return a.project.localeCompare(b.project);
      });
  }, [data]);

  const hasAny = (data?.length ?? 0) > 0;

  return (
    <Layout title="Notes">
      <div className="flex items-center justify-end mb-4">
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="icon" className="rounded-full shrink-0" data-testid="button-add-note">
              <Plus className="h-4 w-4" />
            </Button>
          </DialogTrigger>
          <DialogContent data-testid="dialog-add-note" className="max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add a note</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="new-note-project">Project</Label>
                <ProjectCombobox
                  value={newProject}
                  onChange={setNewProject}
                  options={existingProjects}
                  placeholder="General"
                  testId="input-new-note-project"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-note-entry">Title</Label>
                <Textarea
                  id="new-note-entry"
                  value={newEntry}
                  onChange={(e) => setNewEntry(e.target.value)}
                  placeholder="Fish tank filter needs replacing every 3 weeks"
                  className="min-h-20"
                  data-testid="input-new-note"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-note-details">Details (optional)</Label>
                <div className="rounded-md border border-input px-3 py-2">
                  <RichTextEditor
                    value={newDetails}
                    onChange={setNewDetails}
                    placeholder="Add more detail to this note..."
                    minHeight="5rem"
                    testId="input-new-note-details"
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={() => createNote.mutate()}
                disabled={!newEntry.trim() || createNote.isPending}
                data-testid="button-save-new-note"
              >
                Add note
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading && (
        <div className="space-y-2">
          <Skeleton className="h-20 w-full rounded-lg" />
          <Skeleton className="h-20 w-full rounded-lg" />
        </div>
      )}

      {isError && (
        <Card className="border-card-border">
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            Couldn't load notes right now.
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && !hasAny && (
        <Card className="border-card-border">
          <CardContent className="py-10 text-center">
            <NotebookPen className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              No notes yet — capture a thought from the home screen.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {projectGroups.map((g) => (
          <Collapsible key={g.project} defaultOpen data-testid={`group-note-project-${g.project}`}>
            <Card className="border-card-border">
              <CollapsibleTrigger asChild>
                <button
                  className="w-full flex items-center gap-3 px-4 pt-3.5 pb-2 text-left group"
                  data-testid={`button-toggle-note-project-${g.project}`}
                >
                  <FolderOpen className="h-4 w-4 text-primary shrink-0" />
                  <p className="flex-1 font-display font-semibold text-sm">{g.project}</p>
                  <span className="text-xs text-muted-foreground shrink-0">{g.notes.length}</span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 transition-transform group-data-[state=open]:rotate-180" />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="pt-0 pb-1 px-0 divide-y divide-border">
                  {g.notes.map((n) => (
                    <NoteCard key={n.row} n={n} onOpen={openNote} />
                  ))}
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        ))}
      </div>

      {/* Full-screen note detail — Apple Notes style: a top settings/toolbar
          bar, and the entire remaining screen is the writing surface (title
          grows with content, details fills and scrolls independently). */}
      {activeNote && (
        <div
          className="fixed inset-0 z-50 bg-background flex flex-col"
          data-testid="fullscreen-note-detail"
        >
          <div className="flex items-center gap-1 px-2 py-2 border-b border-border shrink-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={closeNote}
              data-testid="button-close-note-detail"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-muted-foreground font-normal"
                  data-testid="button-note-detail-project"
                >
                  <FolderOpen className="h-3.5 w-3.5" />
                  {projectDraft || "General"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64" align="start" data-testid="popover-note-detail-project">
                <Label htmlFor="note-detail-project" className="mb-1.5 block">
                  Project
                </Label>
                <ProjectCombobox
                  value={projectDraft}
                  onChange={setProjectDraft}
                  options={existingProjects}
                  placeholder="General"
                  testId="input-note-detail-project"
                />
              </PopoverContent>
            </Popover>

            <span className="flex-1 text-center text-xs text-muted-foreground truncate">
              {saveState === "saving" ? "Saving\u2026" : saveState === "saved" ? "Saved" : activeNote.date}
            </span>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive shrink-0"
                  data-testid="button-delete-note"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent data-testid="dialog-delete-note-confirm">
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this note?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This can't be undone. The note will be permanently removed.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel data-testid="button-cancel-delete-note">Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => deleteNote.mutate()}
                    disabled={deleteNote.isPending}
                    className="bg-destructive text-destructive-foreground hover-elevate"
                    data-testid="button-confirm-delete-note"
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <Button
              size="sm"
              onClick={closeNote}
              disabled={!entryDraft.trim()}
              data-testid="button-save-note-details"
            >
              Done
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className="max-w-2xl mx-auto px-5 py-5 flex flex-col gap-3 min-h-full">
              <Textarea
                ref={titleRef}
                id="note-detail-entry"
                value={entryDraft}
                onChange={(e) => setEntryDraft(e.target.value)}
                placeholder="Title"
                rows={1}
                className="border-none shadow-none px-0 py-0 resize-none overflow-hidden focus-visible:ring-0 min-h-0 text-2xl font-display font-semibold leading-snug"
                data-testid="textarea-note-detail-entry"
              />

              {activeNote?.tags && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Badge variant="secondary">{activeNote.tags}</Badge>
                </div>
              )}

              <RichTextEditor
                value={detailsDraft}
                onChange={setDetailsDraft}
                placeholder="Add more detail to this note..."
                className="flex-1"
                minHeight="40vh"
                testId="textarea-note-details"
              />
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
