import { Layers, ScanLine, Sparkles, FileArchive, FileText, Zap } from "lucide-react";

const features = [
  {
    icon: Layers,
    title: "Duplicate Removal",
    description: "Perceptual hashing detects and removes near-duplicate frames so you only get unique board states.",
    badge: "Smart",
    color: "primary",
  },
  {
    icon: ScanLine,
    title: "Board Detection",
    description: "Edge detection and contrast analysis identify exactly which frames contain written content.",
    badge: "AI-Powered",
    color: "accent",
  },
  {
    icon: Sparkles,
    title: "Image Enhancement",
    description: "Each frame is auto-enhanced: grayscale, contrast boost, and sharpening for OCR-ready output.",
    badge: "Enhanced",
    color: "primary",
  },
  {
    icon: FileArchive,
    title: "ZIP Export",
    description: "All extracted frames are packaged into a clean, organized ZIP file ready to download instantly.",
    badge: "Export",
    color: "accent",
  },
  {
    icon: FileText,
    title: "OCR Text Extraction",
    description: "Optional: extract all written text into a TXT file bundled inside your ZIP for searchable notes.",
    badge: "Optional",
    color: "primary",
  },
  {
    icon: Zap,
    title: "Fast Processing",
    description: "Background queue processing means your video is analyzed in minutes, even for long lectures.",
    badge: "Fast",
    color: "accent",
  },
];

const Features = () => {
  return (
    <section id="features" className="py-24 section-alt">
      <div className="container mx-auto">
        <div className="text-center mb-16">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-light px-3 py-1 text-xs font-medium text-accent mb-4">
            Powerful Features
          </span>
          <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-4">
            Everything you need for lecture notes
          </h2>
          <p className="text-muted-foreground text-lg max-w-xl mx-auto">
            Purpose-built for students who want clean, organized study materials without the manual work.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, i) => (
            <div key={i} className="feature-card p-6 animate-fade-in-up" style={{ animationDelay: `${i * 0.08}s` }}>
              <div className="flex items-start gap-4">
                <div className={`flex-shrink-0 inline-flex h-11 w-11 items-center justify-center rounded-xl ${
                  feature.color === "accent" ? "bg-accent-light" : "bg-primary-light"
                }`}>
                  <feature.icon className={`h-5 w-5 ${feature.color === "accent" ? "text-accent" : "text-primary"}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-display font-semibold text-base">{feature.title}</h3>
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      feature.color === "accent"
                        ? "bg-accent-light text-accent"
                        : "bg-primary-light text-primary"
                    }`}>
                      {feature.badge}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Features;
