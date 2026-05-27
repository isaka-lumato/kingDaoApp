"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { loginSchema, type LoginInput } from "@/schemas/auth";
import { loginAction } from "@/server/actions/auth";

export default function LoginForm() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: standardSchemaResolver(loginSchema),
  });

  function onSubmit(data: LoginInput) {
    setServerError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("email", data.email);
      fd.set("password", data.password);
      const result = await loginAction(fd);
      if (result && "error" in result) {
        setServerError(result.error);
      }
      // On success, loginAction calls redirect() — no result returned.
    });
  }

  return (
    <form
      id="login-form"
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-5"
      noValidate
    >
      {/* Server-level error banner */}
      {serverError && (
        <div
          role="alert"
          id="login-error-banner"
          className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/8 px-4 py-3 text-sm text-destructive"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            className="w-4 h-4 mt-0.5 shrink-0"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {serverError}
        </div>
      )}

      {/* Email */}
      <div className="space-y-1.5">
        <label
          htmlFor="login-email"
          className="block text-sm font-medium text-foreground"
        >
          Email address
        </label>
        <input
          id="login-email"
          type="email"
          autoComplete="email"
          autoFocus
          placeholder="you@kingdao.co.tz"
          {...register("email")}
          className={[
            "w-full rounded-lg border bg-background px-4 py-2.5 text-sm text-foreground",
            "placeholder:text-muted-foreground/60",
            "transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
            errors.email
              ? "border-destructive focus:ring-destructive/50"
              : "border-input hover:border-muted-foreground/40",
          ].join(" ")}
          aria-describedby={errors.email ? "login-email-error" : undefined}
          aria-invalid={!!errors.email}
          disabled={isPending}
        />
        {errors.email && (
          <p
            id="login-email-error"
            role="alert"
            className="text-xs text-destructive mt-1"
          >
            {errors.email.message}
          </p>
        )}
      </div>

      {/* Password */}
      <div className="space-y-1.5">
        <label
          htmlFor="login-password"
          className="block text-sm font-medium text-foreground"
        >
          Password
        </label>
        <input
          id="login-password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          {...register("password")}
          className={[
            "w-full rounded-lg border bg-background px-4 py-2.5 text-sm text-foreground",
            "placeholder:text-muted-foreground/60",
            "transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
            errors.password
              ? "border-destructive focus:ring-destructive/50"
              : "border-input hover:border-muted-foreground/40",
          ].join(" ")}
          aria-describedby={
            errors.password ? "login-password-error" : undefined
          }
          aria-invalid={!!errors.password}
          disabled={isPending}
        />
        {errors.password && (
          <p
            id="login-password-error"
            role="alert"
            className="text-xs text-destructive mt-1"
          >
            {errors.password.message}
          </p>
        )}
      </div>

      {/* Submit */}
      <button
        id="login-submit-btn"
        type="submit"
        disabled={isPending}
        className={[
          "w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground",
          "transition-all duration-150",
          "hover:opacity-90 active:scale-[0.98]",
          "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
          "disabled:opacity-60 disabled:cursor-not-allowed",
          "flex items-center justify-center gap-2",
        ].join(" ")}
      >
        {isPending ? (
          <>
            <svg
              className="w-4 h-4 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth={3}
                strokeDasharray="32"
                strokeDashoffset="12"
              />
            </svg>
            Signing in…
          </>
        ) : (
          "Sign in"
        )}
      </button>
    </form>
  );
}
