import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Zap, Eye, EyeOff, Check, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const Signup = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password.length < 8) {
      toast({ title: "Password too short", description: "Password must be at least 8 characters.", variant: "destructive" });
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        data: { full_name: form.name },
        emailRedirectTo: `${window.location.origin}/dashboard`,
      },
    });
    setLoading(false);
    if (error) {
      toast({ title: "Sign up failed", description: error.message, variant: "destructive" });
    } else {
      setSubmitted(true);
    }
  };

  const perks = ["50 free videos per month", "No credit card required", "OCR text extraction included"];

  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 h-[600px] w-[600px] rounded-full bg-primary opacity-5 blur-3xl" />
          <div className="absolute -bottom-20 -left-40 h-[500px] w-[500px] rounded-full bg-accent opacity-5 blur-3xl" />
        </div>
        <div className="w-full max-w-sm relative text-center">
          <Link to="/" className="inline-flex items-center gap-2 mb-8">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-hero">
              <Zap className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="font-display text-xl font-bold">BoardSnap AI</span>
          </Link>
          <div className="glass-card p-8 shadow-float">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent-light mx-auto mb-4">
              <Mail className="h-8 w-8 text-accent" />
            </div>
            <h1 className="font-display text-2xl font-bold mb-2">Check your email</h1>
            <p className="text-sm text-muted-foreground mb-1">
              We sent a confirmation link to
            </p>
            <p className="text-sm font-semibold text-foreground mb-4">{form.email}</p>
            <p className="text-xs text-muted-foreground mb-6">
              Click the link in the email to activate your account and start extracting lecture notes.
            </p>
            <Link to="/login">
              <Button variant="outline" className="w-full">
                Back to Sign In
              </Button>
            </Link>
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            Didn't receive it? Check your spam folder or{" "}
            <button
              onClick={() => setSubmitted(false)}
              className="text-primary hover:underline"
            >
              try again
            </button>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 h-[600px] w-[600px] rounded-full bg-primary opacity-5 blur-3xl" />
        <div className="absolute -bottom-20 -left-40 h-[500px] w-[500px] rounded-full bg-accent opacity-5 blur-3xl" />
      </div>

      <div className="w-full max-w-sm relative">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2 mb-6">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-hero">
              <Zap className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="font-display text-xl font-bold">BoardSnap AI</span>
          </Link>
          <h1 className="font-display text-2xl font-bold mb-1">Create your account</h1>
          <p className="text-sm text-muted-foreground">Start extracting lecture notes for free</p>
        </div>

        <div className="flex flex-col gap-2 mb-6">
          {perks.map((perk, i) => (
            <div key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-accent-light flex-shrink-0">
                <Check className="h-3 w-3 text-accent" />
              </div>
              {perk}
            </div>
          ))}
        </div>

        <div className="glass-card p-6 shadow-float">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name" className="text-sm font-medium">Full Name</Label>
              <Input
                id="name"
                type="text"
                placeholder="Alex Johnson"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="h-10"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-sm font-medium">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@university.edu"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="h-10"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-sm font-medium">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="h-10 pr-10"
                  minLength={8}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">Minimum 8 characters</p>
            </div>
            <Button
              type="submit"
              disabled={loading}
              className="w-full btn-glow bg-primary text-primary-foreground border-0 h-10 font-semibold"
            >
              {loading ? "Creating account..." : "Create Free Account"}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              By signing up, you agree to our{" "}
              <a href="#" className="text-primary hover:underline">Terms</a> and{" "}
              <a href="#" className="text-primary hover:underline">Privacy Policy</a>
            </p>
          </form>
        </div>

        <p className="text-center text-sm text-muted-foreground mt-6">
          Already have an account?{" "}
          <Link to="/login" className="text-primary font-medium hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
};

export default Signup;
