import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Zap, LogOut, Upload, Download, Clock, CheckCircle2,
  AlertCircle, FileArchive, History, ChevronRight, Loader2,
  Youtube, User, Crown, LayoutDashboard
} from "lucide-react";

type JobStatus = "idle" | "validating" | "extracting" | "deduplicating" | "detecting" | "enhancing" | "packaging" | "done" | "error";

interface Job {
  id: string;
  url: string;
  status: "done" | "error";
  frames: number;
  date: string;
  duration: string;
}

const MOCK_HISTORY: Job[] = [
  { id: "1", url: "https://youtube.com/watch?v=dQw4w9WgXcQ", status: "done", frames: 47, date: "2025-03-02", duration: "42:15" },
  { id: "2", url: "https://youtube.com/watch?v=abc123", status: "done", frames: 31, date: "2025-03-01", duration: "28:00" },
  { id: "3", url: "https://youtube.com/watch?v=xyz789", status: "error", frames: 0, date: "2025-02-28", duration: "—" },
];

const statusSteps: { status: JobStatus; label: string; progress: number }[] = [
  { status: "validating", label: "Validating YouTube URL...", progress: 10 },
  { status: "extracting", label: "Extracting frames (every 3s)...", progress: 30 },
  { status: "deduplicating", label: "Removing duplicate frames...", progress: 55 },
  { status: "detecting", label: "Detecting board content...", progress: 70 },
  { status: "enhancing", label: "Enhancing image quality...", progress: 85 },
  { status: "packaging", label: "Packaging ZIP file...", progress: 95 },
  { status: "done", label: "Your notes are ready!", progress: 100 },
];

const Dashboard = () => {
  const [url, setUrl] = useState("");
  const [jobStatus, setJobStatus] = useState<JobStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [statusLabel, setStatusLabel] = useState("");
  const [ocrEnabled, setOcrEnabled] = useState(false);
  const [urlError, setUrlError] = useState("");

  const isYoutubeUrl = (u: string) => {
    return /^https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[\w-]{11}/.test(u);
  };

  const startProcessing = () => {
    if (!isYoutubeUrl(url)) {
      setUrlError("Please enter a valid YouTube URL (e.g., https://youtube.com/watch?v=...)");
      return;
    }
    setUrlError("");
    setJobStatus("validating");

    let stepIndex = 0;
    const runStep = () => {
      if (stepIndex < statusSteps.length) {
        const step = statusSteps[stepIndex];
        setJobStatus(step.status);
        setProgress(step.progress);
        setStatusLabel(step.label);
        stepIndex++;
        if (step.status !== "done") {
          setTimeout(runStep, 1800);
        }
      }
    };
    runStep();
  };

  const currentProgress = statusSteps.find((s) => s.status === jobStatus)?.progress ?? 0;

  const planVideosUsed = 1;
  const planVideoLimit = 3;

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
            <span className="text-xs font-semibold text-primary">Free Plan</span>
          </div>
          <div className="w-full bg-border rounded-full h-1.5 mb-1.5">
            <div
              className="bg-gradient-hero h-1.5 rounded-full transition-all"
              style={{ width: `${(planVideosUsed / planVideoLimit) * 100}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">{planVideosUsed}/{planVideoLimit} videos this month</p>
          <Link to="/signup?plan=pro">
            <Button size="sm" className="w-full mt-2 h-7 text-xs btn-glow bg-primary text-primary-foreground border-0">
              <Crown className="h-3 w-3 mr-1" />
              Upgrade to Pro
            </Button>
          </Link>
        </div>

        <button className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted w-full">
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
                  disabled={jobStatus !== "idle" && jobStatus !== "error"}
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
                disabled={!url || (jobStatus !== "idle" && jobStatus !== "done" && jobStatus !== "error")}
                className="btn-glow bg-primary text-primary-foreground border-0 h-11 px-6 font-semibold shrink-0"
              >
                {jobStatus !== "idle" && jobStatus !== "done" && jobStatus !== "error" ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Start Processing
                  </>
                )}
              </Button>
            </div>

            {/* OCR toggle */}
            <label className="flex items-center gap-2.5 cursor-pointer group">
              <div
                onClick={() => setOcrEnabled(!ocrEnabled)}
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
            </div>

            <div className="space-y-4">
              {/* Progress bar */}
              <div>
                <div className="flex justify-between text-xs text-muted-foreground mb-2">
                  <span>{statusLabel}</span>
                  <span>{currentProgress}%</span>
                </div>
                <Progress
                  value={currentProgress}
                  className={`h-2.5 ${jobStatus !== "done" ? "animate-pulse-glow" : ""}`}
                />
              </div>

              {/* Steps */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {statusSteps.slice(0, -1).map((step, i) => {
                  const stepIdx = statusSteps.findIndex((s) => s.status === jobStatus);
                  const thisIdx = i;
                  const isDone = thisIdx < stepIdx || jobStatus === "done";
                  const isActive = thisIdx === stepIdx;
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
                      {step.label.replace("...", "")}
                    </div>
                  );
                })}
              </div>

              {/* Download button */}
              {jobStatus === "done" && (
                <div className="flex flex-col sm:flex-row items-center gap-3 pt-2 border-t border-border">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <FileArchive className="h-4 w-4 text-accent" />
                    <span>47 frames extracted • lecture_notes.zip (8.3 MB)</span>
                  </div>
                  <Button className="btn-glow bg-primary text-primary-foreground border-0 sm:ml-auto gap-2 font-semibold">
                    <Download className="h-4 w-4" />
                    Download ZIP
                  </Button>
                </div>
              )}
            </div>
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
            {MOCK_HISTORY.map((job) => (
              <div key={job.id} className="flex items-center gap-3 rounded-xl p-3 hover:bg-muted/50 transition-colors group">
                <div className={`flex h-8 w-8 items-center justify-center rounded-full flex-shrink-0 ${
                  job.status === "done" ? "bg-accent-light" : "bg-destructive/10"
                }`}>
                  {job.status === "done" ? (
                    <CheckCircle2 className="h-4 w-4 text-accent" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-destructive" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate text-foreground">{job.url}</p>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {job.date}
                    </span>
                    {job.status === "done" && (
                      <>
                        <span>•</span>
                        <span>{job.frames} frames</span>
                        <span>•</span>
                        <span>{job.duration}</span>
                      </>
                    )}
                  </div>
                </div>
                {job.status === "done" && (
                  <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity h-7 gap-1.5 text-xs">
                    <Download className="h-3 w-3" />
                    Download
                    <ChevronRight className="h-3 w-3" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
