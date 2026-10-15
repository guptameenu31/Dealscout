import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { getSpec } from "../api/client";
import type { SpecResponse } from "../api/client";
import type { WatchSpec } from "../api/types";
import { inr } from "../lib/format";
import { useSearch, type StepStatus } from "../lib/useSearch";
import { DescribeStep } from "../components/DescribeStep";
import { PageHeading } from "../components/PageHeading";
import { SearchProgress } from "../components/SearchProgress";
import { SearchResults } from "../components/SearchResults";
import { SpecStep } from "../components/SpecStep";

type Step = "describe" | "spec" | "results";

export default function Home() {
  const [step, setStep] = useState<Step>("describe");
  const [request, setRequest] = useState("");
  const [specRes, setSpecRes] = useState<SpecResponse | null>(null);
  const [specKey, setSpecKey] = useState(0);
  const search = useSearch();

  const specMut = useMutation({
    mutationFn: getSpec,
    onSuccess: (r) => {
      setSpecRes(r);
      setSpecKey((k) => k + 1);
      setStep("spec");
    },
  });

  const find = (spec: WatchSpec) => {
    setStep("results");
    void search.start(spec);
  };
  const reset = () => {
    specMut.reset();
    search.reset();
    setSpecRes(null);
    setStep("describe");
  };
  const backToSpec = () => {
    search.cancel();
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
        loading={false}
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

  const { state, models, failedMustHave, counts } = search;
  const spec = state.spec ?? specRes.spec;
  const detailSteps = Object.values(state.details);
  const detailsStatus: StepStatus = !detailSteps.length
    ? "idle"
    : detailSteps.some((d) => d.status === "loading")
      ? "loading"
      : detailSteps.some((d) => d.status === "error")
        ? "error"
        : "done";
  const starts = detailSteps.map((d) => d.startedAt ?? Infinity);
  const ends = detailSteps.map((d) => d.finishedAt ?? 0);
  const pricesDone = state.validate.status === "done";

  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="Step 03 — deal scout report"
        title={pricesDone ? "Here's what we found" : "Finding the right deal"}
        subtitle={
          <>
            Picks for <b className="capitalize text-slate-700">{spec.category}</b> under <b className="text-slate-700">{inr(spec.budget)}</b>
          </>
        }
      />
      <SearchProgress
        research={state.research}
        offers={state.offers}
        validate={state.validate}
        details={{
          status: detailsStatus,
          done: counts.detailsDone,
          failed: counts.detailsFailed,
          total: counts.total,
          startedAt: detailSteps.length ? Math.min(...starts) : undefined,
          finishedAt: detailsStatus === "loading" ? undefined : Math.max(...ends, 0) || undefined,
        }}
        onRetryResearch={search.retryResearch}
        onRetryOffers={search.retryOffers}
        onRetryValidate={search.retryValidate}
      />
      <SearchResults
        spec={spec}
        models={models}
        failedMustHave={failedMustHave}
        counts={counts}
        pricesCheckedAt={pricesDone ? (state.offers.data?.observedAt ?? null) : null}
        onBack={backToSpec}
        onRetryDetails={search.retryDetails}
      />
      {state.research.status === "error" && (
        <button type="button" onClick={backToSpec} className="text-sm font-medium text-indigo-600 hover:text-indigo-700">
          Edit your spec
        </button>
      )}
    </div>
  );
}
