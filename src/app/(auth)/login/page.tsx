import { Metadata } from "next";
import Image from "next/image";
import LoginForm from "./login-form";

export const metadata: Metadata = { title: "Sign In" };

export default function LoginPage() {
  return (
    <div className="flex min-h-screen w-full">
      {/* ── Left panel — branded hero ─────────────────────────────────────── */}
      <div className="hidden lg:flex lg:w-[55%] brand-gradient dot-grid relative flex-col justify-between p-12 overflow-hidden">
        {/* Glow orbs */}
        <div
          aria-hidden
          className="absolute -top-32 -left-32 w-96 h-96 rounded-full opacity-20"
          style={{
            background:
              "radial-gradient(circle, oklch(0.68 0.17 185) 0%, transparent 70%)",
          }}
        />
        <div
          aria-hidden
          className="absolute bottom-0 right-0 w-[500px] h-[500px] rounded-full opacity-10"
          style={{
            background:
              "radial-gradient(circle, oklch(0.68 0.17 185) 0%, transparent 70%)",
          }}
        />
        {/* Right-edge feather — the hero brightens toward the seam so it reaches
            into the form side rather than ending in a hard vertical cut. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-40"
          style={{
            background:
              "linear-gradient(to right, transparent 0%, oklch(0.68 0.17 185 / 0.10) 100%)",
          }}
        />

        {/* Logo / brand */}
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-xl bg-white flex items-center justify-center shadow-lg shadow-brand/30 p-1.5">
              <Image
                src="/KINGDAO_LOGO.png"
                alt="Kingdao Logistics"
                width={48}
                height={48}
                className="object-contain"
                priority
              />
            </div>
            <div>
              <p className="text-white font-bold text-lg leading-none tracking-wide">
                KINGDAO
              </p>
              <p className="text-brand text-xs font-medium tracking-widest uppercase">
                Logistics
              </p>
            </div>
          </div>
        </div>

        {/* Hero text */}
        <div className="relative z-10">
          <h1 className="text-5xl font-extrabold text-white leading-tight mb-6">
            Every consignment,
            <br />
            <span className="text-brand">every step.</span>
          </h1>
          <p className="text-slate-300 text-lg leading-relaxed max-w-md">
            Real-time visibility across the full customs clearance pipeline —
            from vessel arrival to final release. Built for the KDL team.
          </p>

          {/* Stats row */}
          <div className="mt-10 flex items-center gap-8">
            {[
              { value: "400+", label: "Consignments / yr" },
              { value: "11", label: "Pipeline stages" },
              { value: "48h", label: "Stuck-job alert" },
            ].map((stat) => (
              <div key={stat.label}>
                <p className="text-3xl font-bold text-white">{stat.value}</p>
                <p className="text-slate-400 text-sm mt-0.5">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Footer note */}
        <p className="relative z-10 text-slate-500 text-sm">
          © {new Date().getFullYear()} Kingdao Logistics · Tanzania
        </p>
      </div>

      {/* ── Right panel — sign-in form ────────────────────────────────────── */}
      <div className="relative flex flex-1 items-center justify-center p-8 bg-background overflow-hidden">
        {/* Connective tissue with the hero. A brand-tinted glow seeps in from
            the left seam and fades to nothing, so the dark hero "bleeds" into
            the light form side instead of meeting it at a hard line. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 hidden lg:block"
          style={{
            background:
              "radial-gradient(120% 120% at 0% 50%, oklch(0.68 0.17 185 / 0.14) 0%, oklch(0.68 0.17 185 / 0.05) 28%, transparent 55%)",
          }}
        />
        {/* Soft teal orb echoing the hero's glow orbs, anchored near the seam. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -left-40 top-1/2 -translate-y-1/2 w-[420px] h-[420px] rounded-full opacity-[0.07] hidden lg:block"
          style={{
            background:
              "radial-gradient(circle, oklch(0.68 0.17 185) 0%, transparent 70%)",
          }}
        />
        <div className="relative z-10 w-full max-w-md">
          {/* Mobile logo */}
          <div className="flex lg:hidden items-center gap-3 mb-10">
            <Image
              src="/KINGDAO_LOGO.png"
              alt="Kingdao Logistics"
              width={36}
              height={36}
              className="rounded-lg object-contain shrink-0"
              priority
            />
            <span className="font-bold text-lg text-foreground">
              KDL Tracker
            </span>
          </div>

          <div className="mb-8">
            <h2 className="text-3xl font-bold text-foreground tracking-tight">
              Welcome back
            </h2>
            <p className="text-muted-foreground mt-2">
              Sign in to your KDL Tracker account
            </p>
          </div>

          <LoginForm />

          <p className="mt-8 text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <span className="text-brand font-medium">
              Contact your administrator.
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
