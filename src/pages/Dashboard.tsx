import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Zap, LogOut, Upload, Download, Clock, CheckCircle2,
  AlertCircle, FileArchive, History, ChevronRight, Loader2,
  Youtube, User, Crown, LayoutDashboard
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";

type JobStatus = "idle" | "pending" | "validating" | "extracting" | "deduplicating" | "detecting" | "enhancing" | "packaging" | "done" | "error";
type Job = Database["public"]["Tables"]["jobs"]["Row"];
type Profile = Database["public"]["Tables"]["profiles"]["Row"];

const statusSteps: { status: JobStatus; label: string; progress: number }[] = [
  { status: "validating",    label: "Validating YouTube URL",     progress: 12 },
  { status: "extracting",    label: "Extracting frames (every 3s)", progress: 30 },
  { status: "deduplicating", label: "Removing duplicate frames",  progress: 52 },
  { status: "detecting",     label: "Detecting board content",    progress: 68 },
  { status: "enhancing",     label: "Enhancing image quality",    progress: 84 },
  { status: "packaging",     label: "Packaging ZIP file",         progress: 95 },
  { status: "done",          label: "Your notes are ready!",      progress: 100 },
];

const FREE_LIMIT = 50;

const Dashboard = () => {
  const [url, setUrl] = useState("");
  const [jobStatus, setJobStatus] = useState<JobStatus>("idle");
  const [statusLabel, setStatusLabel] = useState("");
  const [ocrEnabled, setOcrEnabled] = useState(false);
  const [urlError, setUrlError] = useState("");
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [processingError, setProcessingError] = useState<string | null>(null);
  const realtimeChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  // Auth guard + load data
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) { navigate("/login"); return; }
      setUserId(session.user.id);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { navigate("/login"); return; }
      setUserId(session.user.id);
      loadProfile(session.user.id);
      loadJobs(session.user.id);
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  // Subscribe to realtime updates for the active job
  useEffect(() => {
    if (!currentJobId) return;

    // Cleanup old channel
    if (realtimeChannelRef.current) {
      supabase.removeChannel(realtimeChannelRef.current);
    }

    const channel = supabase
      .channel(`job-${currentJobId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "jobs", filter: `id=eq.${currentJobId}` },
        (payload) => {
          const updatedJob = payload.new as Job;
          const newStatus = updatedJob.status as JobStatus;

          const step = statusSteps.find((s) => s.status === newStatus);
          if (step) {
            setJobStatus(newStatus);
            setStatusLabel(step.label);
          }

          if (newStatus === "done") {
            setJobs((prev) => {
              const idx = prev.findIndex((j) => j.id === updatedJob.id);
              if (idx >= 0) {
                const updated = [...prev];
                updated[idx] = updatedJob;
                return updated;
              }
              return [updatedJob, ...prev];
            });
            loadProfile(userId!);
            if (userId) loadJobs(userId);
          }

          if (newStatus === "error") {
            setProcessingError(updatedJob.error_message ?? "Processing failed");
            toast({
              title: "Processing failed",
              description: updatedJob.error_message ?? "An error occurred while processing your video.",
              variant: "destructive",
            });
          }
        }
      )
      .subscribe();

    realtimeChannelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentJobId, userId]);

  const loadProfile = async (uid: string) => {
    const { data } = await supabase.from("profiles").select("*").eq("user_id", uid).single();
    if (data) setProfile(data);
  };

  const loadJobs = async (uid: string) => {
    const { data } = await supabase
      .from("jobs")
      .select("*")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(10);
    if (data) setJobs(data);
  };

  const isYoutubeUrl = (u: string) =>
    /^https?:\/\/(www\.)?(youtube\.com\/(watch\?v=|shorts\/)|youtu\.be\/)[\w-]{11}/.test(u);

  const startProcessing = async () => {
    if (!isYoutubeUrl(url)) {
      setUrlError("Please enter a valid YouTube URL (e.g., https://youtube.com/watch?v=...)");
      return;
    }
    if (!userId) return;

    // Check free plan limit
    if (profile?.plan_type === "free" && (profile?.videos_used_this_month ?? 0) >= FREE_LIMIT) {
      toast({ title: "Free plan limit reached", description: "Upgrade to Pro for unlimited videos.", variant: "destructive" });
      return;
    }

    setUrlError("");
    setProcessingError(null);

    // Create job record
    const { data: job, error } = await supabase
      .from("jobs")
      .insert({ user_id: userId, youtube_url: url, ocr_enabled: ocrEnabled, status: "pending" })
      .select()
      .single();

    if (error || !job) {
      toast({ title: "Failed to create job", description: error?.message, variant: "destructive" });
      return;
    }

    setCurrentJobId(job.id);
    setJobStatus("validating");
    setStatusLabel("Validating YouTube URL");

    // Add to jobs list immediately
    setJobs((prev) => [job, ...prev]);

    // Invoke edge function (non-blocking — realtime handles status updates)
    const { error: fnError } = await supabase.functions.invoke("process-video", {
      body: { jobId: job.id, youtubeUrl: url, ocrEnabled },
    });

    if (fnError) {
      setJobStatus("error");
      setProcessingError(fnError.message ?? "Edge function call failed");
      await supabase.from("jobs").update({ status: "error", error_message: fnError.message }).eq("id", job.id);
      toast({ title: "Processing failed", description: fnError.message, variant: "destructive" });
    }
  };

  const handleDownload = async (job: Job) => {
    try {
      if (!job.download_url) {
        toast({ title: "No file available", description: "This job has no downloadable file yet.", variant: "destructive" });
        return;
      }

      const { data, error } = await supabase.storage
        .from("job-zips")
        .createSignedUrl(job.download_url, 3600);

      if (error || !data?.signedUrl) {
        toast({ title: "Download failed", description: error?.message ?? "Could not generate download link.", variant: "destructive" });
        return;
      }

      const a = document.createElement("a");
      a.href = data.signedUrl;
      a.download = `lecture_notes_${job.id.slice(0, 8)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast({ title: "Download started!", description: `lecture_notes_${job.id.slice(0, 8)}.zip` });
    } catch {
      toast({ title: "Download failed", description: "An unexpected error occurred.", variant: "destructive" });
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  const currentProgress = statusSteps.find((s) => s.status === jobStatus)?.progress ?? 0;
  const planVideosUsed = profile?.videos_used_this_month ?? 0;
  const isProcessing = jobStatus !== "idle" && jobStatus !== "done" && jobStatus !== "error";

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="hidden md:flex flex-col w-56 bg-card border-r border-border p-4 fixed left-0 top-0 bottom-0 z-40">
        <Link to="/" className="flex items-center gap-2 mb-8 mt-1">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-hero">
            <Zap className="h-3.5 w-3.5 text-primary-foreground" />
          </div>
          <span className="font-display font-bold text-sm">BoardSnap AI</span>
        </Link>

        <nav className="flex-1 space-y-1">
          <div className="flex items-center gap-2.5 rounded-lg bg-primary-light px-3 py-2 text-sm font-medium text-primary">
            <LayoutDashboard className="h-4 w-4" />
            Dashboard
          </div>
          <div className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted cursor-pointer">
            <History className="h-4 w-4" />
            History
          </div>
          <div className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted cursor-pointer">
            <User className="h-4 w-4" />
            Account
          </div>
        </nav>

        {/* Plan badge */}
        <div className="rounded-xl bg-gradient-primary-glow border border-primary/20 p-3 mb-4">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-semibold text-primary capitalize">{profile?.plan_type ?? "free"} Plan</span>
          </div>
          {profile?.plan_type !== "pro" && (
            <>
              <div className="w-full bg-border rounded-full h-1.5 mb-1.5">
                <div
                  className="bg-gradient-hero h-1.5 rounded-full transition-all"
                  style={{ width: `${Math.min((planVideosUsed / FREE_LIMIT) * 100, 100)}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">{planVideosUsed}/{FREE_LIMIT} videos this month</p>
              <Link to="/signup?plan=pro">
                <Button size="sm" className="w-full mt-2 h-7 text-xs btn-glow bg-primary text-primary-foreground border-0">
                  <Crown className="h-3 w-3 mr-1" />
                  Upgrade to Pro
                </Button>
              </Link>
            </>
          )}
        </div>

        <button onClick={handleSignOut} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted w-full">
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </aside>

      {/* Main content */}
      <main className="flex-1 md:ml-56 p-6 md:p-8 max-w-4xl">
        <div className="mb-8">
          <h1 className="font-display text-2xl font-bold mb-1">Extract Lecture Notes</h1>
          <p className="text-muted-foreground text-sm">Paste a YouTube lecture URL and let AI do the rest.</p>
        </div>

        {/* URL Input Card */}
        <div className="glass-card p-6 mb-6 shadow-card">
          <div className="flex items-center gap-2 mb-4">
            <Youtube className="h-5 w-5 text-destructive" />
            <h2 className="font-display font-semibold">Paste YouTube URL</h2>
          </div>

          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <Input
                  type="url"
                  placeholder="https://youtube.com/watch?v=..."
                  value={url}
                  onChange={(e) => { setUrl(e.target.value); setUrlError(""); }}
                  className="h-11 font-mono text-sm"
                  disabled={isProcessing}
                />
                {urlError && (
                  <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {urlError}
                  </p>
                )}
              </div>
              <Button
                onClick={startProcessing}
                disabled={!url || isProcessing}
                className="btn-glow bg-primary text-primary-foreground border-0 h-11 px-6 font-semibold shrink-0"
              >
                {isProcessing ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Processing...</>
                ) : (
                  <><Upload className="h-4 w-4 mr-2" />Start Processing</>
                )}
              </Button>
            </div>

            {/* OCR toggle */}
            <label className="flex items-center gap-2.5 cursor-pointer group">
              <div
                onClick={() => !isProcessing && setOcrEnabled(!ocrEnabled)}
                className={`relative h-5 w-9 rounded-full transition-colors cursor-pointer ${ocrEnabled ? "bg-primary" : "bg-border"}`}
              >
                <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-card shadow transition-transform ${ocrEnabled ? "translate-x-4" : "translate-x-0.5"}`} />
              </div>
              <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
                Also extract text (OCR) — include TXT file in ZIP
              </span>
            </label>
          </div>
        </div>

        {/* Progress Card */}
        {jobStatus !== "idle" && (
          <div className="glass-card p-6 mb-6 shadow-card animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display font-semibold">Processing Status</h2>
              {jobStatus === "done" && (
                <Badge className="bg-accent-light text-accent border-0">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Complete
                </Badge>
              )}
              {jobStatus === "error" && (
                <Badge className="bg-destructive/10 text-destructive border-0">
                  <AlertCircle className="h-3 w-3 mr-1" />
                  Failed
                </Badge>
              )}
            </div>

            {jobStatus === "error" ? (
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4">
                <p className="text-sm text-destructive font-medium mb-1">Processing failed</p>
                <p className="text-xs text-destructive/80">{processingError ?? "An unknown error occurred."}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 h-7 text-xs"
                  onClick={() => { setJobStatus("idle"); setProcessingError(null); }}
                >
                  Try Again
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-xs text-muted-foreground mb-2">
                    <span>{statusLabel}</span>
                    <span>{currentProgress}%</span>
                  </div>
                  <Progress
                    value={currentProgress}
                    className={`h-2.5 ${isProcessing ? "animate-pulse-glow" : ""}`}
                  />
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {statusSteps.slice(0, -1).map((step, i) => {
                    const stepIdx = statusSteps.findIndex((s) => s.status === jobStatus);
                    const isDone = i < stepIdx || jobStatus === "done";
                    const isActive = i === stepIdx;
                    return (
                      <div key={i} className={`flex items-center gap-2 rounded-lg p-2 text-xs transition-colors ${
                        isDone ? "text-accent" : isActive ? "text-primary" : "text-muted-foreground"
                      }`}>
                        {isDone ? (
                          <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" />
                        ) : isActive ? (
                          <Loader2 className="h-3.5 w-3.5 flex-shrink-0 animate-spin" />
                        ) : (
                          <div className="h-3.5 w-3.5 rounded-full border border-current flex-shrink-0" />
                        )}
                        {step.label}
                      </div>
                    );
                  })}
                </div>

                {jobStatus === "done" && currentJobId && (
                  <div className="flex flex-col sm:flex-row items-center gap-3 pt-2 border-t border-border">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <FileArchive className="h-4 w-4 text-accent" />
                      <span>
                        {jobs.find(j => j.id === currentJobId)?.frames_extracted ?? "?"} frames •{" "}
                        {jobs.find(j => j.id === currentJobId)?.file_size_mb ?? "?"} MB
                      </span>
                    </div>
                    <Button
                      onClick={() => {
                        const job = jobs.find(j => j.id === currentJobId);
                        if (job) handleDownload(job);
                      }}
                      className="btn-glow bg-primary text-primary-foreground border-0 sm:ml-auto gap-2 font-semibold"
                    >
                      <Download className="h-4 w-4" />
                      Download ZIP
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Job History */}
        <div className="glass-card p-6 shadow-card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-semibold flex items-center gap-2">
              <History className="h-4 w-4 text-muted-foreground" />
              Recent Jobs
            </h2>
          </div>

          <div className="space-y-2">
            {jobs.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No jobs yet — paste a YouTube URL above to get started!</p>
            ) : (
              jobs.map((job) => (
                <div key={job.id} className="flex items-center gap-3 rounded-xl p-3 hover:bg-muted/50 transition-colors group">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-full flex-shrink-0 ${
                    job.status === "done" ? "bg-accent-light" : job.status === "error" ? "bg-destructive/10" : "bg-primary/10"
                  }`}>
                    {job.status === "done" ? (
                      <CheckCircle2 className="h-4 w-4 text-accent" />
                    ) : job.status === "error" ? (
                      <AlertCircle className="h-4 w-4 text-destructive" />
                    ) : (
                      <Loader2 className="h-4 w-4 text-primary animate-spin" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate text-foreground">{job.youtube_url}</p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(job.created_at).toLocaleDateString()}
                      </span>
                      {job.status === "done" && job.frames_extracted && (
                        <>
                          <span>•</span>
                          <span>{job.frames_extracted} frames</span>
                          {job.file_size_mb && <><span>•</span><span>{job.file_size_mb} MB</span></>}
                        </>
                      )}
                      {job.status === "error" && (
                        <span className="text-destructive">{job.error_message?.slice(0, 40)}</span>
                      )}
                    </div>
                  </div>
                  {job.status === "done" && job.download_url && (
                    <Button variant="ghost" size="sm" onClick={() => handleDownload(job)} className="opacity-0 group-hover:opacity-100 transition-opacity h-7 gap-1.5 text-xs">
                      <Download className="h-3 w-3" />
                      Download
                      <ChevronRight className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
