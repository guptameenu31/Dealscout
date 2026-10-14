import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { getSpec, scout } from "../api/client";
import type { SpecResponse } from "../api/client";
import type { ScoutMode, ScoutResponse, WatchSpec } from "../api/types";
import { inr } from "../lib/format";
import { DescribeStep } from "../components/DescribeStep";
import { ErrorState } from "../components/ErrorState";
import { ProgressChecklist } from "../components/ProgressChecklist";
import { PageHeading } from "../components/PageHeading";
import { Results } from "../components/Results";
import { SpecStep } from "../components/SpecStep";

type Step = "describe" | "spec" | "results";

export default function Home() {
  const [step, setStep] = useState<Step>("describe");
  const [request, setRequest] = useState("");
  const [specRes, setSpecRes] = useState<SpecResponse | null>(null);
  const [result, setResult] = useState<ScoutResponse | null>(null);
  const [lastRun, setLastRun] = useState<{ spec: WatchSpec; mode: ScoutMode } | null>(null);
  const [specKey, setSpecKey] = useState(0);

  const specMut = useMutation({
    mutationFn: getSpec,
    onSuccess: (r) => {
      setSpecRes(r);
      setSpecKey((k) => k + 1);
      setStep("spec");
    },
  });
  const scoutMut = useMutation({
    mutationFn: (v: { spec: WatchSpec; mode: ScoutMode }) => scout(v.spec, v.mode),
    onSuccess: (r) => setResult(r),
  });

  const find = (spec: WatchSpec, mode: ScoutMode) => {
    setLastRun({ spec, mode });
    setResult(null);
    setStep("results");
    scoutMut.mutate({ spec, mode });
  };
  const reset = () => {
    specMut.reset();
    scoutMut.reset();
    setSpecRes(null);
    setResult(null);
    setStep("describe");
  };
  const backToSpec = () => {
    scoutMut.reset();
    setStep("spec");
  };

  if (step === "describe" || !specRes) {
    return (
      <DescribeStep
        initial={request}
        loading={specMut.isPending}
        error={specMut.error?.message ?? null}
        onSubmit={(r) => {
          setRequest(r);
          specMut.mutate(r);
        }}
      />
    );
  }

  if (step === "spec") {
    return (
      <SpecStep
        key={specKey}
        response={specRes}
        loading={scoutMut.isPending}
        clarifying={specMut.isPending}
        error={specMut.error?.message ?? null}
        onClarify={(answer) => {
          const next = `${request} ${answer}`.trim();
          setRequest(next);
          specMut.mutate(next);
        }}
        onFind={find}
        onReset={reset}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="Step 03 — deal scout report"
        title={result ? "Here's what we found" : "Finding the right deal"}
        subtitle={
          result ? (
            <>
              Matches for <b className="text-slate-700 capitalize">{result.spec.category}</b> under <b className="text-slate-700">{inr(result.spec.budget)}</b>
            </>
          ) : (
            "We're checking the details before we make a recommendation."
          )
        }
      />
      {scoutMut.isPending && <ProgressChecklist />}
      {scoutMut.isError && (
        <div className="space-y-3">
          <ErrorState message={scoutMut.error.message} onRetry={() => lastRun && find(lastRun.spec, lastRun.mode)} />
          <button type="button" onClick={backToSpec} className="text-sm font-medium text-indigo-600 hover:text-indigo-700">
            Edit your spec
          </button>
        </div>
      )}
      {result && (
        <Results
          result={result}
          onBack={backToSpec}
          retrying={scoutMut.isPending}
          onTryLive={result.provenance !== "live" && lastRun ? () => find(lastRun.spec, "live") : undefined}
        />
      )}
    </div>
  );
}
