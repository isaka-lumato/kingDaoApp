import { Metadata } from "next";
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

        {/* Logo / brand */}
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-brand flex items-center justify-center shadow-lg shadow-brand/30">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                className="w-6 h-6 text-white"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                />
              </svg>
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
      <div className="flex flex-1 items-center justify-center p-8 bg-background">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="flex lg:hidden items-center gap-3 mb-10">
            <div className="w-9 h-9 rounded-xl bg-brand flex items-center justify-center">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                className="w-5 h-5 text-white"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                />
              </svg>
            </div>
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
