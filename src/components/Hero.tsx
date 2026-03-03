import { Button } from "@/components/ui/button";
import { ArrowRight, Play } from "lucide-react";
import { Link } from "react-router-dom";
import heroIllustration from "@/assets/hero-illustration.png";

const Hero = () => {
  return (
    <section className="relative pt-32 pb-20 overflow-hidden">
      {/* Background gradient orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 h-[600px] w-[600px] rounded-full bg-primary opacity-5 blur-3xl" />
        <div className="absolute -bottom-20 -left-40 h-[500px] w-[500px] rounded-full bg-accent opacity-5 blur-3xl" />
      </div>

      <div className="container mx-auto relative">
        <div className="flex flex-col items-center text-center max-w-4xl mx-auto">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary-light px-4 py-1.5 text-sm font-medium text-primary mb-6 animate-fade-in">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary"></span>
            </span>
            AI-Powered Lecture Note Extractor
          </div>

          {/* Headline */}
          <h1 className="font-display text-5xl md:text-6xl lg:text-7xl font-bold leading-tight mb-6 animate-fade-in-up">
            Turn YouTube Lectures into{" "}
            <span className="text-gradient">Organized Notes</span>{" "}
            in Seconds
          </h1>

          {/* Subtext */}
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-8 animate-fade-in-up" style={{ animationDelay: "0.1s" }}>
            Automatically extract board writing from any lecture video. No manual screenshots, no missed content — just clean, downloadable notes.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center gap-4 mb-16 animate-fade-in-up" style={{ animationDelay: "0.2s" }}>
            <Link to="/signup">
              <Button size="lg" className="btn-glow bg-primary text-primary-foreground border-0 h-12 px-8 text-base font-semibold gap-2">
                Try It Now — It's Free
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <a href="#how-it-works">
              <Button size="lg" variant="outline" className="h-12 px-8 text-base font-medium gap-2 border-border hover:border-primary/40">
                <Play className="h-4 w-4" />
                See How It Works
              </Button>
            </a>
          </div>

          {/* Trust badges */}
          <div className="flex items-center gap-6 text-sm text-muted-foreground mb-16 animate-fade-in" style={{ animationDelay: "0.3s" }}>
            {["No credit card required", "3 free videos/month", "OCR-ready output"].map((text, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <div className="h-1.5 w-1.5 rounded-full bg-accent" />
                <span>{text}</span>
              </div>
            ))}
          </div>

          {/* Hero illustration */}
          <div className="w-full max-w-4xl rounded-2xl overflow-hidden shadow-float border border-border animate-fade-in-up" style={{ animationDelay: "0.4s" }}>
            <div className="bg-muted/50 px-4 py-3 flex items-center gap-2 border-b border-border">
              <div className="flex gap-1.5">
                <div className="h-3 w-3 rounded-full bg-destructive/50" />
                <div className="h-3 w-3 rounded-full bg-yellow-400/50" />
                <div className="h-3 w-3 rounded-full bg-accent/50" />
              </div>
              <div className="flex-1 flex justify-center">
                <div className="bg-background rounded-md px-4 py-1 text-xs text-muted-foreground border border-border">
                  boardsnap.ai/dashboard
                </div>
              </div>
            </div>
            <img
              src={heroIllustration}
              alt="BoardSnap AI extracting whiteboard notes from a YouTube lecture"
              className="w-full object-cover"
            />
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
