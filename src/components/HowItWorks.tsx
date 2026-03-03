import { Link, Video, Download } from "lucide-react";

const steps = [
  {
    number: "01",
    icon: Link,
    title: "Paste Your Link",
    description: "Copy any YouTube lecture URL and paste it into BoardSnap. We support any public lecture or educational video.",
    color: "primary",
  },
  {
    number: "02",
    icon: Video,
    title: "AI Extracts Notes",
    description: "Our AI scans every frame, detects whiteboard and slide content, removes duplicates, and enhances image quality.",
    color: "accent",
  },
  {
    number: "03",
    icon: Download,
    title: "Download Your ZIP",
    description: "Get a clean ZIP file with all your organized notes — ready to study, share, or import into any notes app.",
    color: "primary",
  },
];

const HowItWorks = () => {
  return (
    <section id="how-it-works" className="py-24 bg-background">
      <div className="container mx-auto">
        <div className="text-center mb-16">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-light px-3 py-1 text-xs font-medium text-primary mb-4">
            Simple Process
          </span>
          <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-4">
            Three steps to better notes
          </h2>
          <p className="text-muted-foreground text-lg max-w-xl mx-auto">
            No setup, no downloads. Just paste a link and let AI do the heavy lifting.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
          {/* Connector line */}
          <div className="hidden md:block absolute top-12 left-1/6 right-1/6 h-px bg-gradient-to-r from-transparent via-border to-transparent" />

          {steps.map((step, i) => (
            <div key={i} className="flex flex-col items-center text-center group animate-fade-in-up" style={{ animationDelay: `${i * 0.15}s` }}>
              <div className="relative mb-6">
                <div className="step-badge h-12 w-12 rounded-full flex items-center justify-center text-sm font-bold mb-0 relative z-10">
                  {step.number}
                </div>
              </div>
              <div className="feature-card p-6 w-full">
                <div className={`inline-flex h-12 w-12 items-center justify-center rounded-xl mb-4 ${
                  step.color === "accent" ? "bg-accent-light" : "bg-primary-light"
                }`}>
                  <step.icon className={`h-6 w-6 ${step.color === "accent" ? "text-accent" : "text-primary"}`} />
                </div>
                <h3 className="font-display font-semibold text-lg mb-2">{step.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{step.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;
