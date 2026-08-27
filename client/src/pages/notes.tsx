import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ProjectCombobox } from "@/components/ProjectCombobox";
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
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { NotebookPen, ChevronDown, Plus, FolderOpen } from "lucide-react";

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

  const saveDetails = useMutation({
    mutationFn: async () => {
      if (!activeNote) return;
      await apiRequest("PATCH", `/api/notes/${activeNote.row}`, { details: detailsDraft });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/notes"] });
      setActiveNote(null);
      toast({ title: "Note details saved" });
    },
    onError: (err: any) => {
      toast({ title: "Couldn't save details", description: err?.message, variant: "destructive" });
    },
  });

  const openNote = (n: Note) => {
    setActiveNote(n);
    setDetailsDraft(n.details ?? "");
  };

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
          <DialogContent data-testid="dialog-add-note">
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
                <Label htmlFor="new-note-entry">Note</Label>
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
                <Textarea
                  id="new-note-details"
                  value={newDetails}
                  onChange={(e) => setNewDetails(e.target.value)}
                  placeholder="Add more detail to this note..."
                  className="min-h-20"
                  data-testid="input-new-note-details"
                />
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

      <Dialog open={!!activeNote} onOpenChange={(open) => !open && setActiveNote(null)}>
        <DialogContent data-testid="dialog-note-detail">
          <DialogHeader>
            <DialogTitle>{activeNote?.date}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="leading-relaxed" data-testid="text-note-detail-entry">
              {activeNote?.entry}
            </p>
            <div className="flex items-center gap-1.5 flex-wrap">
              {activeNote?.project && <Badge variant="secondary">{activeNote.project}</Badge>}
              {activeNote?.tags && <Badge variant="secondary">{activeNote.tags}</Badge>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="note-details">Details</Label>
              <Textarea
                id="note-details"
                value={detailsDraft}
                onChange={(e) => setDetailsDraft(e.target.value)}
                placeholder="Add more detail to this note..."
                className="min-h-32"
                data-testid="textarea-note-details"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => saveDetails.mutate()}
              disabled={saveDetails.isPending}
              data-testid="button-save-note-details"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
