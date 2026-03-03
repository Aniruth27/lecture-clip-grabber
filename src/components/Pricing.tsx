import { Check, Zap, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

const plans = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    description: "Perfect for trying BoardSnap AI",
    icon: Zap,
    features: [
      "3 videos per month",
      "Max 20 minutes per video",
      "ZIP export",
      "Image enhancement",
      "Duplicate removal",
    ],
    cta: "Start Free",
    href: "/signup",
    highlighted: false,
  },
  {
    name: "Pro",
    price: "$12",
    period: "per month",
    description: "For serious students and researchers",
    icon: Star,
    features: [
      "Unlimited videos",
      "Up to 2 hours per video",
      "Faster processing",
      "OCR text extraction",
      "PDF export option",
      "Job history (30 days)",
      "Priority support",
    ],
    cta: "Upgrade to Pro",
    href: "/signup?plan=pro",
    highlighted: true,
  },
];

const Pricing = () => {
  return (
    <section id="pricing" className="py-24 bg-background">
      <div className="container mx-auto">
        <div className="text-center mb-16">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-light px-3 py-1 text-xs font-medium text-primary mb-4">
            Simple Pricing
          </span>
          <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-4">
            Start free. Upgrade when you need it.
          </h2>
          <p className="text-muted-foreground text-lg max-w-xl mx-auto">
            No credit card required to get started.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl mx-auto">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`rounded-2xl p-8 flex flex-col ${
                plan.highlighted
                  ? "bg-gradient-hero text-primary-foreground shadow-glow relative"
                  : "glass-card"
              }`}
            >
              {plan.highlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="inline-flex items-center rounded-full bg-primary-foreground px-3 py-1 text-xs font-bold text-primary shadow-card">
                    Most Popular
                  </span>
                </div>
              )}

              <div className="mb-6">
                <div className={`inline-flex h-10 w-10 items-center justify-center rounded-xl mb-4 ${
                  plan.highlighted ? "bg-white/20" : "bg-primary-light"
                }`}>
                  <plan.icon className={`h-5 w-5 ${plan.highlighted ? "text-primary-foreground" : "text-primary"}`} />
                </div>
                <h3 className={`font-display text-xl font-bold mb-1 ${plan.highlighted ? "text-primary-foreground" : "text-foreground"}`}>
                  {plan.name}
                </h3>
                <p className={`text-sm mb-4 ${plan.highlighted ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                  {plan.description}
                </p>
                <div className="flex items-baseline gap-1">
                  <span className={`font-display text-4xl font-bold ${plan.highlighted ? "text-primary-foreground" : "text-foreground"}`}>
                    {plan.price}
                  </span>
                  <span className={`text-sm ${plan.highlighted ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                    /{plan.period}
                  </span>
                </div>
              </div>

              <ul className="space-y-3 mb-8 flex-1">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-center gap-2.5 text-sm">
                    <div className={`flex-shrink-0 h-5 w-5 rounded-full flex items-center justify-center ${
                      plan.highlighted ? "bg-white/20" : "bg-primary-light"
                    }`}>
                      <Check className={`h-3 w-3 ${plan.highlighted ? "text-primary-foreground" : "text-primary"}`} />
                    </div>
                    <span className={plan.highlighted ? "text-primary-foreground/90" : "text-foreground"}>
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>

              <Link to={plan.href}>
                <Button
                  className={`w-full font-semibold ${
                    plan.highlighted
                      ? "bg-primary-foreground text-primary hover:bg-primary-foreground/90 border-0"
                      : "btn-glow bg-primary text-primary-foreground border-0"
                  }`}
                >
                  {plan.cta}
                </Button>
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Pricing;
